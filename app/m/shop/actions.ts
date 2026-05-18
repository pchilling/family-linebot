'use server';

import { supabaseAdmin } from '@/lib/supabase';

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

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  price_twd: number;
  image_url: string | null;
  category: string | null;
  stock: number;
};

export type ShopMember = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
};

export type ShopData = {
  products: ShopProduct[];
  member: ShopMember | null;
};

/**
 * 一次拉商品 list + 用戶會員資料(預填結帳)
 */
export async function loadShopData(idToken: string): Promise<ShopData> {
  const lineUserId = await verifyIdToken(idToken);

  const [productsRes, memberRes] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, description, price_twd, image_url, category, stock')
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
  ]);

  if (productsRes.error) {
    console.error('[loadShopData products]', productsRes.error);
    throw new Error('讀取商品失敗');
  }

  return {
    products: (productsRes.data ?? []) as ShopProduct[],
    member: (memberRes.data as ShopMember | null) ?? null,
  };
}

export type CartItem = { product_id: string; qty: number };

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

  // server-side 拉商品價格(snapshot,不信 client)
  const productIds = cart.map((c) => c.product_id);
  const { data: products, error: productsErr } = await supabaseAdmin
    .from('products')
    .select('id, price_twd, status, stock')
    .in('id', productIds)
    .eq('tenant_id', TENANT_ID);
  if (productsErr || !products) throw new Error('讀取商品價格失敗');
  if (products.length !== productIds.length) throw new Error('部分商品不存在');
  for (const p of products) {
    if (p.status !== 'active') throw new Error('部分商品已下架');
    const cartItem = cart.find((c) => c.product_id === p.id);
    if (cartItem && cartItem.qty > p.stock) {
      throw new Error(`商品庫存不足(剩 ${p.stock})`);
    }
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
    })
    .select('id, order_no')
    .single();
  if (orderErr || !order) {
    console.error('[placeOrder insert order]', orderErr);
    throw new Error('建單失敗:' + orderErr?.message);
  }

  // insert order_items(會觸發 refresh_order_total + stock_movements + check_tenant)
  const itemsToInsert = cart.map((c) => {
    const p = products.find((pp) => pp.id === c.product_id)!;
    return {
      tenant_id: TENANT_ID,
      order_id: order.id,
      product_id: c.product_id,
      qty: c.qty,
      price_at_purchase: p.price_twd,
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

  return { order_no: order.order_no };
}
