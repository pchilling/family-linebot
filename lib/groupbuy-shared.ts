/**
 * 團購(Phase 35,2026-11-07)— 純函式與型別,沒有任何 server import。
 * client component / LIFF page.tsx 直接 import 這個檔;server 端用 lib/groupbuy.ts(它 re-export 這裡全部,再加 DB helper)。
 * 規格:docs/GROUPBUY.md。
 */

export type ProductChannel = 'stall' | 'groupbuy';
export type GroupBuyStatus = 'draft' | 'open' | 'closed' | 'ordered' | 'arrived' | 'done';

/** 可以送到前端(client component / LIFF)的團資訊;status 已經是「有效狀態」(見 effectiveStatus) */
export type GroupBuyPublic = {
  id: string;
  name: string;
  description: string | null;
  ends_at: string | null;
  expected_arrival_on: string | null; // date 欄位 → 'YYYY-MM-DD'
  status: GroupBuyStatus;
  is_open: boolean;
  arrived_at: string | null; // 訂單時間軸要用
};

export type GroupBuyState = { current: GroupBuyPublic | null; last: GroupBuyPublic | null };

export const GROUP_BUY_STATUS_LABEL: Record<GroupBuyStatus, string> = {
  draft: '草稿',
  open: '收單中',
  closed: '已截止',
  ordered: '已訂貨',
  arrived: '已到貨',
  done: '結團',
};

export const GROUPBUY_CLOSED_ERROR = '本團已截止,請移除團購商品再送出';
export const GROUPBUY_NOT_OPEN_ERROR = '目前沒開團,團購商品暫時不能購買';

/**
 * 有效狀態:DB 是 open 但 ends_at 已到 → 視為 closed(讀取時算,不靠排程);其餘照 DB。
 * 全站只能用這支判定,不要自己比時間。
 */
export function effectiveStatus(
  g: { status: GroupBuyStatus; ends_at: string | null },
  now: Date = new Date(),
): GroupBuyStatus {
  if (g.status === 'open' && g.ends_at) {
    const end = new Date(g.ends_at).getTime();
    if (Number.isFinite(end) && end <= now.getTime()) return 'closed';
  }
  return g.status;
}

export function isGroupBuyOpen(
  g: { status: GroupBuyStatus; ends_at: string | null },
  now: Date = new Date(),
): boolean {
  return effectiveStatus(g, now) === 'open';
}

/** 'YYYY-MM-DD' → 'MM/DD';null 或格式不對 → '待定' */
export function fmtArrival(d: string | null): string {
  if (!d) return '待定';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return '待定';
  return `${m[2]}/${m[3]}`;
}

/** 客人端整句:有日期 → '預計 MM/DD 到貨';留空 → '到貨日待定'(避免印成「預計 待定 到貨」) */
export function fmtArrivalPhrase(d: string | null): string {
  const s = fmtArrival(d);
  return s === '待定' ? '到貨日待定' : `預計 ${s} 到貨`;
}

/** ISO → '11/12 23:59'(台北);null → '手動截止' */
export function fmtEndsAt(iso: string | null): string {
  if (!iso) return '手動截止';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '手動截止';
  // 用 UTC 位移算台北時間,避免各執行環境 Intl 格式不一致(有的會多空白或用全形冒號)
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(tw.getUTCMonth() + 1)}/${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}

/** group_buys 原始列的形狀(DB helper 的 GroupBuyRow 也是這個形狀;這裡只列 toGroupBuyPublic 用得到的欄位) */
type GroupBuyRowLike = {
  id: string;
  name: string;
  description: string | null;
  ends_at: string | null;
  expected_arrival_on: string | null;
  status: GroupBuyStatus;
  arrived_at: string | null;
};

/** 原始列 → 可送前端的物件;status 換成有效狀態 */
export function toGroupBuyPublic(row: GroupBuyRowLike, now: Date = new Date()): GroupBuyPublic {
  const status = effectiveStatus(row, now);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    ends_at: row.ends_at ?? null,
    expected_arrival_on: row.expected_arrival_on ?? null,
    status,
    is_open: status === 'open',
    arrived_at: row.arrived_at ?? null,
  };
}
