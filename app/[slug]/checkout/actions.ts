'use server';

import { redirect } from 'next/navigation';
import { buildGiftItems, getTenantBySlug, getTenantPublic, getProductTiers, hasFeature, isSaleActive, orderPayable, pickPriceFromTiers, supabaseAdmin, type TenantBySlug } from '@/lib/supabase';
import { isLinePayConfigured, requestLinePayPayment } from '@/lib/linepay';
import { isEcpayConfigured } from '@/lib/ecpay';
import { getCurrentMember } from '@/lib/member-auth';
import { bankTransferFromRow, isBankTransferOffered } from '@/lib/bank-transfer';
import { cvsStoreText, type CvsChain } from '@/lib/cvs';
import { canViewGroupBuy, checkCartGroupBuy, getGroupBuyProductIds, getGroupBuyState, type GroupBuyPublic } from '@/lib/groupbuy';

// 2026-09-18:購物車顯示分階價用 — 每個商品的分階表 + 是否特價生效中
// (原本網頁版購物車照原價顯示,後端實收卻套分階,金額對不上)
export type CartPricingInfo = Record<
  string,
  {
    tiers: { min_qty: number; price_twd: number }[];
    sale_active: boolean;
    // Phase 16.4:組合品變體 id(固定價、不參與分階,購物車顯示同步跳過)
    bundle_variant_ids: string[];
  }
>;

export async function getCartPricingInfo(
  tenantSlug: string,
  productIds: string[],
): Promise<CartPricingInfo> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || productIds.length === 0) return {};
  const ids = [...new Set(productIds)].slice(0, 50);

  const [{ data: prows }, { data: trows }, { data: brows }] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, sale_discount_pct, sale_start_at, sale_end_at')
      .eq('tenant_id', tenant.id)
      .in('id', ids),
    supabaseAdmin
      .from('product_price_tiers')
      .select('product_id, min_qty, price_twd')
      .eq('tenant_id', tenant.id)
      .in('product_id', ids)
      .order('min_qty', { ascending: true }),
    supabaseAdmin
      .from('product_variants')
      .select('id, product_id')
      .eq('tenant_id', tenant.id)
      .eq('is_bundle', true)
      .in('product_id', ids),
  ]);

  const now = new Date();
  const out: CartPricingInfo = {};
  const blank = () => ({ tiers: [], sale_active: false, bundle_variant_ids: [] as string[] });
  for (const p of (prows as { id: string; sale_discount_pct: number | null; sale_start_at: string | null; sale_end_at: string | null }[] | null) ?? []) {
    out[p.id] = { ...blank(), sale_active: isSaleActive(p, now) };
  }
  for (const t of (trows as { product_id: string; min_qty: number; price_twd: number }[] | null) ?? []) {
    (out[t.product_id] ??= blank()).tiers.push({
      min_qty: t.min_qty,
      price_twd: t.price_twd,
    });
  }
  for (const b of (brows as { id: string; product_id: string }[] | null) ?? []) {
    (out[b.product_id] ??= blank()).bundle_variant_ids.push(b.id);
  }
  return out;
}

/**
 * Phase 35(2026-11-07):結帳頁分組用 — 購物車裡哪些是團購商品、目前的團(有效狀態)。
 * 以 server 為準,不信任 localStorage 裡的 channel 欄。
 */
export type GroupBuyCheckoutInfo = { groupBuyProductIds: string[]; current: GroupBuyPublic | null };

export async function getGroupBuyCheckoutInfo(tenantSlug: string, productIds: string[]): Promise<GroupBuyCheckoutInfo> {
  const empty: GroupBuyCheckoutInfo = { groupBuyProductIds: [], current: null };
  const tenant = await getTenantPublic(tenantSlug);
  if (!tenant || productIds.length === 0) return empty;
  // 購物車沒有團購商品就不撈團,團名等資訊不外流
  const gbIds = await getGroupBuyProductIds(tenant.id);
  const groupBuyProductIds = [...new Set(productIds)].filter((id) => gbIds.has(id));
  if (groupBuyProductIds.length === 0) return empty;
  // 「團購只給追蹤者看」開著 → 沒追蹤的人連團名都不給(規格第七節,server 端擋);createOrder 仍是最後一道
  const member = await getCurrentMember().catch(() => null);
  if (!(await canViewGroupBuy(tenant, member))) return empty;
  const state = await getGroupBuyState(tenant.id);
  return { groupBuyProductIds, current: state.current };
}

type CartItemInput = {
  variantId: string;
  qty: number;
};

export type CreateOrderResult =
  | { ok: true; orderNo: string; accessKey: string | null }
  // Phase 33:discountInvalid = 折扣碼驗不過,前端要把已套用的碼清掉(整張沒建單)
  | { ok: false; error: string; discountInvalid?: true };

// D#13:運費規則(tenants.shipping_rules.options;空陣列 = 該攤位不收運費)
// Phase 29:cvs = 超商店到店(7-ELEVEN / 全家),客人結帳要選門市,不填地址
export type ShippingOption = {
  key: string;
  label: string;
  fee: number;
  free_over?: number;
  note?: string;
  cvs?: CvsChain;
};

// 2026-10-06:滿額贈進度橫幅用 — 回有效規則(贈品名已解析,已下架贈品不列)
// Phase 18(2026-10-16):加 mode 與 repeat,購物車的進度顯示才會跟實際送的一致
export type GiftRulePublic = {
  threshold_twd: number;
  qty: number;
  product_name: string;
  repeat: boolean;
};
export type GiftConfigPublic = { mode: 'stack' | 'highest'; rules: GiftRulePublic[] };

export async function getGiftRulesPublic(tenantSlug: string): Promise<GiftConfigPublic> {
  const empty: GiftConfigPublic = { mode: 'stack', rules: [] };
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return empty;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('gift_rules')
    .eq('id', tenant.id)
    .maybeSingle();
  const cfg = (data as {
    gift_rules?: {
      mode?: string;
      rules?: { threshold_twd: number; product_id: string; qty: number; repeat?: boolean }[];
    } | null;
  } | null)?.gift_rules;
  const mode: 'stack' | 'highest' = cfg?.mode === 'highest' ? 'highest' : 'stack';
  const rules = cfg?.rules ?? [];
  const valid = rules.filter((r) => r && r.threshold_twd > 0 && !!r.product_id);
  if (valid.length === 0) return { mode, rules: [] };

  const { data: prods } = await supabaseAdmin
    .from('products')
    .select('id, name, status')
    .in('id', valid.map((r) => r.product_id));
  const nameById = new Map(
    (((prods ?? []) as { id: string; name: string; status: string }[]))
      .filter((p) => p.status === 'active')
      .map((p) => [p.id, p.name]),
  );
  return {
    mode,
    rules: valid
      .filter((r) => nameById.has(r.product_id))
      .map((r) => ({
        threshold_twd: r.threshold_twd,
        qty: Math.max(1, r.qty || 1),
        product_name: nameById.get(r.product_id)!,
        repeat: !!r.repeat,
      }))
      .sort((a, b) => a.threshold_twd - b.threshold_twd),
  };
}

/**
 * Phase 27(2026-11-01):攤位的掃碼付款設定(給結帳頁與訂單頁用)。
 * 有開、有上傳 QR 圖才算可用;回 null 代表結帳不顯示這個選項。
 */
export type QrPaymentPublic = { image_url: string; label: string; note: string | null; link_url: string | null };

export async function getQrPaymentPublic(tenantSlug: string): Promise<QrPaymentPublic | null> {
  const { data } = await supabaseAdmin.from('tenants').select('qr_payment').eq('slug', tenantSlug).maybeSingle();
  const q = (data as { qr_payment?: { enabled?: boolean; image_url?: string; label?: string; note?: string; link_url?: string } | null } | null)?.qr_payment;
  if (!q || !q.enabled || !q.image_url) return null;
  return {
    image_url: q.image_url,
    label: (q.label ?? '').trim() || '掃碼付款',
    note: (q.note ?? '').trim() || null,
    link_url: (q.link_url ?? '').trim() || null,
  };
}

/**
 * Phase 28(2026-11-01):結帳要不要出現「匯款」。
 * 新欄位 bank_transfer 有填就看開關;沒填但還有舊的 payment_info 文字 → 當開著;都沒有 → 不出現。
 */
export async function isBankTransferAvailable(tenantSlug: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('tenants').select('bank_transfer, payment_info').eq('slug', tenantSlug).maybeSingle();
  const row = data as { bank_transfer?: unknown; payment_info?: string | null } | null;
  return isBankTransferOffered(bankTransferFromRow(row?.bank_transfer), row?.payment_info ?? null);
}

/** 2026-11-06:會員上一張訂單的收件資料,結帳頁「用上次的收件資料」用;沒登入或沒宅配過回 null */
export type LastShipping = { recipient: string; phone: string; address: string };
export async function getLastShipping(tenantSlug: string): Promise<LastShipping | null> {
  const member = await getCurrentMember().catch(() => null);
  if (!member) return null;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return null;
  const { data } = await supabaseAdmin
    .from('orders')
    .select('shipping_recipient, shipping_phone, shipping_address')
    .eq('tenant_id', tenant.id)
    .eq('platform_user_id', member.id)
    .is('cvs_type', null)
    .not('shipping_address', 'is', null)
    .neq('shipping_address', '門市自取')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { shipping_recipient: string | null; shipping_phone: string | null; shipping_address: string | null } | null;
  if (!row?.shipping_address || !row.shipping_recipient) return null;
  return { recipient: row.shipping_recipient, phone: row.shipping_phone ?? '', address: row.shipping_address };
}

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

// ====================
// 購物車定價(Phase 33 從 createOrder 抽出來):結帳頁套折扣碼的預覽與送單用同一支,
// 兩邊的 subtotal 才會一樣(2026-09-18 出過前後端價格對不上的 bug)。
// 單價優先序:特價(% off)→ 組合品固定價 → 分階價。
// ====================
type PricedItem = {
  tenant_id: string;
  product_id: string;
  variant_id: string;
  qty: number;
  price_at_purchase: number;
};
type PriceCartResult =
  | { ok: true; pricedItems: PricedItem[]; subtotal: number }
  | { ok: false; error: string };

async function priceCart(tenant: TenantBySlug, cartItems: CartItemInput[]): Promise<PriceCartResult> {
  // 重新從 DB 拉 variant 真實價格 / 狀態 / 庫存(不信任 client cart 的 price)
  const variantIds = cartItems.map((i) => i.variantId);
  const { data: variants, error: vErr } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, tenant_id, price_twd, status, stock, is_bundle, variant_name, products(name, channel, track_stock)')
    .in('id', variantIds)
    .eq('tenant_id', tenant.id);

  if (vErr) {
    console.error('[priceCart fetch variants]', vErr);
    return { ok: false, error: '查詢商品失敗' };
  }

  type DbVariant = {
    id: string;
    product_id: string;
    tenant_id: string;
    price_twd: number;
    status: string;
    stock: number;
    is_bundle: boolean; // Phase 16.4:組合品(固定價,不參與分階)
    variant_name: string | null;
    // Phase 35:channel / track_stock 跟商品走;track_stock=false 不檢查庫存(trigger 也不扣)
    products: { name: string; channel: string | null; track_stock: boolean | null } | null;
  };
  const variantMap = new Map<string, DbVariant>(
    (variants ?? []).map((v) => [(v as unknown as DbVariant).id, v as unknown as DbVariant]),
  );

  // 2026-11-06:錯誤訊息講清楚是哪一件(以前只有「庫存不足」四個字,客人要自己猜)
  const nameOf = (v: DbVariant) => `${v.products?.name ?? '商品'}${v.variant_name && v.variant_name !== 'default' ? `(${v.variant_name})` : ''}`;
  for (const item of cartItems) {
    const v = variantMap.get(item.variantId);
    if (!v) return { ok: false, error: '購物車有商品已下架,請從右邊明細移除再送出' };
    if (v.status !== 'active') return { ok: false, error: `${nameOf(v)} 已下架,請從右邊明細移除再送出` };
    // Phase 35:不管理庫存的商品跳過庫存檢查
    if (v.products?.track_stock === false) continue;
    if (v.stock < item.qty) {
      return { ok: false, error: v.stock > 0 ? `${nameOf(v)} 只剩 ${v.stock} 件,請把數量改成 ${v.stock} 以下` : `${nameOf(v)} 已售完,請從右邊明細移除` };
    }
  }

  // Phase 9.5/9.9:結帳時用 sale + tier 重算每個 line 的單價
  // 優先級:sale 生效 → sale 通殺;否則 tier(以同 product_id 整單 qty 算)
  // (D#13 改序:先算完單價才能算商品小計 → 運費免運門檻 → 再建 order)
  const qtyByProduct = new Map<string, number>();
  for (const item of cartItems) {
    const v = variantMap.get(item.variantId);
    if (!v) continue;
    // Phase 16.4:組合品數量不計入分階門檻
    if (v.is_bundle) continue;
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

  const pricedItems: PricedItem[] = cartItems.map((item) => {
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
    } else if (v.is_bundle) {
      // Phase 16.4:組合品固定價,不被分階改寫
      effective = v.price_twd;
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

  // 商品小計(= 之後 trigger 算出的 orders.total_twd;贈品 0 元不影響)
  const subtotal = pricedItems.reduce((s, it) => s + it.price_at_purchase * it.qty, 0);
  return { ok: true, pricedItems, subtotal };
}

/** 前端送來的 cartItems 清洗(createOrder 與 applyDiscountCode 共用) */
function parseCartItems(raw: unknown): CartItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((i) => {
      const item = i as { variantId?: unknown; qty?: unknown };
      return {
        variantId: String(item.variantId ?? ''),
        qty: Math.max(1, Math.floor(Number(item.qty) || 0)),
      };
    })
    .filter((i) => i.variantId)
    .slice(0, 100);
}

// ====================
// Phase 33(2026-11-06):折扣碼
// 只折商品小計、不折運費;免運門檻與滿額贈都看折扣前的小計。
// 套用(預覽)與送單走同一支 validateDiscountCode;送單時 server 一定重驗重算,不信任前端金額。
// ====================
const CODE_RE = /^[A-Z0-9]{3,20}$/;
const normalizeCode = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
// 比對用:去非數字,+886 912 345 678 → 0912345678(結帳頁電話欄允許 '+',同一支手機兩種寫法要算同一人);
// 只在比對時正規化,存進 orders.shipping_phone 的原字串不動
const phoneDigits = (s: string) => s.replace(/\D/g, '').replace(/^886(?=9\d{8}$)/, '0');
const twMD = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });

type DiscountRow = {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_subtotal: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  per_customer_once: boolean;
  enabled: boolean;
};
type DiscountCheck = { ok: true; row: DiscountRow; discount_twd: number } | { ok: false; error: string };

/** 折扣金額:percent 四捨五入到整數;不得超過商品小計 */
function computeDiscount(type: 'percent' | 'fixed', value: number, subtotal: number): number {
  const raw = type === 'percent' ? Math.round((subtotal * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotal));
}

async function validateDiscountCode(tenantId: string, rawCode: string, subtotal: number, phone: string): Promise<DiscountCheck> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: '請先輸入折扣碼' };
  if (!CODE_RE.test(code)) return { ok: false, error: '折扣碼是 3 到 20 位的英文或數字,請再核對一次' };

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .select('id, code, type, value, min_subtotal, starts_at, ends_at, max_uses, used_count, per_customer_once, enabled')
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle();
  if (error) {
    console.error('[validateDiscountCode]', error);
    return { ok: false, error: '查詢折扣碼失敗,請稍後再試' };
  }
  const row = (data ?? null) as DiscountRow | null;
  if (!row) return { ok: false, error: '找不到這組折扣碼,請再核對一次' };
  if (!row.enabled) return { ok: false, error: '這組折扣碼目前無法使用' };

  const nowMs = Date.now();
  if (row.starts_at && nowMs < new Date(row.starts_at).getTime()) {
    return { ok: false, error: `這組折扣碼 ${twMD(row.starts_at)} 才開始,請到時候再來用` };
  }
  if (row.ends_at && nowMs > new Date(row.ends_at).getTime()) {
    return { ok: false, error: `這組折扣碼已在 ${twMD(row.ends_at)} 到期了` };
  }
  // 預檢;真正擋超賣的是 insert 時的 trigger(DISCOUNT_CODE_EXHAUSTED)
  if (row.max_uses !== null && row.used_count >= row.max_uses) return { ok: false, error: '這組折扣碼已經被用完了' };
  if (row.min_subtotal !== null && subtotal < row.min_subtotal) {
    return {
      ok: false,
      error: `商品小計滿 NT$ ${row.min_subtotal.toLocaleString('en-US')} 才能用這組折扣碼,還差 NT$ ${(row.min_subtotal - subtotal).toLocaleString('en-US')}`,
    };
  }

  // 每人一次:比收件電話(去非數字;歷史訂單的電話沒正規化,SQL eq 會漏 0912-345-678)。
  // 套用時電話還沒填就跳過這條,送單時一定查。
  const digits = phoneDigits(phone);
  if (row.per_customer_once && digits) {
    const { data: used } = await supabaseAdmin
      .from('orders')
      .select('shipping_phone')
      .eq('tenant_id', tenantId)
      .eq('discount_code', row.code)
      .not('status', 'in', '(cancelled,refunded)');
    const hit = ((used ?? []) as { shipping_phone: string | null }[]).some((o) => phoneDigits(o.shipping_phone ?? '') === digits);
    if (hit) return { ok: false, error: '這組折扣碼每位客人限用一次,這個電話之前已經用過了' };
  }

  const discount = computeDiscount(row.type, row.value, subtotal);
  if (discount <= 0) return { ok: false, error: '這組折扣碼對目前的購物車沒有折扣' };
  // 折後商品小計必須 > 0:保證應付 ≥ 1,LINE Pay / 綠界不會收到 0 元
  if (discount >= subtotal) return { ok: false, error: '這組折扣碼會把商品金額折到 0,不適用這筆訂單' };

  return { ok: true, row, discount_twd: discount };
}

export type ApplyDiscountResult =
  | { ok: true; code: string; type: 'percent' | 'fixed'; value: number; discount_twd: number; subtotal: number; per_customer_once: boolean }
  | { ok: false; error: string };

/**
 * 結帳頁「套用」鈕:用跟送單一樣的定價與驗證,回折扣金額給前端顯示。
 * 回來的 discount_twd 前端只用來顯示;送單時 server 會重算。
 */
export async function applyDiscountCode(
  tenantSlug: string,
  code: string,
  cartItems: { variantId: string; qty: number }[],
  phone: string,
): Promise<ApplyDiscountResult> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false, error: '攤位不存在' };
  const items = parseCartItems(cartItems);
  if (!items || items.length === 0) return { ok: false, error: '購物車是空的' };

  const priced = await priceCart(tenant, items);
  if (!priced.ok) return { ok: false, error: priced.error };

  const dc = await validateDiscountCode(tenant.id, code, priced.subtotal, String(phone ?? ''));
  if (!dc.ok) return { ok: false, error: dc.error };
  return {
    ok: true,
    code: dc.row.code,
    type: dc.row.type,
    value: dc.row.value,
    discount_twd: dc.discount_twd,
    subtotal: priced.subtotal,
    per_customer_once: dc.row.per_customer_once,
  };
}

/** 這個攤位有沒有啟用中的折扣碼;結帳頁用它決定要不要顯示折扣碼輸入區 */
export async function hasDiscountCodes(tenantSlug: string): Promise<boolean> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return false;
  const { data } = await supabaseAdmin
    .from('discount_codes')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('enabled', true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function createOrder(formData: FormData): Promise<CreateOrderResult> {
  const tenantSlug = String(formData.get('tenantSlug') ?? '').trim();
  const recipient = String(formData.get('recipient') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const guestEmail = String(formData.get('guestEmail') ?? '').trim();
  const shippingMethod = String(formData.get('shipping_method') ?? '').trim();
  // Phase 29:超商店到店選的門市(有選店到店才會有;地址由門市組出來)
  const cvsStoreName = String(formData.get('cvs_store_name') ?? '').trim().slice(0, 40);
  const cvsStoreId = String(formData.get('cvs_store_id') ?? '').trim().replace(/\s+/g, '');
  // 2026-10-15:付款方式 — 'line_pay' 走線上付款,其餘一律匯款(bank)
  // 2026-10-22:加綠界 'ecpay_atm' / 'ecpay_credit';攤位沒開綠界就退回匯款,不信任前端
  const rawPayment = String(formData.get('payment_method') ?? '').trim();
  // Phase 27:'qr' 掃碼付款(攤位有開才收,不信任前端)
  // Phase 34:LINE Pay 也要過可用性(flag 開但攤位沒金鑰時,不要建出永遠付不了的單佔庫存)
  const paymentMethod =
    rawPayment === 'line_pay' && (await isLinePayAvailable(tenantSlug))
      ? 'line_pay'
      : rawPayment === 'ecpay_credit' && (await isEcpayAvailable(tenantSlug))
        ? 'ecpay_credit'
        : rawPayment === 'ecpay_atm' && (await isEcpayAtmAvailable(tenantSlug))
          ? 'ecpay_atm'
          : rawPayment === 'qr' && (await getQrPaymentPublic(tenantSlug))
            ? 'qr'
            : 'bank';
  // 統編不另開欄位(2026-09-11 Peter 決定,2026-11-07 再次確認):需要統編的客人寫在備註
  // Phase 33:折扣碼只收文字,不收金額;server 重驗重算
  const discountCodeRaw = String(formData.get('discount_code') ?? '');
  const cartItemsRaw = String(formData.get('cartItems') ?? '[]');

  if (!tenantSlug) return { ok: false, error: '無攤位資訊' };
  if (!recipient) return { ok: false, error: '請填收件人姓名' };
  if (!phone) return { ok: false, error: '請填聯絡電話' };
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return { ok: false, error: 'Email 格式不對' };
  // 地址:店到店用門市代替、自取不用填,下面決定配送方式時再檢查

  let cartItems: CartItemInput[];
  try {
    const parsed = parseCartItems(JSON.parse(cartItemsRaw));
    if (!parsed) throw new Error('not array');
    cartItems = parsed;
  } catch {
    return { ok: false, error: '購物車資料異常' };
  }

  if (cartItems.length === 0) return { ok: false, error: '購物車是空的' };

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // 定價(特價 / 組合品 / 分階)、驗下架與庫存:跟結帳頁套折扣碼的預覽同一支
  const priced = await priceCart(tenant, cartItems);
  if (!priced.ok) return { ok: false, error: priced.error };
  const { pricedItems, subtotal } = priced;

  // Phase 35(2026-11-07):有團購商品 → 團必須還在收單中,否則整張擋下;通過就記下屬於哪一團
  const gbCheck = await checkCartGroupBuy(tenant.id, [...new Set(pricedItems.map((i) => i.product_id))]);
  if (!gbCheck.ok) return { ok: false, error: gbCheck.error };
  const groupBuyId = gbCheck.groupBuyId;

  // D#13:運費 server 端計算(免運門檻用特價 / 量購價後、折扣碼折抵前的商品小計)
  const shipOptions = await getShippingOptions(tenantSlug);
  let shippingFee = 0;
  let shippingKey: string | null = null;
  let cvsType: CvsChain | null = null;
  let finalAddress = address;
  if (shipOptions.length > 0) {
    const opt = shipOptions.find((o) => o.key === shippingMethod);
    if (!opt) return { ok: false, error: '請選擇配送方式' };
    shippingFee = opt.free_over && subtotal >= opt.free_over ? 0 : opt.fee;
    shippingKey = opt.key;
    // Phase 29:店到店 — 門市必填,地址用門市字串代替(出貨單、後台、訂單頁都看得懂)
    if (opt.cvs) {
      if (!cvsStoreName) return { ok: false, error: '請填取貨門市名稱' };
      if (!/^\d{3,10}$/.test(cvsStoreId)) return { ok: false, error: '請填門市店號(3 到 10 位數字)' };
      cvsType = opt.cvs;
      finalAddress = cvsStoreText(opt.cvs, cvsStoreName, cvsStoreId);
    } else if (opt.key === 'pickup') {
      // 2026-11-06:門市自取不填地址;存固定字串,出貨單、後台、訂單頁照常顯示
      finalAddress = finalAddress || '門市自取';
    } else if (!finalAddress) {
      return { ok: false, error: '請填寄送地址' };
    }
  } else if (!finalAddress) {
    return { ok: false, error: '請填寄送地址' };
  }

  // Phase 33:折扣碼只先正規化,驗證放在防重複檢查「之後」—
  // 雙擊 / 網路重送的第二個請求若先驗碼,會被自己的第一張單判成「已用過 / 已用完」,
  // 客人移除碼再送就建出第二張全價單;先比對既有單就直接回第一張單號
  const discountCodeWanted = normalizeCode(discountCodeRaw) || null;

  // 2026-09-21 防重複下單:同電話 2 分鐘內送出「內容完全相同」的單,
  // 直接回第一筆的單號(雙擊 / 網路重送不再建新單、不重複扣庫存)
  // Phase 33:折扣碼也要一樣(第一張沒帶碼、第二張帶碼不能回第一張)
  const cartSig = cartItems.map((c) => `${c.variantId}x${c.qty}`).sort().join(',');
  const { data: recentDup } = await supabaseAdmin
    .from('orders')
    .select('order_no, access_key, discount_code, order_items(variant_id, qty)')
    .eq('tenant_id', tenant.id)
    .eq('shipping_phone', phone)
    .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentDup) {
    const dup = recentDup as { order_no: string; access_key: string | null; discount_code: string | null; order_items: { variant_id: string | null; qty: number }[] | null };
    const dupSig = (dup.order_items ?? []).map((i) => `${i.variant_id}x${i.qty}`).sort().join(',');
    if (dupSig === cartSig && (dup.discount_code ?? null) === discountCodeWanted) {
      console.warn('[createOrder] 2 分鐘內重複下單,回既有單號', dup.order_no);
      return { ok: true, orderNo: dup.order_no, accessKey: dup.access_key ?? null };
    }
  }

  // Phase 33:折扣碼 — 有帶碼才驗;驗不過整張不建單,回 discountInvalid 讓前端清掉已套用的碼
  //(絕不默默拿掉折扣或照前端金額收)
  let discountCode: string | null = null;
  let discountTwd = 0;
  if (discountCodeWanted) {
    const dc = await validateDiscountCode(tenant.id, discountCodeRaw, subtotal, phone);
    if (!dc.ok) return { ok: false, error: `${dc.error}。已幫您移除折扣碼,請確認金額後再送出一次`, discountInvalid: true };
    discountCode = dc.row.code;
    discountTwd = dc.discount_twd;
  }

  // Phase 26:已登入就把訂單綁到會員(platform_users),「我的訂單」靠這個找;沒登入維持訪客單
  const member = await getCurrentMember().catch(() => null);

  // 2026-11-08:網頁單也綁 LINE 好友 — 會員有 line_user_id、而且是這個攤位的 LINE 好友(users 有列)就寫 orders.user_id,
  // 付款成功 / 逾期提醒 / 退款 / 團購到貨這些 LINE 通知都是靠 orders.user_id → users.line_user_id 找人,
  // 以前只有 LIFF 單有,網頁單一律收不到。不是好友的人 LINE 本來就推不到,維持 null。
  let lineFriendId: string | null = null;
  if (member?.line_user_id) {
    const { data: friend, error: friendErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('line_user_id', member.line_user_id)
      .maybeSingle();
    if (friendErr) console.error('[createOrder users]', friendErr);
    lineFriendId = (friend as { id: string } | null)?.id ?? null;
  }

  // 建 order(order_no / total_twd 由 trigger 處理;total_twd = 商品小計,運費另存)
  const { data: orderRow, error: oErr } = await supabaseAdmin
    .from('orders')
    .insert({
      ...(member ? { platform_user_id: member.id } : {}),
      ...(lineFriendId ? { user_id: lineFriendId } : {}),
      tenant_id: tenant.id,
      status: 'open',
      payment_status: 'pending',
      payment_method: paymentMethod,
      source: 'web',
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: finalAddress,
      shipping_method: shippingKey,
      shipping_fee_twd: shippingFee,
      // Phase 29:店到店的門市;宅配 / 自取為 null
      cvs_type: cvsType,
      cvs_store_id: cvsType ? cvsStoreId : null,
      cvs_store_name: cvsType ? cvsStoreName : null,
      note: note || null,
      guest_email: guestEmail || null,
      guest_phone: phone,
      // Phase 33:折扣碼(大寫文字)與折扣金額;total_twd 仍由 trigger 從 items 算,應付 = orderPayable()
      discount_code: discountCode,
      discount_twd: discountTwd,
      // Phase 35:有團購商品就記當時收單中的團(沒有 → null)
      group_buy_id: groupBuyId,
    })
    .select('id, order_no, access_key')
    .single();

  if (oErr || !orderRow) {
    // Phase 33:trigger 的列鎖擋到最後一個名額被搶走 → 整張沒建,請客人移除碼再送
    if (oErr?.message?.includes('DISCOUNT_CODE_EXHAUSTED')) {
      return { ok: false, error: '這組折扣碼剛好被用完了。已幫您移除折扣碼,請確認金額後再送出一次', discountInvalid: true };
    }
    // Phase 33:「每人一次」的 DB 層保證(trigger 用 advisory lock 擋同電話同時送兩張)
    if (oErr?.message?.includes('DISCOUNT_CODE_USED')) {
      return { ok: false, error: '這組折扣碼每位客人限用一次,這個電話已經用過了。已幫您移除折扣碼,請確認金額後再送出一次', discountInvalid: true };
    }
    console.error('[createOrder insert order]', oErr);
    return { ok: false, error: '建立訂單失敗' };
  }

  // Phase 16(#12):滿額贈 — 特價 / 量購價後、折扣碼折抵前的小計達標的規則各加一行 0 元贈品
  const giftItems = await buildGiftItems(tenant.id, subtotal);
  const itemsToInsert = [
    ...pricedItems.map((it) => ({
      ...it,
      order_id: (orderRow as { id: string }).id,
    })),
    ...giftItems.map((g) => ({
      tenant_id: tenant.id,
      order_id: (orderRow as { id: string }).id,
      ...g,
    })),
  ];

  const { error: iErr } = await supabaseAdmin.from('order_items').insert(itemsToInsert);

  if (iErr) {
    // Phase 33:把空單刪掉(跟 LIFF placeOrder 一樣);空單沒有 items、沒扣庫存,
    // trigger 的 DELETE 分支會把折扣碼的 used_count 減回,不會留一張佔名額的孤兒單
    await supabaseAdmin.from('orders').delete().eq('id', (orderRow as { id: string }).id);
    console.error('[createOrder insert items]', iErr);
    return { ok: false, error: '建立訂單明細失敗' };
  }

  const created = orderRow as { order_no: string; access_key: string | null };
  // Phase 22:存取碼跟著回前端,下單完成頁的連結要帶 ?k= 才看得到完整訂單
  return { ok: true, orderNo: created.order_no, accessKey: created.access_key ?? null };
}

// ====================
// 2026-10-15:LINE Pay 線上付款
// Phase 34(2026-11-06):可用 = NEOP 的 feature flag 有開(方案權限)且該攤位有自己的金鑰
//(tenants.payment_config 解得開,或 DEFAULT_TENANT_ID 的環境變數退路)。flag 先判,沒開不讀 DB、不解密。
// ====================

/** 這個攤位能不能用 LINE Pay(feature flag 開 + 該攤位有金鑰) */
export async function isLinePayAvailable(tenantSlug: string): Promise<boolean> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !hasFeature(tenant, 'line_pay')) return false;
  return isLinePayConfigured(tenant.id);
}

/**
 * 2026-10-22:這個攤位能不能用綠界(信用卡 / ATM 虛擬帳號)— feature flag 開 + 該攤位有金鑰。
 * 綠界的付款是瀏覽器導到 /api/ecpay/pay 再表單跳轉,不像 LINE Pay 需要 server action 發動。
 */
export async function isEcpayAvailable(tenantSlug: string): Promise<boolean> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !hasFeature(tenant, 'ecpay')) return false;
  return isEcpayConfigured(tenant.id);
}

/**
 * ATM 虛擬帳號另外用 ecpay_atm flag 控制。
 * 2026-10-22 Peter 決定先只開信用卡(人工匯款保留),ATM 程式留著,要開再把 flag 打開。
 */
export async function isEcpayAtmAvailable(tenantSlug: string): Promise<boolean> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !hasFeature(tenant, 'ecpay') || !hasFeature(tenant, 'ecpay_atm')) return false;
  return isEcpayConfigured(tenant.id);
}

export type StartLinePayResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; error: string };

/**
 * 對一張既有訂單發動 LINE Pay 付款,回付款頁網址(前端自行跳轉)。
 * 金額一律以 DB 的訂單金額為準,不信任前端傳來的數字。
 */
export async function startLinePay(
  tenantSlug: string,
  orderNo: string,
  /** Phase 22:訂單存取碼,對不上不給發動(cancelUrl 會帶碼回訂單頁,不驗的話等於把碼送人) */
  accessKey: string,
): Promise<StartLinePayResult> {
  if (!(await isLinePayAvailable(tenantSlug))) {
    return { ok: false, error: '此攤位未開放 LINE Pay' };
  }
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total_twd, discount_twd, shipping_fee_twd, payment_status, status, payment_method, access_key')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const order = data as {
    id: string;
    order_no: string;
    total_twd: number;
    discount_twd: number | null; // Phase 33
    shipping_fee_twd: number | null;
    payment_status: string;
    status: string;
    payment_method: string | null;
    access_key: string | null;
  } | null;

  if (!order) return { ok: false, error: '找不到訂單' };
  if (!order.access_key || accessKey !== order.access_key) {
    console.warn('[startLinePay] 存取碼不符', orderNo);
    return { ok: false, error: '連結無效,請從訂單頁的連結操作' };
  }
  if (order.payment_status === 'paid') return { ok: false, error: '這筆訂單已付款' };
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return { ok: false, error: '這筆訂單已取消' };
  }
  // 2026-10-23:只有結帳時就選 LINE Pay 的單才能發動(單號連號,不擋會被拿來改別人的單)
  if (order.payment_method !== 'line_pay') {
    return { ok: false, error: '這筆訂單不是 LINE Pay 付款' };
  }

  // Phase 33:應付 = 商品小計 − 折扣 + 運費
  const amount = orderPayable(order);
  if (amount <= 0) return { ok: false, error: '訂單金額異常,請聯絡客服' };

  const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
  const result = await requestLinePayPayment({
    tenantId: tenant.id, // Phase 34:用這個攤位自己的金鑰
    orderNo: order.order_no,
    amount,
    productName: `${tenant.name} 訂單 ${order.order_no}`,
    // LINE Pay 會在 confirmUrl 後面自動帶 transactionId / orderId
    confirmUrl: `${baseUrl}/api/linepay/confirm?slug=${encodeURIComponent(tenantSlug)}`,
    cancelUrl: `${baseUrl}/${tenantSlug}/order/${order.order_no}?linepay=cancel${order.access_key ? `&k=${order.access_key}` : ''}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // 存交易序號:導回來時要比對是不是同一筆(也方便之後對帳/退款查詢)
  const { error: updErr } = await supabaseAdmin
    .from('orders')
    .update({ payment_method: 'line_pay', linepay_transaction_id: result.transactionId })
    .eq('id', order.id);
  if (updErr) {
    console.error('[startLinePay] 存交易序號失敗', updErr);
    return { ok: false, error: '系統忙線,請稍後再試' };
  }

  return { ok: true, paymentUrl: result.paymentUrl };
}

/** 訂單頁「用 LINE Pay 付款」按鈕用:發動付款並直接導去付款頁 */
export async function startLinePayAndRedirect(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const orderNo = String(formData.get('order_no') ?? '').trim();
  const k = String(formData.get('k') ?? '').trim();
  const result = await startLinePay(slug, orderNo, k);
  redirect(result.ok ? result.paymentUrl : `/${slug}/order/${orderNo}?linepay=failed${k ? `&k=${encodeURIComponent(k)}` : ''}`);
}
