'use server';

import { buildGiftItems, compareVariantOrder, getProductTiers, pickPriceFromTiers, supabaseAdmin } from '@/lib/supabase';
import { applyDiscountCode, isBankTransferAvailable, isEcpayAtmAvailable, isEcpayAvailable, isLinePayAvailable, startLinePay, type ApplyDiscountResult, type StartLinePayResult } from '../../[slug]/checkout/actions';
import { lineClient } from '@/lib/line';
import { bankTransferFromRow, formatBankTransferText, type BankTransfer } from '@/lib/bank-transfer';
import { codAllowed, codPaymentPublicFromRow, COD_NOT_ALLOWED_ERROR, cvsStoreText, type CodPaymentPublic, type CvsChain } from '@/lib/cvs';
import type { messagingApi } from '@line/bot-sdk';
import { checkCartGroupBuy, getGroupBuyState, type GroupBuyState, type ProductChannel } from '@/lib/groupbuy';

const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID!;
const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

async function verifyIdToken(idToken: string): Promise<string> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: LIFF_CHANNEL_ID,
  });
  const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LIFF token 驗證失敗: ${text}`);
  }
  const data = (await resp.json()) as { sub?: string };
  if (!data.sub) throw new Error('LIFF token 缺 sub');
  return data.sub;
}

// Phase 11(Stage C):variants 帶進 LIFF shop
export type ShopVariant = {
  id: string;
  variant_name: string;
  price_twd: number;
  stock: number;
  image_url: string | null; // 批次 C #5:選規格切圖
  is_bundle: boolean; // Phase 16.4:組合品(固定價,不參與分階)
};

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  price_twd: number;
  image_url: string | null;
  media: { type: 'image' | 'video'; url: string }[]; // Phase 9.6
  category: string | null;
  badge: string | null; // 批次 C #9:卡片角標
  badge_color: string | null; // Phase 15.2:角標顏色(null = 預設橙棕)
  // 2026-09-03:限時優惠接進 LIFF(原本只有公開商城有)
  sale_discount_pct: number | null;
  sale_start_at: string | null;
  sale_end_at: string | null;
  stock: number;
  variants: ShopVariant[]; // Phase 11:variant-aware
  // 2026-09-11(回饋 #9):分階定價帶進 LIFF,卡片顯示「NT$ 單價 / 分階總價」
  tiers: { min_qty: number; price_twd: number }[]; // min_qty asc
  // Phase 16.2(2026-09-18):手動排序值(null = 沒排過,排最後)
  sort_order: number | null;
  // 2026-09-18:「最新」chip 照上架時間排(原本 LIFF 查詢是分類序,最新跟全部長一樣)
  created_at: string;
  // Phase 35(2026-11-07):攤位 / 團購分頁用;track_stock=false 時庫存當無限
  channel: ProductChannel;
  track_stock: boolean;
};

export type ShopMember = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
};

// 批次 D #13:運費規則(tenants.shipping_rules jsonb;null = 不收運費)
// Phase 29:cvs = 超商店到店;Phase 36(2026-11-08)起 LINE 商店也能選(填門市店名 + 店號)
export type ShippingOption = {
  key: string;
  label: string;
  fee: number;
  free_over?: number;
  cvs?: CvsChain;
  note?: string;
};

export type ShopTenant = {
  name: string;
  logo_url: string | null;
  banners: { type: 'image' | 'video'; url: string }[]; // Phase 9.8 多媒體 carousel
  payment_info: string | null; // 舊的一整段文字,bank_transfer 沒填時的備用
  bank_transfer: BankTransfer | null; // Phase 28:分欄的匯款資訊
  contact_info: string | null; // 2026-09-11(回饋 #13):商城底部顯示聯絡資訊
  disclaimer: string | null; // Phase 32:商店聲明(品牌關係),底部顯示
  shop_bg_color: string | null; // 批次 C #7:商城底色
  brand_color: string | null; // 2026-10-23:品牌色,LIFF 也用 lib/theme 算整套配色
  category_order: string[]; // 批次 C #8:分類顯示順序
  shipping_options: ShippingOption[]; // 空陣列 = 不收運費
  // Phase 16(#12):滿額贈(product_name 已解析好給前端直接顯示)
  // Phase 18(2026-10-16):加 mode / repeat,進度顯示才會跟實際送的一致
  gift_mode: 'stack' | 'highest';
  gift_rules: { threshold_twd: number; qty: number; product_name: string; repeat: boolean }[];
  // Phase 33 補(2026-11-07):攤位有啟用中的折扣碼才在結帳顯示輸入格
  has_discount_codes: boolean;
  // Phase 36(2026-11-08):超商取貨付款(攤主有開才有;要不要顯示還要看配送與金額,用 lib/cvs 的 codAllowed)
  cod_payment: CodPaymentPublic | null;
};

export type ShopData = {
  products: ShopProduct[];
  member: ShopMember | null;
  tenant: ShopTenant;
  // 2026-09-11(回饋 #10):這個客人上一筆訂單的收件資訊,結帳預填(不動會員資料)
  lastShipping: { recipient: string | null; phone: string | null; address: string | null } | null;
  // Phase 35(2026-11-07):目前的團 / 上一團(LINE 好友自動算追蹤,LIFF 不做門)
  groupBuy: GroupBuyState;
};

/**
 * 確保 user 在 DB 內(沒加 bot 好友也建檔)。同 /m/checkin pattern。
 */
async function ensureUser(
  lineUserId: string,
  displayName: string | null,
  pictureUrl: string | null,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabaseAdmin.from('users').insert({
    tenant_id: TENANT_ID,
    line_user_id: lineUserId,
    display_name: displayName,
    picture_url: pictureUrl,
    status: 'active',
  });
  if (error) console.error('[shop ensureUser]', error);
}

/**
 * 一次拉商品 list + 用戶會員資料(預填結帳)。
 * 若 user 不存在自動建檔(用 LIFF getProfile 帶來的名稱 / 頭像)。
 */
export async function loadShopData(
  idToken: string,
  displayName: string | null = null,
  pictureUrl: string | null = null,
): Promise<ShopData> {
  const lineUserId = await verifyIdToken(idToken);
  await ensureUser(lineUserId, displayName, pictureUrl);

  const [productsRes, memberRes, tenantRes, tiersRes, groupBuy] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, description, price_twd, image_url, media, category, badge, badge_color, sale_discount_pct, sale_start_at, sale_end_at, sort_order, created_at, stock, channel, track_stock, product_variants(id, variant_name, price_twd, stock, image_url, is_bundle, status, sort_order)')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'active')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('users')
      .select('id, full_name, phone, address')
      .eq('tenant_id', TENANT_ID)
      .eq('line_user_id', lineUserId)
      .maybeSingle(),
    supabaseAdmin
      .from('tenants')
      .select('name, logo_url, og_image_url, banners, payment_info, bank_transfer, contact_info, disclaimer, shop_bg_color, brand_color, category_order, shipping_rules, gift_rules, cod_payment')
      .eq('id', TENANT_ID)
      .maybeSingle(),
    // 2026-09-11(回饋 #9):一次撈整攤的分階定價(量小,免 per-product 查)
    supabaseAdmin
      .from('product_price_tiers')
      .select('product_id, min_qty, price_twd')
      .eq('tenant_id', TENANT_ID)
      .order('min_qty', { ascending: true }),
    // Phase 35:團購狀態
    getGroupBuyState(TENANT_ID),
  ]);

  // 2026-09-11(回饋 #10):抓這個客人最近一筆有地址的訂單,結帳預填
  const memberId = (memberRes.data as { id?: string } | null)?.id ?? null;
  let lastShipping: ShopData['lastShipping'] = null;
  if (memberId) {
    const { data: lastOrder } = await supabaseAdmin
      .from('orders')
      .select('shipping_recipient, shipping_phone, shipping_address')
      .eq('tenant_id', TENANT_ID)
      .eq('user_id', memberId)
      .not('shipping_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOrder) {
      const lo = lastOrder as { shipping_recipient: string | null; shipping_phone: string | null; shipping_address: string | null };
      lastShipping = { recipient: lo.shipping_recipient, phone: lo.shipping_phone, address: lo.shipping_address };
    }
  }

  const tiersByProduct = new Map<string, { min_qty: number; price_twd: number }[]>();
  for (const t of (tiersRes.data as { product_id: string; min_qty: number; price_twd: number }[] | null) ?? []) {
    const arr = tiersByProduct.get(t.product_id) ?? [];
    arr.push({ min_qty: t.min_qty, price_twd: t.price_twd });
    tiersByProduct.set(t.product_id, arr);
  }

  // Phase 16(#12):滿額贈規則 → 解析贈品名稱給前端顯示(贈品已下架就不顯示)
  const productNameById = new Map(
    (((productsRes.data ?? []) as { id: string; name: string }[])).map((p) => [p.id, p.name]),
  );

  if (productsRes.error) {
    console.error('[loadShopData products]', productsRes.error);
    throw new Error('讀取商品失敗');
  }

  type MediaItem = { type: 'image' | 'video'; url: string };
  type TenantRow = {
    name: string;
    logo_url: string | null;
    og_image_url: string | null;
    banners: MediaItem[] | null;
    payment_info: string | null;
    bank_transfer: unknown;
    contact_info: string | null;
    disclaimer: string | null;
    shop_bg_color: string | null;
    brand_color: string | null;
    category_order: string[] | null;
    shipping_rules: { options?: ShippingOption[] } | null;
    gift_rules: {
      mode?: string;
      rules?: { threshold_twd: number; product_id: string; qty: number; repeat?: boolean }[];
    } | null;
    cod_payment: unknown; // Phase 36
  } | null;
  const t = (tenantRes.data as TenantRow) ?? null;
  // Phase 9.8 多 banner + fallback og_image_url(舊單張)
  const tenantBanners: MediaItem[] = Array.isArray(t?.banners) && t.banners.length > 0
    ? t.banners
    : t?.og_image_url
      ? [{ type: 'image', url: t.og_image_url }]
      : [];

  // Phase 33 補(2026-11-07):有沒有啟用中的折扣碼(只看有沒有,不把碼送到前端)
  const { data: dcRows } = await supabaseAdmin
    .from('discount_codes')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('enabled', true)
    .limit(1);

  type ProductRow = Omit<ShopProduct, 'channel' | 'track_stock'> & {
    channel: string | null;
    track_stock: boolean | null;
    product_variants?: { id: string; variant_name: string; price_twd: number; stock: number; image_url: string | null; is_bundle: boolean | null; status: string; sort_order: number | null }[] | null;
  };
  return {
    products: ((productsRes.data ?? []) as unknown as ProductRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price_twd: p.price_twd,
      image_url: p.image_url,
      media: Array.isArray(p.media) ? p.media : [],
      category: p.category,
      badge: p.badge ?? null,
      badge_color: p.badge_color ?? null,
      sale_discount_pct: p.sale_discount_pct ?? null,
      sale_start_at: p.sale_start_at ?? null,
      sale_end_at: p.sale_end_at ?? null,
      stock: p.stock,
      // Phase 19:依攤主排的順序(也決定商品 modal 預設選中哪個規格)
      variants: (p.product_variants ?? [])
        .filter((v) => v.status === 'active')
        .sort(compareVariantOrder)
        .map((v) => ({ id: v.id, variant_name: v.variant_name, price_twd: v.price_twd, stock: v.stock, image_url: v.image_url ?? null, is_bundle: v.is_bundle ?? false })),
      tiers: tiersByProduct.get(p.id) ?? [],
      sort_order: p.sort_order ?? null,
      created_at: p.created_at,
      channel: p.channel === 'groupbuy' ? 'groupbuy' : 'stall',
      track_stock: p.track_stock !== false,
    })),
    member: (memberRes.data as ShopMember | null) ?? null,
    tenant: {
      name: t?.name ?? '商品專區',
      logo_url: t?.logo_url ?? null,
      banners: tenantBanners,
      payment_info: t?.payment_info ?? null,
      bank_transfer: bankTransferFromRow(t?.bank_transfer),
      contact_info: t?.contact_info ?? null,
      disclaimer: t?.disclaimer?.trim() || null,
      shop_bg_color: t?.shop_bg_color ?? null,
      brand_color: t?.brand_color ?? null,
      category_order: Array.isArray(t?.category_order) ? t.category_order : [],
      // Phase 29 第一階段 LIFF 濾掉店到店;Phase 36(2026-11-08)起有選門市的畫面了,全部給
      shipping_options: Array.isArray(t?.shipping_rules?.options) ? t.shipping_rules.options : [],
      has_discount_codes: (dcRows?.length ?? 0) > 0,
      cod_payment: codPaymentPublicFromRow(t?.cod_payment),
      gift_mode: (t?.gift_rules?.mode === 'highest' ? 'highest' : 'stack') as 'stack' | 'highest',
      gift_rules: (t?.gift_rules?.rules ?? [])
        .filter((r) => r && r.threshold_twd > 0 && productNameById.has(r.product_id))
        .map((r) => ({
          threshold_twd: r.threshold_twd,
          qty: Math.max(1, r.qty || 1),
          product_name: productNameById.get(r.product_id)!,
          repeat: !!r.repeat,
        }))
        .sort((a, b) => a.threshold_twd - b.threshold_twd),
    },
    lastShipping,
    groupBuy,
  };
}

/**
 * 學員在 LIFF /m/shop 入口填基本資料(gate),回傳新的 member。
 */
export async function saveShopProfile(formData: FormData): Promise<ShopMember> {
  const idToken = String(formData.get('idToken') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim() || null;
  const memberId = String(formData.get('member_id') ?? '').trim() || null;
  const referrerMemberId =
    String(formData.get('referrer_member_id') ?? '').trim() || null;

  if (!idToken) throw new Error('缺 LIFF token');
  if (!fullName) throw new Error('請填真實姓名');
  if (!phone) throw new Error('請填電話');

  const lineUserId = await verifyIdToken(idToken);
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      full_name: fullName,
      phone,
      address,
      member_id: memberId,
      referrer_member_id: referrerMemberId,
      status: 'active',
    })
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId);

  if (error) {
    console.error('[saveShopProfile]', error);
    throw new Error('儲存失敗:' + error.message);
  }

  return { full_name: fullName, phone, address };
}

// Phase 11(Stage C):cart 以 variant_id 為主,product_id 留作 reference
export type CartItem = { product_id: string; variant_id: string; qty: number };

/**
 * 建單:
 * 1. verify idToken → userId
 * 2. server-side fetch product 真實價格(snapshot,不信 client 傳)
 * 3. insert orders → trigger 自動產 order_no
 * 4. insert order_items → trigger 自動更新 total_twd + 寫 stock_movements
 * 5. return order_no
 */
export async function placeOrder(
  formData: FormData,
): Promise<{ order_no: string }> {
  const idToken = String(formData.get('idToken'));
  const lineUserId = await verifyIdToken(idToken);

  const cartJson = String(formData.get('cart') || '[]');
  const cart = JSON.parse(cartJson) as CartItem[];
  const recipient = String(formData.get('recipient') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const shippingMethod = String(formData.get('shipping_method') || '').trim();
  // Phase 36(2026-11-08):超商店到店選的門市(跟網站結帳同一套欄位與驗證)
  const cvsStoreName = String(formData.get('cvs_store_name') || '').trim().slice(0, 40);
  const cvsStoreId = String(formData.get('cvs_store_id') || '').trim().replace(/\s+/g, '');
  // 2026-09-11 v2:統編專用欄位移除 — 需要統編的客人直接寫在備註
  const note = String(formData.get('note') || '').trim();
  // Phase 33 補(2026-11-07):折扣碼只收文字,金額 server 重算
  const discountCodeRaw = String(formData.get('discount_code') || '').trim();
  // 2026-10-16:付款方式 — 'line_pay' 走線上付款,其餘一律匯款(bank)
  // 2026-10-22:加綠界 'ecpay_atm' / 'ecpay_credit';攤位沒開綠界就退回匯款
  // Phase 36:'cod' 超商取貨付款要等配送與金額算完才能判,在下面另外處理
  const rawPayment = String(formData.get('payment_method') || '').trim();
  let paymentMethod: string =
    rawPayment === 'line_pay'
      ? 'line_pay'
      : rawPayment === 'ecpay_credit' && (await isEcpayAvailableLiff())
        ? 'ecpay_credit'
        : rawPayment === 'ecpay_atm' && (await isEcpayAtmAvailableLiff())
          ? 'ecpay_atm'
          : 'bank';

  if (cart.length === 0) throw new Error('購物車是空的');
  // 地址:店到店用門市代替,下面決定配送方式時再檢查
  if (!recipient || !phone) throw new Error('收件人 / 電話 必填');

  // 找 user
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (userErr || !user) throw new Error('用戶不存在,請先加好友');

  // 2026-09-21 防重複下單:同客人 2 分鐘內送出「內容完全相同」的單(手機網路慢
  // 造成的雙擊/重送),直接回第一筆的單號,不再建新單、不重複扣庫存
  const cartSig = cart.map((c) => `${c.variant_id}x${c.qty}`).sort().join(',');
  const { data: recentDup } = await supabaseAdmin
    .from('orders')
    .select('order_no, order_items(variant_id, qty)')
    .eq('tenant_id', TENANT_ID)
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentDup) {
    const dup = recentDup as { order_no: string; order_items: { variant_id: string | null; qty: number }[] | null };
    const dupSig = (dup.order_items ?? []).map((i) => `${i.variant_id}x${i.qty}`).sort().join(',');
    if (dupSig === cartSig) {
      console.warn('[placeOrder] 2 分鐘內重複下單,回既有單號', dup.order_no);
      return { order_no: dup.order_no };
    }
  }

  // Phase 11(Stage C):server 拉 variant 真實價格 + 庫存(不信 client)
  const variantIds = cart.map((c) => c.variant_id).filter(Boolean);
  if (variantIds.length === 0 || variantIds.length !== cart.length) {
    throw new Error('購物車格式錯誤');
  }
  const { data: variants, error: variantsErr } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, price_twd, status, stock, is_bundle, products(channel, track_stock)')
    .in('id', variantIds)
    .eq('tenant_id', TENANT_ID);
  if (variantsErr || !variants) throw new Error('讀取變體失敗');
  if (variants.length !== variantIds.length) throw new Error('部分變體不存在');
  // Phase 35:track_stock=false 的商品不檢查庫存(trigger 也不扣)
  type VRow = { id: string; product_id: string; price_twd: number; status: string; stock: number; is_bundle: boolean; products: { channel: string | null; track_stock: boolean | null } | null };
  for (const v of variants as unknown as VRow[]) {
    if (v.status !== 'active') throw new Error('部分變體已下架');
    if (v.products?.track_stock === false) continue;
    const cartItem = cart.find((c) => c.variant_id === v.id);
    if (cartItem && cartItem.qty > v.stock) {
      throw new Error(`規格庫存不足(剩 ${v.stock})`);
    }
  }

  // Phase 35(2026-11-07):有團購商品 → 團必須還在收單中,否則整張擋下(錯誤文案直接給客人看);通過就記下屬於哪一團
  const gbCheck = await checkCartGroupBuy(TENANT_ID, [...new Set((variants as unknown as VRow[]).map((v) => v.product_id))]);
  if (!gbCheck.ok) throw new Error(gbCheck.error);
  const groupBuyId = gbCheck.groupBuyId;

  // 2026-09-03:結帳單價套 sale + tier(跟公開商城 createOrder 同邏輯,原本 LIFF 照原價收錢)
  // 優先級:sale 生效 → % off 通殺;否則 tier(同 product 整單 qty 算)
  const qtyByProduct = new Map<string, number>();
  for (const c of cart) {
    const v = (variants as unknown as VRow[]).find((vv) => vv.id === c.variant_id);
    // Phase 16.4:組合品數量不計入分階門檻
    if (v && !v.is_bundle) qtyByProduct.set(v.product_id, (qtyByProduct.get(v.product_id) ?? 0) + c.qty);
  }
  const productIds = Array.from(qtyByProduct.keys());
  const { data: saleRows } = await supabaseAdmin
    .from('products')
    .select('id, sale_discount_pct, sale_start_at, sale_end_at')
    .in('id', productIds);
  const saleByProduct = new Map<string, { pct: number | null; start: string | null; end: string | null }>();
  for (const row of (saleRows as { id: string; sale_discount_pct: number | null; sale_start_at: string | null; sale_end_at: string | null }[] | null) ?? []) {
    saleByProduct.set(row.id, { pct: row.sale_discount_pct, start: row.sale_start_at, end: row.sale_end_at });
  }
  const tierByProduct = new Map<string, { min_qty: number; price_twd: number }[]>();
  await Promise.all(
    productIds.map(async (pid) => {
      const tiers = await getProductTiers(pid);
      tierByProduct.set(pid, tiers.map((t) => ({ min_qty: t.min_qty, price_twd: t.price_twd })));
    }),
  );
  const now = new Date();
  const effectivePrice = (v: VRow, qty: number): number => {
    const sale = saleByProduct.get(v.product_id);
    const saleActive =
      !!sale && sale.pct !== null && sale.pct > 0 && sale.start && sale.end &&
      now >= new Date(sale.start) && now < new Date(sale.end);
    if (saleActive) return Math.round((v.price_twd * (100 - sale!.pct!)) / 100);
    // Phase 16.4:組合品固定價,不被分階改寫
    if (v.is_bundle) return v.price_twd;
    const totalQty = qtyByProduct.get(v.product_id) ?? qty;
    return pickPriceFromTiers(tierByProduct.get(v.product_id) ?? [], totalQty, v.price_twd);
  };
  // 折後小計(免運門檻與通知金額都用這個)
  const pricedSubtotal = cart.reduce((sum, c) => {
    const v = (variants as unknown as VRow[]).find((vv) => vv.id === c.variant_id);
    return sum + (v ? effectivePrice(v, c.qty) : 0) * c.qty;
  }, 0);

  // D#13:運費 server 端重算(不信 client)。tenant 沒設規則 = 0;Phase 36 順便拉 cod_payment 判取貨付款
  const { data: tRow } = await supabaseAdmin
    .from('tenants')
    .select('shipping_rules, cod_payment')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const shipOptions =
    ((tRow as { shipping_rules?: { options?: ShippingOption[] } | null } | null)?.shipping_rules
      ?.options ?? []) as ShippingOption[];
  let shippingFee = 0;
  let shippingKey: string | null = null;
  let cvsType: CvsChain | null = null;
  let finalAddress = address;
  if (shipOptions.length > 0) {
    const opt = shipOptions.find((o) => o.key === shippingMethod);
    if (!opt) throw new Error('請選擇配送方式');
    shippingFee = opt.free_over && pricedSubtotal >= opt.free_over ? 0 : opt.fee;
    shippingKey = opt.key;
    // Phase 36:店到店 — 門市必填,地址用門市字串代替(跟網站結帳 createOrder 同一套)
    if (opt.cvs) {
      if (!cvsStoreName) throw new Error('請填取貨門市名稱');
      if (!/^\d{3,10}$/.test(cvsStoreId)) throw new Error('請填門市店號(3 到 10 位數字)');
      cvsType = opt.cvs;
      finalAddress = cvsStoreText(opt.cvs, cvsStoreName, cvsStoreId);
    } else if (opt.key === 'pickup') {
      finalAddress = finalAddress || '門市自取';
    } else if (!finalAddress) {
      throw new Error('請填寄送地址');
    }
  } else if (!finalAddress) {
    throw new Error('請填寄送地址');
  }

  // Phase 33 補(2026-11-07):折扣碼 — 走網站結帳同一支驗證與計算(定價邏輯相同,小計一致);
  // 只折商品小計,免運與滿額贈看折扣前。驗不過整張不建單,錯誤文案直接丟給客人看。
  let discountCode: string | null = null;
  let discountTwd = 0;
  if (discountCodeRaw) {
    const slug = await tenantSlug();
    if (!slug) throw new Error('攤位不存在');
    const dc = await applyDiscountCode(slug, discountCodeRaw, cart.map((c) => ({ variantId: c.variant_id, qty: c.qty })), phone);
    if (!dc.ok) throw new Error(dc.error);
    discountCode = dc.code;
    discountTwd = Math.min(dc.discount_twd, pricedSubtotal);
  }

  // Phase 36:超商取貨付款 — 配送是店到店、攤主有開、應付(含運)沒超上限才收;不符整張擋下,不默默改成匯款
  if (rawPayment === 'cod') {
    const codCfg = codPaymentPublicFromRow((tRow as { cod_payment?: unknown } | null)?.cod_payment);
    if (!codAllowed(codCfg, !!cvsType, pricedSubtotal - discountTwd + shippingFee)) throw new Error(COD_NOT_ALLOWED_ERROR);
    paymentMethod = 'cod';
  }

  // insert order(order_no / total_twd 由 trigger 自動;折扣另存,應付 = orderPayable)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      tenant_id: TENANT_ID,
      user_id: user.id,
      order_no: '',
      payment_method: paymentMethod,
      source: 'liff', // 2026-09-21:原本沒寫入,LIFF 單在後台一直顯示「手動」
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: finalAddress,
      shipping_method: shippingKey,
      shipping_fee_twd: shippingFee,
      // Phase 36:店到店的門市(宅配 / 自取為 null)
      cvs_type: cvsType,
      cvs_store_id: cvsType ? cvsStoreId : null,
      cvs_store_name: cvsType ? cvsStoreName : null,
      note: note || null,
      discount_code: discountCode,
      discount_twd: discountTwd,
      // Phase 35:有團購商品就記當時收單中的團
      group_buy_id: groupBuyId,
    })
    .select('id, order_no, total_twd, access_key')
    .single();
  if (orderErr || !order) {
    console.error('[placeOrder insert order]', orderErr);
    // 折扣碼的 trigger 在 insert 時擋超賣與每人一次
    const msg = orderErr?.message ?? '';
    if (msg.includes('DISCOUNT_CODE_EXHAUSTED')) throw new Error('這組折扣碼剛好被用完了,請移除折扣碼再送出');
    if (msg.includes('DISCOUNT_CODE_USED')) throw new Error('這組折扣碼每位客人限用一次,這個電話已經用過了');
    throw new Error('建單失敗:' + msg);
  }

  // Phase 11:insert order_items 帶 variant_id,trigger 自動扣 variant.stock
  // 2026-09-03:price_at_purchase 用折後價(sale / tier)
  // Phase 16(#12):滿額贈 — 折後小計達標的規則各加一行 0 元贈品
  const giftItems = await buildGiftItems(TENANT_ID, pricedSubtotal);
  const itemsToInsert = [
    ...cart.map((c) => {
      const v = (variants as unknown as VRow[]).find((vv) => vv.id === c.variant_id)!;
      return {
        tenant_id: TENANT_ID,
        order_id: order.id,
        product_id: v.product_id,
        variant_id: c.variant_id,
        qty: c.qty,
        price_at_purchase: effectivePrice(v, c.qty),
      };
    }),
    ...giftItems.map((g) => ({ tenant_id: TENANT_ID, order_id: order.id, ...g })),
  ];
  const { error: itemsErr } = await supabaseAdmin
    .from('order_items')
    .insert(itemsToInsert);
  if (itemsErr) {
    // partial fail — rollback order(沒 transaction;簡化 v1)
    await supabaseAdmin.from('orders').delete().eq('id', order.id);
    console.error('[placeOrder insert items]', itemsErr);
    throw new Error('建單失敗(明細):' + itemsErr.message);
  }

  // LINE push:訂單成立通知。
  // ⚠️ 不能 fire-and-forget(Vercel serverless function return 後 kill 背景 task)
  // 必須 await,push 完才能 return。增加 ~200ms 但保證送出。失敗仍不影響訂單(catch)。
  // ⚠️ order.total_twd 在 INSERT 時是 0(由 refresh_order_total trigger 在 items 後算),
  //    所以這裡用本地 cart × price snapshot 直接算
  const totalForPush = pricedSubtotal - discountTwd + shippingFee; // 折後小計 − 折扣碼 + 運費(= orderPayable)
  try {
    await pushOrderConfirmation(lineUserId, order.order_no, totalForPush, paymentMethod, order.access_key ?? null);
  } catch (e) {
    console.warn('[placeOrder push]', e);
  }

  return { order_no: order.order_no };
}

/**
 * 2026-09-08:LIFF 訂單成立畫面直接回報匯款後 5 碼(不用繞去訂單頁)。
 * 安全:只能改「自己的」「還沒付款的」訂單。
 */
export async function reportOrderLast5(
  idToken: string,
  orderNo: string,
  last5: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{5}$/.test(last5)) return { ok: false, error: '後 5 碼需為 5 位數字' };
  const lineUserId = await verifyIdToken(idToken);

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (!user) return { ok: false, error: '用戶不存在' };

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ payment_last5: last5, payment_reported_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_ID)
    .eq('order_no', orderNo)
    .eq('user_id', user.id)
    .eq('payment_status', 'pending')
    .select('id');
  if (error) {
    console.error('[reportOrderLast5]', error);
    return { ok: false, error: '回報失敗,請稍後再試' };
  }
  if (!data || data.length === 0) return { ok: false, error: '找不到可回報的訂單' };

  // 2026-09-12:回報成功 LINE 推確認訊息 — 聊天室裡有最新狀態,舊訂單卡不再誤導
  try {
    await lineClient.pushMessage({
      to: lineUserId,
      messages: [{
        type: 'text',
        text: `✓ 已收到您回報的帳號後 5 碼(${last5})\n訂單 ${orderNo} 等待賣家核帳中。`,
      }],
    });
  } catch (e) {
    console.warn('[reportOrderLast5 push]', e);
  }
  return { ok: true };
}

/**
 * 訂單建立後 LINE push 一則文字訊息給客戶:
 *   ✓ 訂單編號 + 總計
 *   💰 匯款資訊(從 tenants.payment_info)
 *   訂單頁連結
 *
 * Fire-and-forget。失敗不影響訂單。
 * 客戶須為 bot 好友才會收到(non-friend pushMessage 會 fail,catch 吞掉)。
 */
async function pushOrderConfirmation(
  lineUserId: string,
  orderNo: string,
  totalTwd: number,
  paymentMethod: string = 'bank',
  accessKey: string | null = null, // Phase 22:訂單頁連結帶存取碼
): Promise<void> {
  // 2026-10-16:LINE Pay 單不要講匯款(客人是線上付款),改提示去完成付款
  // 2026-10-22:綠界(信用卡 / ATM 虛擬帳號)同理
  const isLinePay = paymentMethod === 'line_pay';
  const isEcpayAtm = paymentMethod === 'ecpay_atm';
  const isEcpayCredit = paymentMethod === 'ecpay_credit';
  // Phase 36:超商取貨付款 — 不講匯款,講到店付
  const isCod = paymentMethod === 'cod';
  // 拉 tenant 匯款資訊 + slug(for order URL);Phase 28:分欄的 bank_transfer 優先,沒填退回 payment_info 文字
  const { data: t } = await supabaseAdmin
    .from('tenants')
    .select('slug, payment_info, bank_transfer, name')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const tenant = (t as { slug: string; payment_info: string | null; bank_transfer: unknown; name: string } | null) ?? null;
  const bank = bankTransferFromRow(tenant?.bank_transfer);
  const bankText = bank ? formatBankTransferText(bank) : tenant?.payment_info ?? null;

  const baseUrl = process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw';
  const orderUrl = tenant ? `${baseUrl}/${tenant.slug}/order/${orderNo}${accessKey ? `?k=${accessKey}` : ''}` : '';

  // 沒有訂單連結(理論上不會發生)→ 退回純文字
  if (!orderUrl) {
    await lineClient.pushMessage({
      to: lineUserId,
      messages: [{ type: 'text', text: `✓ 您的訂單已建立!\n訂單編號:${orderNo}\n總計:NT$ ${totalTwd.toLocaleString()}` }],
    });
    return;
  }

  // 2026-09-08:改 Flex 卡片 + 「我已匯款」按鈕(直開訂單頁的後五碼表單,不用進客服)
  const bodyContents: messagingApi.FlexBox['contents'] = [
    { type: 'text', text: '✓ 訂單已成立', weight: 'bold', size: 'lg', color: '#16a34a' },
    {
      type: 'box', layout: 'baseline', margin: 'lg',
      contents: [
        { type: 'text', text: '訂單編號', size: 'sm', color: '#71717a', flex: 3 },
        { type: 'text', text: orderNo, size: 'sm', weight: 'bold', color: '#18181b', flex: 5, align: 'end' },
      ],
    },
    {
      type: 'box', layout: 'baseline', margin: 'sm',
      contents: [
        { type: 'text', text: '應付總額', size: 'sm', color: '#71717a', flex: 3 },
        { type: 'text', text: `NT$ ${totalTwd.toLocaleString()}`, size: 'md', weight: 'bold', color: '#b45309', flex: 5, align: 'end' },
      ],
    },
  ];

  if (isCod) {
    bodyContents.push({ type: 'separator', margin: 'lg', color: '#e4e4e7' });
    bodyContents.push({ type: 'text', text: '付款方式:超商取貨付款', weight: 'bold', size: 'sm', margin: 'lg', color: '#92400e' });
    bodyContents.push({
      type: 'text',
      text: `不用先匯款。賣家寄出後會通知您,包裹到店時付 NT$ ${totalTwd.toLocaleString()}(含運費)給店員即可;到店後請在 7 天內領取。`,
      size: 'xs',
      color: '#71717a',
      wrap: true,
      margin: 'sm',
    });
  } else if (isLinePay || isEcpayAtm || isEcpayCredit) {
    bodyContents.push({ type: 'separator', margin: 'lg', color: '#e4e4e7' });
    bodyContents.push({
      type: 'text',
      text: `付款方式:${isLinePay ? 'LINE Pay' : isEcpayAtm ? 'ATM 轉帳' : '信用卡'}`,
      weight: 'bold',
      size: 'sm',
      margin: 'lg',
      color: isLinePay ? '#06c755' : isEcpayAtm ? '#0f766e' : '#1d4ed8',
    });
    bodyContents.push({
      type: 'text',
      text: isEcpayAtm
        ? '專屬轉帳帳號會另外傳給您,也可以點下方「查看訂單」查看。轉帳完成後訂單會自動更新,不用回報帳號後 5 碼。'
        : '若還沒完成付款,點下方「查看訂單」就能繼續付款。付款完成後訂單會自動更新,不用回報帳號後 5 碼。',
      size: 'xs',
      color: '#71717a',
      wrap: true,
      margin: 'sm',
    });
  } else if (bankText) {
    bodyContents.push({ type: 'separator', margin: 'lg', color: '#e4e4e7' });
    bodyContents.push({ type: 'text', text: '💰 匯款資訊', weight: 'bold', size: 'sm', margin: 'lg', color: '#92400e' });
    bodyContents.push({
      type: 'text',
      text: bankText,
      size: 'xs',
      color: '#57534e',
      wrap: true,
      margin: 'sm',
    });
    bodyContents.push({
      type: 'text',
      text: '匯款完成後,點下方「查看訂單」進訂單頁填帳號後 5 碼即可,不用另外聯絡客服。',
      size: 'xs',
      color: '#71717a',
      wrap: true,
      margin: 'md',
    });
  } else {
    bodyContents.push({
      type: 'text', text: '客服會盡快聯繫您確認付款。', size: 'xs', color: '#71717a', wrap: true, margin: 'lg',
    });
  }

  const flex: messagingApi.FlexMessage = {
    type: 'flex',
    altText: `✓ 訂單 ${orderNo} 已成立 · NT$ ${totalTwd.toLocaleString()}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'none', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          // 2026-09-12:兩顆按鈕併成一顆「查看訂單」— 這張卡發出後不會更新,
          // 按鈕標籤必須永遠不過時(回報過的人再看到「填後5碼」按鈕會困惑);
          // 回報完成另有 push 確認訊息補最新狀態
          {
            type: 'button', style: 'primary', color: '#16a34a', height: 'sm',
            action: { type: 'uri', label: '🧾 查看訂單', uri: orderUrl },
          },
        ],
      },
    },
  };

  await lineClient.pushMessage({ to: lineUserId, messages: [flex] });
}

// ====================
// 2026-10-16:LIFF 的 LINE Pay — 共用公開商城那套邏輯,只是這邊沒有 slug,
// 從 TENANT_ID 反查一次。金額與驗證都在 startLinePay 裡以 DB 為準。
// ====================
async function tenantSlug(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug')
    .eq('id', TENANT_ID)
    .maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}

/** 這個攤位能不能用 LINE Pay(金鑰已設 + feature flag 開) */
export async function isLinePayAvailableLiff(): Promise<boolean> {
  const slug = await tenantSlug();
  return slug ? isLinePayAvailable(slug) : false;
}

/** Phase 33 補(2026-11-07):LINE 商店套用折扣碼 — 驗完 idToken 後委派給網站結帳同一支,回來的金額只給前端顯示,送單時 server 重算 */
export async function applyDiscountCodeLiff(idToken: string, code: string, cart: CartItem[], phone: string): Promise<ApplyDiscountResult> {
  await verifyIdToken(idToken);
  const slug = await tenantSlug();
  if (!slug) return { ok: false, error: '攤位不存在' };
  return applyDiscountCode(slug, code, cart.map((c) => ({ variantId: c.variant_id, qty: c.qty })), phone);
}

/** Phase 28(2026-11-01):匯款沒設定(或關掉)就不出現在結帳 */
export async function isBankTransferAvailableLiff(): Promise<boolean> {
  const slug = await tenantSlug();
  return slug ? isBankTransferAvailable(slug) : false;
}

/**
 * Phase 22:確認這張單是這個 LINE 用戶的,才把存取碼交出去。
 * server action 任何人都呼叫得到,不驗身分的話拿單號就能要到別人的碼。
 */
async function accessKeyForLineUser(idToken: string, orderNo: string): Promise<string | null> {
  const lineUserId = await verifyIdToken(idToken);
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (!user) return null;
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('access_key')
    .eq('tenant_id', TENANT_ID)
    .eq('order_no', orderNo)
    .eq('user_id', (user as { id: string }).id)
    .maybeSingle();
  return (order as { access_key: string | null } | null)?.access_key ?? null;
}

/** 對既有訂單發動 LINE Pay,回付款頁網址(前端自行跳轉);要驗 LINE 身分與訂單歸屬 */
export async function startLinePayLiff(idToken: string, orderNo: string): Promise<StartLinePayResult> {
  const slug = await tenantSlug();
  if (!slug) return { ok: false, error: '攤位設定異常' };
  const key = await accessKeyForLineUser(idToken, orderNo);
  if (!key) return { ok: false, error: '找不到這筆訂單' };
  return startLinePay(slug, orderNo, key);
}

// ====================
// 2026-10-22:LIFF 的綠界(信用卡 / ATM 虛擬帳號)— 一樣共用公開商城那套。
// 綠界不用 server 發動,前端直接 window.location 到 /api/ecpay/pay 即可。
// ====================

/** 這個攤位能不能用綠界(金鑰已設 + feature flag 開) */
export async function isEcpayAvailableLiff(): Promise<boolean> {
  const slug = await tenantSlug();
  return slug ? isEcpayAvailable(slug) : false;
}

/** ATM 虛擬帳號另有 ecpay_atm flag(2026-10-22 起預設關) */
export async function isEcpayAtmAvailableLiff(): Promise<boolean> {
  const slug = await tenantSlug();
  return slug ? isEcpayAtmAvailable(slug) : false;
}

/** 綠界付款入口網址(帶存取碼);回 null = 攤位設定異常或這張單不是這個人的 */
export async function ecpayPayUrlLiff(idToken: string, orderNo: string, method: 'atm' | 'credit'): Promise<string | null> {
  const slug = await tenantSlug();
  if (!slug) return null;
  const key = await accessKeyForLineUser(idToken, orderNo);
  if (!key) return null;
  return `/api/ecpay/pay?slug=${encodeURIComponent(slug)}&orderNo=${encodeURIComponent(orderNo)}&method=${method}&k=${encodeURIComponent(key)}`;
}
