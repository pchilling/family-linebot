'use server';

import { getTenantBySlug, getProductTiers, pickPriceFromTiers, supabaseAdmin } from '@/lib/supabase';

type CartItemInput = {
  variantId: string;
  qty: number;
};

export type CreateOrderResult =
  | { ok: true; orderNo: string }
  | { ok: false; error: string };

// D#13:運費規則(tenants.shipping_rules.options;空陣列 = 該攤位不收運費)
export type ShippingOption = {
  key: string;
  label: string;
  fee: number;
  free_over?: number;
  note?: string;
};

export async function getShippingOptions(tenantSlug: string): Promise<ShippingOption[]> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('shipping_rules')
    .eq('slug', tenantSlug)
    .maybeSingle();
  const rules = (data as { shipping_rules?: { options?: ShippingOption[] } | null } | null)
    ?.shipping_rules;
  return Array.isArray(rules?.options) ? rules.options : [];
}

export async function createOrder(formData: FormData): Promise<CreateOrderResult> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '').trim();
  const recipient = String(formData.get('recipient') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const guestEmail = String(formData.get('guestEmail') ?? '').trim();
  const shippingMethod = String(formData.get('shipping_method') ?? '').trim();
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

  // Phase 9.5/9.9:結帳時用 sale + tier 重算每個 line 的單價
  // 優先級:sale 生效 → sale 通殺;否則 tier(以同 product_id 整單 qty 算)
  // (D#13 改序:先算完單價才能算折後小計 → 運費免運門檻 → 再建 order)
  const qtyByProduct = new Map<string, number>();
  for (const item of cartItems) {
    const v = variantMap.get(item.variantId);
    if (!v) continue;
    qtyByProduct.set(v.product_id, (qtyByProduct.get(v.product_id) ?? 0) + item.qty);
  }

  const productIds = Array.from(qtyByProduct.keys());

  // Phase 9.9 v2:撈 sale_discount_pct(server 真實檢查時間)
  const { data: prodSaleData } = await supabaseAdmin
    .from('products')
    .select('id, sale_discount_pct, sale_start_at, sale_end_at')
    .in('id', productIds);
  const saleByProduct = new Map<string, { pct: number | null; start: string | null; end: string | null }>();
  for (const row of (prodSaleData as { id: string; sale_discount_pct: number | null; sale_start_at: string | null; sale_end_at: string | null }[] | null) ?? []) {
    saleByProduct.set(row.id, {
      pct: row.sale_discount_pct,
      start: row.sale_start_at,
      end: row.sale_end_at,
    });
  }

  const tierByProduct = new Map<string, { min_qty: number; price_twd: number }[]>();
  await Promise.all(
    productIds.map(async (pid) => {
      const tiers = await getProductTiers(pid);
      tierByProduct.set(
        pid,
        tiers.map((t) => ({ min_qty: t.min_qty, price_twd: t.price_twd })),
      );
    }),
  );

  const now = new Date();

  const pricedItems = cartItems.map((item) => {
    const v = variantMap.get(item.variantId)!;
    const sale = saleByProduct.get(v.product_id);
    const saleActive =
      !!sale &&
      sale.pct !== null &&
      sale.pct > 0 &&
      sale.start &&
      sale.end &&
      now >= new Date(sale.start) &&
      now < new Date(sale.end);
    let effective: number;
    if (saleActive) {
      // 用 % off 比例縮 variant 自身價,跨變體比例自動正確
      effective = Math.round((v.price_twd * (100 - sale!.pct!)) / 100);
    } else {
      const totalProductQty = qtyByProduct.get(v.product_id) ?? item.qty;
      const tiers = tierByProduct.get(v.product_id) ?? [];
      effective = pickPriceFromTiers(tiers, totalProductQty, v.price_twd);
    }
    return {
      tenant_id: tenant.id,
      product_id: v.product_id,
      variant_id: v.id,
      qty: item.qty,
      price_at_purchase: effective,
    };
  });

  // D#13:運費 server 端計算(免運門檻用折扣後的商品小計)
  const subtotal = pricedItems.reduce((s, it) => s + it.price_at_purchase * it.qty, 0);
  const shipOptions = await getShippingOptions(tenantSlug);
  let shippingFee = 0;
  let shippingKey: string | null = null;
  if (shipOptions.length > 0) {
    const opt = shipOptions.find((o) => o.key === shippingMethod);
    if (!opt) return { ok: false, error: '請選擇配送方式' };
    shippingFee = opt.free_over && subtotal >= opt.free_over ? 0 : opt.fee;
    shippingKey = opt.key;
  }

  // 建 order(order_no / total_twd 由 trigger 處理;total_twd = 商品小計,運費另存)
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
      shipping_method: shippingKey,
      shipping_fee_twd: shippingFee,
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

  const itemsToInsert = pricedItems.map((it) => ({
    ...it,
    order_id: (orderRow as { id: string }).id,
  }));

  const { error: iErr } = await supabaseAdmin.from('order_items').insert(itemsToInsert);

  if (iErr) {
    console.error('[createOrder insert items]', iErr);
    return { ok: false, error: '建立訂單明細失敗' };
  }

  return { ok: true, orderNo: (orderRow as { order_no: string }).order_no };
}
