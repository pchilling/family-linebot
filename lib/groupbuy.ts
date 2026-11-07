/**
 * 團購(Phase 35,2026-11-07)— server-only 的 DB helper。
 * 沒有 'use server'(不是 action),server component 與 server action 都能 import;client component 請改 import lib/groupbuy-shared.ts。
 * 規格:docs/GROUPBUY.md。狀態判定一律走 effectiveStatus(open 且 ends_at 到了 = 已截止,讀取時算,不跑排程)。
 */
import { supabaseAdmin } from './supabase';
import {
  effectiveStatus,
  GROUPBUY_CLOSED_ERROR,
  GROUPBUY_NOT_OPEN_ERROR,
  toGroupBuyPublic,
  type GroupBuyState,
  type GroupBuyStatus,
} from './groupbuy-shared';

export * from './groupbuy-shared';

/** group_buys 原始列(select 用 GROUP_BUY_SELECT) */
export type GroupBuyRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  ends_at: string | null;
  expected_arrival_on: string | null; // date 欄位 → 'YYYY-MM-DD'
  status: GroupBuyStatus;
  notify_on_open: boolean;
  created_at: string;
  closed_at: string | null;
  ordered_at: string | null;
  arrived_at: string | null;
  done_at: string | null;
};

export const GROUP_BUY_SELECT =
  'id, tenant_id, name, description, ends_at, expected_arrival_on, status, notify_on_open, created_at, closed_at, ordered_at, arrived_at, done_at';

/** DB 裡 status='open' 的那一列(原始,有效狀態可能已經 closed);沒有回 null */
export async function getCurrentGroupBuy(tenantId: string): Promise<GroupBuyRow | null> {
  const { data, error } = await supabaseAdmin
    .from('group_buys')
    .select(GROUP_BUY_SELECT)
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[getCurrentGroupBuy]', error);
    return null;
  }
  return (data as GroupBuyRow | null) ?? null;
}

/**
 * 公開頁 / LIFF 用:current = 有效狀態 open 的團(沒有 → null);
 * last = 不是 current 的最近一團(沒開團時給「上一團狀態」用)。撈最近 5 團就夠。
 */
export async function getGroupBuyState(tenantId: string): Promise<GroupBuyState> {
  const { data, error } = await supabaseAdmin
    .from('group_buys')
    .select(GROUP_BUY_SELECT)
    .eq('tenant_id', tenantId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    console.error('[getGroupBuyState]', error);
    return { current: null, last: null };
  }
  const now = new Date();
  const rows = (data as GroupBuyRow[] | null) ?? [];
  const currentRow = rows.find((r) => effectiveStatus(r, now) === 'open') ?? null;
  const lastRow = rows.find((r) => r.id !== currentRow?.id) ?? null;
  return {
    current: currentRow ? toGroupBuyPublic(currentRow, now) : null,
    last: lastRow ? toGroupBuyPublic(lastRow, now) : null,
  };
}

export async function getGroupBuyById(tenantId: string, id: string): Promise<GroupBuyRow | null> {
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from('group_buys')
    .select(GROUP_BUY_SELECT)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[getGroupBuyById]', error);
    return null;
  }
  return (data as GroupBuyRow | null) ?? null;
}

/** 該攤位 channel='groupbuy' 的商品 id(不限 status,結帳驗證要連下架的也認得) */
export async function getGroupBuyProductIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'groupbuy');
  if (error) {
    console.error('[getGroupBuyProductIds]', error);
    return new Set();
  }
  return new Set(((data as { id: string }[] | null) ?? []).map((p) => p.id));
}

/** 送單前驗證:購物車有團購商品 → 必須有有效 open 的團,回它的 id;沒團購商品 → groupBuyId null */
export type CartGroupCheck = { ok: true; groupBuyId: string | null } | { ok: false; error: string };

export async function checkCartGroupBuy(tenantId: string, productIds: string[]): Promise<CartGroupCheck> {
  if (productIds.length === 0) return { ok: true, groupBuyId: null };
  const gbIds = await getGroupBuyProductIds(tenantId);
  const hasGroupBuyItem = productIds.some((id) => gbIds.has(id));
  if (!hasGroupBuyItem) return { ok: true, groupBuyId: null };

  const current = await getCurrentGroupBuy(tenantId);
  if (current) {
    // DB 是 open 但時間到了 → 已截止
    if (effectiveStatus(current) !== 'open') return { ok: false, error: GROUPBUY_CLOSED_ERROR };
    return { ok: true, groupBuyId: current.id };
  }
  // 沒有 open 的團:上一團是「截止過、還沒結團」(攤主手動截止 / 自動截止已落庫)→ 跟前端同一句「本團已截止」;
  // 從來沒開過團或上一團已結團 → 「目前沒開團」
  const { last } = await getGroupBuyState(tenantId);
  if (last && (last.status === 'closed' || last.status === 'ordered' || last.status === 'arrived')) {
    return { ok: false, error: GROUPBUY_CLOSED_ERROR };
  }
  return { ok: false, error: GROUPBUY_NOT_OPEN_ERROR };
}

// ---- 追蹤這家店 ----

type MemberLike = { id: string; line_user_id: string | null } | null;

/**
 * 追蹤 = tenant_followers 有列,或(member.line_user_id 有值且 users 表有同攤位 + line_user_id、status='active',即 LINE 好友)。
 * member null → false。
 */
export async function isFollowing(tenantId: string, member: MemberLike): Promise<boolean> {
  if (!member) return false;
  const { data: follow, error } = await supabaseAdmin
    .from('tenant_followers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('platform_user_id', member.id)
    .maybeSingle();
  if (error) console.error('[isFollowing tenant_followers]', error);
  if (follow) return true;

  if (!member.line_user_id) return false;
  const { data: lineUser, error: lineErr } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('line_user_id', member.line_user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (lineErr) console.error('[isFollowing users]', lineErr);
  return !!lineUser;
}

/** 只看 tenant_followers(追蹤卡顯示起始日用);LINE 好友自動算追蹤但這裡會回 null */
export async function getFollowRow(tenantId: string, platformUserId: string): Promise<{ created_at: string } | null> {
  if (!platformUserId) return null;
  const { data, error } = await supabaseAdmin
    .from('tenant_followers')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('platform_user_id', platformUserId)
    .maybeSingle();
  if (error) {
    console.error('[getFollowRow]', error);
    return null;
  }
  return (data as { created_at: string } | null) ?? null;
}

/** 追蹤:insert,已經追蹤(23505)就當成功 */
export async function followTenant(tenantId: string, platformUserId: string): Promise<void> {
  if (!tenantId || !platformUserId) return;
  const { error } = await supabaseAdmin
    .from('tenant_followers')
    .insert({ tenant_id: tenantId, platform_user_id: platformUserId });
  if (error && error.code !== '23505') {
    console.error('[followTenant]', error);
    throw new Error('追蹤失敗,請稍後再試');
  }
}

export async function unfollowTenant(tenantId: string, platformUserId: string): Promise<void> {
  if (!tenantId || !platformUserId) return;
  const { error } = await supabaseAdmin
    .from('tenant_followers')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('platform_user_id', platformUserId);
  if (error) {
    console.error('[unfollowTenant]', error);
    throw new Error('取消追蹤失敗,請稍後再試');
  }
}

/** 團購分頁能不能看:開關關 → 誰都能看;開 → 要追蹤(含 LINE 好友) */
export async function canViewGroupBuy(
  tenant: { id: string; groupbuy_followers_only: boolean },
  member: MemberLike,
): Promise<boolean> {
  if (!tenant.groupbuy_followers_only) return true;
  return isFollowing(tenant.id, member);
}

// ---- 後台用:本團訂單與彙總單(團詳情頁與 CSV 匯出共用,不屬於 A/B 契約) ----

export type GroupBuyOrderItemRow = {
  id: string;
  qty: number;
  price_at_purchase: number;
  subtotal_twd: number;
  product_id: string;
  variant_id: string | null;
  products: { name: string; channel: string | null } | null;
  product_variants: { variant_name: string; sku: string } | null;
};

export type GroupBuyOrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  platform_user_id: string | null;
  user_id: string | null;
  total_twd: number;
  discount_twd: number | null;
  shipping_fee_twd: number | null;
  created_at: string;
  users: { display_name: string | null } | null;
  order_items: GroupBuyOrderItemRow[];
};

/** 本團全部訂單(含已取消,畫面自己分),新的在前 */
export async function getGroupBuyOrders(tenantId: string, groupBuyId: string): Promise<GroupBuyOrderRow[]> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_no, status, payment_status, payment_method, shipping_recipient, shipping_phone, platform_user_id, user_id,
       total_twd, discount_twd, shipping_fee_twd, created_at, users(display_name),
       order_items(id, qty, price_at_purchase, subtotal_twd, product_id, variant_id, products(name, channel), product_variants(variant_name, sku))`,
    )
    .eq('tenant_id', tenantId)
    .eq('group_buy_id', groupBuyId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[getGroupBuyOrders]', error);
    return [];
  }
  return ((data ?? []) as unknown as GroupBuyOrderRow[]).map((o) => ({ ...o, order_items: o.order_items ?? [] }));
}

export const isCancelledOrder = (status: string) => status === 'cancelled' || status === 'refunded';

/** 彙總單一列:商品 × 規格,「已付款」與「全部(含待核帳)」兩組件數 / 金額 */
export type GroupBuySummaryLine = {
  key: string;
  product_name: string;
  variant_name: string; // 'default' 已換成空字串
  sku: string;
  paid_qty: number;
  paid_twd: number;
  all_qty: number;
  all_twd: number;
};

/** 只算非取消訂單、channel='groupbuy' 的明細;依商品名、規格名排序 */
export function summarizeGroupBuyItems(orders: GroupBuyOrderRow[]): GroupBuySummaryLine[] {
  const map = new Map<string, GroupBuySummaryLine>();
  for (const o of orders) {
    if (isCancelledOrder(o.status)) continue;
    const paid = o.payment_status === 'paid';
    for (const it of o.order_items) {
      if (it.products?.channel !== 'groupbuy') continue;
      const key = `${it.product_id}:${it.variant_id ?? ''}`;
      const line = map.get(key) ?? {
        key,
        product_name: it.products?.name ?? '(已刪除的商品)',
        variant_name: it.product_variants?.variant_name && it.product_variants.variant_name !== 'default' ? it.product_variants.variant_name : '',
        sku: it.product_variants?.sku ?? '',
        paid_qty: 0,
        paid_twd: 0,
        all_qty: 0,
        all_twd: 0,
      };
      line.all_qty += it.qty;
      line.all_twd += it.subtotal_twd;
      if (paid) {
        line.paid_qty += it.qty;
        line.paid_twd += it.subtotal_twd;
      }
      map.set(key, line);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.product_name.localeCompare(b.product_name, 'zh-Hant') || a.variant_name.localeCompare(b.variant_name, 'zh-Hant'),
  );
}
