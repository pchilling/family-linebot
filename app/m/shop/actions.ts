'use server';

import { buildGiftItems, getProductTiers, pickPriceFromTiers, supabaseAdmin } from '@/lib/supabase';
import { lineClient } from '@/lib/line';
import type { messagingApi } from '@line/bot-sdk';

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
};

export type ShopMember = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
};

// 批次 D #13:運費規則(tenants.shipping_rules jsonb;null = 不收運費)
export type ShippingOption = {
  key: string;
  label: string;
  fee: number;
  free_over?: number;
  note?: string;
};

export type ShopTenant = {
  name: string;
  logo_url: string | null;
  banners: { type: 'image' | 'video'; url: string }[]; // Phase 9.8 多媒體 carousel
  payment_info: string | null;
  contact_info: string | null; // 2026-09-11(回饋 #13):商城底部顯示聯絡資訊
  shop_bg_color: string | null; // 批次 C #7:商城底色
  category_order: string[]; // 批次 C #8:分類顯示順序
  shipping_options: ShippingOption[]; // 空陣列 = 不收運費
  // Phase 16(#12):滿額贈(product_name 已解析好給前端直接顯示)
  gift_rules: { threshold_twd: number; qty: number; product_name: string }[];
};

export type ShopData = {
  products: ShopProduct[];
  member: ShopMember | null;
  tenant: ShopTenant;
  // 2026-09-11(回饋 #10):這個客人上一筆訂單的收件資訊,結帳預填(不動會員資料)
  lastShipping: { recipient: string | null; phone: string | null; address: string | null } | null;
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

  const [productsRes, memberRes, tenantRes, tiersRes] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, description, price_twd, image_url, media, category, badge, badge_color, sale_discount_pct, sale_start_at, sale_end_at, stock, product_variants(id, variant_name, price_twd, stock, image_url, status)')
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
      .select('name, logo_url, og_image_url, banners, payment_info, contact_info, shop_bg_color, category_order, shipping_rules, gift_rules')
      .eq('id', TENANT_ID)
      .maybeSingle(),
    // 2026-09-11(回饋 #9):一次撈整攤的分階定價(量小,免 per-product 查)
    supabaseAdmin
      .from('product_price_tiers')
      .select('product_id, min_qty, price_twd')
      .eq('tenant_id', TENANT_ID)
      .order('min_qty', { ascending: true }),
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
    contact_info: string | null;
    shop_bg_color: string | null;
    category_order: string[] | null;
    shipping_rules: { options?: ShippingOption[] } | null;
    gift_rules: { rules?: { threshold_twd: number; product_id: string; qty: number }[] } | null;
  } | null;
  const t = (tenantRes.data as TenantRow) ?? null;
  // Phase 9.8 多 banner + fallback og_image_url(舊單張)
  const tenantBanners: MediaItem[] = Array.isArray(t?.banners) && t.banners.length > 0
    ? t.banners
    : t?.og_image_url
      ? [{ type: 'image', url: t.og_image_url }]
      : [];

  type ProductRow = ShopProduct & {
    product_variants?: { id: string; variant_name: string; price_twd: number; stock: number; image_url: string | null; status: string }[] | null;
  };
  return {
    products: ((productsRes.data ?? []) as ProductRow[]).map((p) => ({
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
      variants: (p.product_variants ?? [])
        .filter((v) => v.status === 'active')
        .map((v) => ({ id: v.id, variant_name: v.variant_name, price_twd: v.price_twd, stock: v.stock, image_url: v.image_url ?? null })),
      tiers: tiersByProduct.get(p.id) ?? [],
    })),
    member: (memberRes.data as ShopMember | null) ?? null,
    tenant: {
      name: t?.name ?? '商品專區',
      logo_url: t?.logo_url ?? null,
      banners: tenantBanners,
      payment_info: t?.payment_info ?? null,
      contact_info: t?.contact_info ?? null,
      shop_bg_color: t?.shop_bg_color ?? null,
      category_order: Array.isArray(t?.category_order) ? t.category_order : [],
      shipping_options: Array.isArray(t?.shipping_rules?.options) ? t.shipping_rules.options : [],
      gift_rules: (t?.gift_rules?.rules ?? [])
        .filter((r) => r && r.threshold_twd > 0 && productNameById.has(r.product_id))
        .map((r) => ({
          threshold_twd: r.threshold_twd,
          qty: Math.max(1, r.qty || 1),
          product_name: productNameById.get(r.product_id)!,
        }))
        .sort((a, b) => a.threshold_twd - b.threshold_twd),
    },
    lastShipping,
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
  // 2026-09-11 v2:統編專用欄位移除 — 需要統編的客人直接寫在備註
  const note = String(formData.get('note') || '').trim();

  if (cart.length === 0) throw new Error('購物車是空的');
  if (!recipient || !phone || !address) throw new Error('收件人 / 電話 / 地址 必填');

  // 找 user
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (userErr || !user) throw new Error('用戶不存在,請先加好友');

  // Phase 11(Stage C):server 拉 variant 真實價格 + 庫存(不信 client)
  const variantIds = cart.map((c) => c.variant_id).filter(Boolean);
  if (variantIds.length === 0 || variantIds.length !== cart.length) {
    throw new Error('購物車格式錯誤');
  }
  const { data: variants, error: variantsErr } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, price_twd, status, stock')
    .in('id', variantIds)
    .eq('tenant_id', TENANT_ID);
  if (variantsErr || !variants) throw new Error('讀取變體失敗');
  if (variants.length !== variantIds.length) throw new Error('部分變體不存在');
  type VRow = { id: string; product_id: string; price_twd: number; status: string; stock: number };
  for (const v of variants as VRow[]) {
    if (v.status !== 'active') throw new Error('部分變體已下架');
    const cartItem = cart.find((c) => c.variant_id === v.id);
    if (cartItem && cartItem.qty > v.stock) {
      throw new Error(`規格庫存不足(剩 ${v.stock})`);
    }
  }

  // 2026-09-03:結帳單價套 sale + tier(跟公開商城 createOrder 同邏輯,原本 LIFF 照原價收錢)
  // 優先級:sale 生效 → % off 通殺;否則 tier(同 product 整單 qty 算)
  const qtyByProduct = new Map<string, number>();
  for (const c of cart) {
    const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id);
    if (v) qtyByProduct.set(v.product_id, (qtyByProduct.get(v.product_id) ?? 0) + c.qty);
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
    const totalQty = qtyByProduct.get(v.product_id) ?? qty;
    return pickPriceFromTiers(tierByProduct.get(v.product_id) ?? [], totalQty, v.price_twd);
  };
  // 折後小計(免運門檻與通知金額都用這個)
  const pricedSubtotal = cart.reduce((sum, c) => {
    const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id);
    return sum + (v ? effectivePrice(v, c.qty) : 0) * c.qty;
  }, 0);

  // D#13:運費 server 端重算(不信 client)。tenant 沒設規則 = 0
  const { data: tRow } = await supabaseAdmin
    .from('tenants')
    .select('shipping_rules')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const shipOptions =
    ((tRow as { shipping_rules?: { options?: ShippingOption[] } | null } | null)?.shipping_rules
      ?.options ?? []) as ShippingOption[];
  let shippingFee = 0;
  let shippingKey: string | null = null;
  if (shipOptions.length > 0) {
    const opt = shipOptions.find((o) => o.key === shippingMethod);
    if (!opt) throw new Error('請選擇配送方式');
    shippingFee = opt.free_over && pricedSubtotal >= opt.free_over ? 0 : opt.fee;
    shippingKey = opt.key;
  }

  // insert order(order_no / total_twd 由 trigger 自動)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      tenant_id: TENANT_ID,
      user_id: user.id,
      order_no: '',
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: address,
      shipping_method: shippingKey,
      shipping_fee_twd: shippingFee,
      note: note || null,
    })
    .select('id, order_no, total_twd')
    .single();
  if (orderErr || !order) {
    console.error('[placeOrder insert order]', orderErr);
    throw new Error('建單失敗:' + orderErr?.message);
  }

  // Phase 11:insert order_items 帶 variant_id,trigger 自動扣 variant.stock
  // 2026-09-03:price_at_purchase 用折後價(sale / tier)
  // Phase 16(#12):滿額贈 — 折後小計達標的規則各加一行 0 元贈品
  const giftItems = await buildGiftItems(TENANT_ID, pricedSubtotal);
  const itemsToInsert = [
    ...cart.map((c) => {
      const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id)!;
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
  const totalForPush = pricedSubtotal + shippingFee; // 折後小計 + 運費
  try {
    await pushOrderConfirmation(lineUserId, order.order_no, totalForPush);
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
): Promise<void> {
  // 拉 tenant payment_info + slug(for order URL)
  const { data: t } = await supabaseAdmin
    .from('tenants')
    .select('slug, payment_info, name')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const tenant = (t as { slug: string; payment_info: string | null; name: string } | null) ?? null;

  const baseUrl = process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw';
  const orderUrl = tenant ? `${baseUrl}/${tenant.slug}/order/${orderNo}` : '';

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

  if (tenant?.payment_info) {
    bodyContents.push({ type: 'separator', margin: 'lg', color: '#e4e4e7' });
    bodyContents.push({ type: 'text', text: '💰 匯款資訊', weight: 'bold', size: 'sm', margin: 'lg', color: '#92400e' });
    bodyContents.push({
      type: 'text',
      text: tenant.payment_info,
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
