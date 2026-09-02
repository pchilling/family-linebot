'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { lineClient } from '@/lib/line';

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
  stock: number;
  variants: ShopVariant[]; // Phase 11:variant-aware
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
  shop_bg_color: string | null; // 批次 C #7:商城底色
  category_order: string[]; // 批次 C #8:分類顯示順序
  shipping_options: ShippingOption[]; // 空陣列 = 不收運費
};

export type ShopData = {
  products: ShopProduct[];
  member: ShopMember | null;
  tenant: ShopTenant;
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

  const [productsRes, memberRes, tenantRes] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, description, price_twd, image_url, media, category, badge, stock, product_variants(id, variant_name, price_twd, stock, image_url, status)')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'active')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('users')
      .select('full_name, phone, address')
      .eq('tenant_id', TENANT_ID)
      .eq('line_user_id', lineUserId)
      .maybeSingle(),
    supabaseAdmin
      .from('tenants')
      .select('name, logo_url, og_image_url, banners, payment_info, shop_bg_color, category_order, shipping_rules')
      .eq('id', TENANT_ID)
      .maybeSingle(),
  ]);

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
    shop_bg_color: string | null;
    category_order: string[] | null;
    shipping_rules: { options?: ShippingOption[] } | null;
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
      stock: p.stock,
      variants: (p.product_variants ?? [])
        .filter((v) => v.status === 'active')
        .map((v) => ({ id: v.id, variant_name: v.variant_name, price_twd: v.price_twd, stock: v.stock, image_url: v.image_url ?? null })),
    })),
    member: (memberRes.data as ShopMember | null) ?? null,
    tenant: {
      name: t?.name ?? '商品專區',
      logo_url: t?.logo_url ?? null,
      banners: tenantBanners,
      payment_info: t?.payment_info ?? null,
      shop_bg_color: t?.shop_bg_color ?? null,
      category_order: Array.isArray(t?.category_order) ? t.category_order : [],
      shipping_options: Array.isArray(t?.shipping_rules?.options) ? t.shipping_rules.options : [],
    },
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
    const subtotal = cart.reduce((sum, c) => {
      const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id);
      return sum + (v?.price_twd ?? 0) * c.qty;
    }, 0);
    shippingFee = opt.free_over && subtotal >= opt.free_over ? 0 : opt.fee;
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
    })
    .select('id, order_no, total_twd')
    .single();
  if (orderErr || !order) {
    console.error('[placeOrder insert order]', orderErr);
    throw new Error('建單失敗:' + orderErr?.message);
  }

  // Phase 11:insert order_items 帶 variant_id,trigger 自動扣 variant.stock
  const itemsToInsert = cart.map((c) => {
    const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id)!;
    return {
      tenant_id: TENANT_ID,
      order_id: order.id,
      product_id: v.product_id,
      variant_id: c.variant_id,
      qty: c.qty,
      price_at_purchase: v.price_twd,
    };
  });
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
  const totalForPush =
    cart.reduce((sum, c) => {
      const v = (variants as VRow[]).find((vv) => vv.id === c.variant_id);
      return sum + (v?.price_twd ?? 0) * c.qty;
    }, 0) + shippingFee; // D#13:通知金額含運費
  try {
    await pushOrderConfirmation(lineUserId, order.order_no, totalForPush);
  } catch (e) {
    console.warn('[placeOrder push]', e);
  }

  return { order_no: order.order_no };
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

  const lines = [
    '✓ 您的訂單已建立!',
    '',
    `訂單編號:${orderNo}`,
    `總計:NT$ ${totalTwd.toLocaleString()}`,
  ];

  if (tenant?.payment_info) {
    lines.push('');
    lines.push('—— 下一步:匯款 ——');
    lines.push(tenant.payment_info);
    lines.push('');
    lines.push('匯款後請開下方「訂單詳情」連結,直接填寫帳號後 5 碼。');
  } else {
    lines.push('');
    lines.push('客服會盡快聯繫您確認付款。');
  }

  if (orderUrl) {
    lines.push('');
    lines.push('訂單詳情:');
    lines.push(orderUrl);
  }

  await lineClient.pushMessage({
    to: lineUserId,
    messages: [{ type: 'text', text: lines.join('\n') }],
  });
}
