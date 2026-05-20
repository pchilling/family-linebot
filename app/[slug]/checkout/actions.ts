'use server';

import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type CartItemInput = {
  variantId: string;
  qty: number;
};

export type CreateOrderResult =
  | { ok: true; orderNo: string }
  | { ok: false; error: string };

export async function createOrder(formData: FormData): Promise<CreateOrderResult> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '').trim();
  const recipient = String(formData.get('recipient') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const guestEmail = String(formData.get('guestEmail') ?? '').trim();
  const cartItemsRaw = String(formData.get('cartItems') ?? '[]');

  if (!tenantSlug) return { ok: false, error: '無攤位資訊' };
  if (!recipient) return { ok: false, error: '請填收件人姓名' };
  if (!phone) return { ok: false, error: '請填聯絡電話' };
  if (!address) return { ok: false, error: '請填寄送地址' };

  let cartItems: CartItemInput[];
  try {
    const parsed: unknown = JSON.parse(cartItemsRaw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    cartItems = parsed
      .map((i) => {
        const item = i as { variantId?: unknown; qty?: unknown };
        return {
          variantId: String(item.variantId ?? ''),
          qty: Math.max(1, Math.floor(Number(item.qty) || 0)),
        };
      })
      .filter((i) => i.variantId);
  } catch {
    return { ok: false, error: '購物車資料異常' };
  }

  if (cartItems.length === 0) return { ok: false, error: '購物車是空的' };

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // 重新從 DB 拉 variant 真實價格 / 狀態 / 庫存(不信任 client cart 的 price)
  const variantIds = cartItems.map((i) => i.variantId);
  const { data: variants, error: vErr } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, tenant_id, price_twd, status, stock')
    .in('id', variantIds)
    .eq('tenant_id', tenant.id);

  if (vErr) {
    console.error('[createOrder fetch variants]', vErr);
    return { ok: false, error: '查詢商品失敗' };
  }

  type DbVariant = {
    id: string;
    product_id: string;
    tenant_id: string;
    price_twd: number;
    status: string;
    stock: number;
  };
  const variantMap = new Map<string, DbVariant>(
    (variants ?? []).map((v) => [(v as DbVariant).id, v as DbVariant]),
  );

  for (const item of cartItems) {
    const v = variantMap.get(item.variantId);
    if (!v) return { ok: false, error: '購物車有商品已下架,請回購物車移除' };
    if (v.status !== 'active') return { ok: false, error: '購物車有商品已下架' };
    if (v.stock < item.qty) return { ok: false, error: '庫存不足' };
  }

  // 建 order(order_no / total_twd 由 trigger 處理)
  const { data: orderRow, error: oErr } = await supabaseAdmin
    .from('orders')
    .insert({
      tenant_id: tenant.id,
      status: 'open',
      payment_status: 'pending',
      source: 'web',
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: address,
      note: note || null,
      guest_email: guestEmail || null,
      guest_phone: phone,
    })
    .select('id, order_no')
    .single();

  if (oErr || !orderRow) {
    console.error('[createOrder insert order]', oErr);
    return { ok: false, error: '建立訂單失敗' };
  }

  const itemsToInsert = cartItems.map((item) => {
    const v = variantMap.get(item.variantId)!;
    return {
      tenant_id: tenant.id,
      order_id: (orderRow as { id: string }).id,
      product_id: v.product_id,
      variant_id: v.id,
      qty: item.qty,
      price_at_purchase: v.price_twd,
    };
  });

  const { error: iErr } = await supabaseAdmin.from('order_items').insert(itemsToInsert);

  if (iErr) {
    console.error('[createOrder insert items]', iErr);
    return { ok: false, error: '建立訂單明細失敗' };
  }

  return { ok: true, orderNo: (orderRow as { order_no: string }).order_no };
}
