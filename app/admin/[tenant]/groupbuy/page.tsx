import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, orderPayable, supabaseAdmin } from '@/lib/supabase';
import {
  effectiveStatus,
  fmtArrival,
  fmtEndsAt,
  GROUP_BUY_SELECT,
  GROUP_BUY_STATUS_LABEL,
  type GroupBuyRow,
  type GroupBuyStatus,
} from '@/lib/groupbuy';
import { IconUsers } from '@/lib/icons';
import { SubmitButton } from '../../_components/submit-button';
import { FlashToast } from '../../../_components/toast';
import { closeGroupBuy, markGroupBuyArrived, markGroupBuyDone, markGroupBuyOrdered, reopenGroupBuy } from './actions';

/**
 * 後台「團購」列表(Phase 35,2026-11-07)。規格:docs/GROUPBUY.md 第六節。
 * 每列:團名 / 狀態 / 截止 / 預計到貨 / 幾筆 · 幾人 / 金額 / 依狀態的操作鈕。
 * 狀態一律用 effectiveStatus(時間到了的 open 團顯示已截止,不靠排程)。
 */

type OrderLite = {
  id: string;
  status: string;
  group_buy_id: string;
  shipping_phone: string | null;
  platform_user_id: string | null;
  user_id: string | null;
  total_twd: number;
  discount_twd: number | null;
  shipping_fee_twd: number | null;
};
type Stats = { orders: number; people: number; amount: number };

async function getGroupBuys(tenantId: string): Promise<GroupBuyRow[]> {
  const { data } = await supabaseAdmin
    .from('group_buys')
    .select(GROUP_BUY_SELECT)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data as GroupBuyRow[] | null) ?? [];
}

/** 一次撈所有團的訂單在程式裡彙總;非取消訂單才算;人數 = distinct(platform_user_id ?? user_id ?? 電話) */
async function getStats(tenantId: string, ids: string[]): Promise<Map<string, Stats>> {
  const map = new Map<string, Stats>();
  if (ids.length === 0) return map;
  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, status, group_buy_id, shipping_phone, platform_user_id, user_id, total_twd, discount_twd, shipping_fee_twd')
    .eq('tenant_id', tenantId)
    .in('group_buy_id', ids);
  const people = new Map<string, Set<string>>();
  for (const o of ((data ?? []) as OrderLite[])) {
    if (o.status === 'cancelled' || o.status === 'refunded') continue;
    const s = map.get(o.group_buy_id) ?? { orders: 0, people: 0, amount: 0 };
    s.orders += 1;
    s.amount += orderPayable(o);
    map.set(o.group_buy_id, s);
    const who = o.platform_user_id ?? o.user_id ?? ((o.shipping_phone ?? '').replace(/\D/g, '') || o.id);
    const set = people.get(o.group_buy_id) ?? new Set<string>();
    set.add(who);
    people.set(o.group_buy_id, set);
  }
  for (const [id, set] of people) {
    const s = map.get(id);
    if (s) s.people = set.size;
  }
  return map;
}

const STATUS_CLS: Record<GroupBuyStatus, string> = {
  draft: 'gb-st-draft',
  open: 'gb-st-open',
  closed: 'gb-st-closed',
  ordered: 'gb-st-ordered',
  arrived: 'gb-st-arrived',
  done: 'gb-st-done',
};

const CSS = `
.gb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.gb-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.gb-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.gb-list{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.gb-row{display:grid;grid-template-columns:minmax(0,1.6fr) 90px 120px 90px 110px 110px minmax(200px,auto);gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.gb-row:first-child{border-top:0}
.gb-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px}
.gb-row .r{text-align:right;font-variant-numeric:tabular-nums}
.gb-row .muted{color:#71717a;font-size:13px}
.gb-name{font-weight:600;color:#18181b;text-decoration:none}
.gb-name:hover{text-decoration:underline}
.gb-sub{font-size:12px;color:#71717a;margin-top:2px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.gb-ops{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.gb-ops form{margin:0;display:inline-flex}
.gb-st-open{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.gb-st-closed{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
.gb-st-ordered{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.gb-st-arrived{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
.gb-st-done{background:#f4f4f5;color:#71717a;border-color:transparent}
.gb-st-draft{background:#f4f4f5;color:#71717a;border-color:transparent}
.gb-empty{padding:48px 16px;text-align:center;color:#71717a;font-size:14px;line-height:1.7}
.gb-callout{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:#fafafa;border:1px solid #e4e4e7;font-size:13px;color:#52525b;line-height:1.6;margin-bottom:14px}
.gb-callout svg{margin-top:2px;color:#71717a;flex:none}
@media (max-width:767px){
  .gb-head{align-items:flex-start;flex-direction:column}
  .gb-list{border-radius:10px}
  .gb-row{grid-template-columns:1fr auto;grid-template-areas:"name st" "ends ends" "arr arr" "cnt amt" "ops ops";gap:4px 12px;padding:12px 14px}
  .gb-row.head{display:none}
  .c-name{grid-area:name}.c-st{grid-area:st}.c-ends{grid-area:ends}.c-arr{grid-area:arr}.c-amt{grid-area:amt}.c-ops{grid-area:ops}
  .gb-row .c-cnt{grid-area:cnt;text-align:left}  /* 特定度要壓過 .gb-row .r 的靠右,手機版「筆數 · 人數」才會靠左 */
  .gb-ops{justify-content:flex-start;margin-top:6px}
  .c-ends::before{content:'截止 ';color:#a1a1aa}
  .c-arr::before{content:'預計到貨 ';color:#a1a1aa}
}
`;

export default async function GroupBuyListPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const rows = await getGroupBuys(tenant.id);
  const stats = await getStats(tenant.id, rows.map((r) => r.id));
  const now = new Date();
  const hasOpen = rows.some((r) => effectiveStatus(r, now) === 'open');
  const money = (n: number) => `NT$ ${n.toLocaleString()}`;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {sp.saved === 'closed' && <FlashToast message="已截止收單" />}
      {sp.saved === 'reopened' && <FlashToast message="已重新開放收單" />}
      {sp.saved === 'ordered' && <FlashToast message="已標為已訂貨" />}
      {sp.saved === 'done' && <FlashToast message="已結團" />}

      <header className="gb-head">
        <div>
          <h1>團購</h1>
          <p>先收單、截止後統一訂貨、到貨再分送。同一時間只能有一團收單中。</p>
        </div>
        {hasOpen ? (
          <span className="ui-btn ui-btn-primary ui-btn-sm" aria-disabled="true" title="目前有一團收單中,先截止才能開新團">
            開團
          </span>
        ) : (
          <Link href={`/admin/${tenant.slug}/groupbuy/new`} className="ui-btn ui-btn-primary ui-btn-sm">
            開團
          </Link>
        )}
      </header>

      {hasOpen && (
        <div className="gb-callout">
          <IconUsers size={15} />
          <span>目前有一團收單中,要開新團請先把它截止。團購分頁的客人現在就能看到並下單。</span>
        </div>
      )}

      <div className="gb-list">
        {rows.length === 0 ? (
          <div className="gb-empty">
            還沒開過團。按右上角「開團」,填團名、截止時間、預計到貨日就能開始收單。
            <br />
            團購商品要先到商品編輯頁把「賣在哪裡」改成團購。
          </div>
        ) : (
          <>
            <div className="gb-row head" aria-hidden>
              <span>團</span>
              <span>狀態</span>
              <span>截止</span>
              <span>預計到貨</span>
              <span className="r">筆數 · 人數</span>
              <span className="r">金額</span>
              <span />
            </div>
            {rows.map((g) => {
              const st = effectiveStatus(g, now);
              const s = stats.get(g.id) ?? { orders: 0, people: 0, amount: 0 };
              const detailHref = `/admin/${tenant.slug}/groupbuy/${g.id}`;
              const hidden = (
                <>
                  <input type="hidden" name="tenant_slug" value={tenant.slug} />
                  <input type="hidden" name="id" value={g.id} />
                </>
              );
              return (
                <div key={g.id} className="gb-row">
                  <div className="c-name" style={{ minWidth: 0 }}>
                    <Link href={detailHref} className="gb-name">{g.name}</Link>
                    {g.description && <div className="gb-sub">{g.description}</div>}
                  </div>
                  <div className="c-st">
                    <span className={`ui-badge ${STATUS_CLS[st]}`}>{GROUP_BUY_STATUS_LABEL[st]}</span>
                  </div>
                  <div className="c-ends muted">{fmtEndsAt(g.ends_at)}</div>
                  <div className="c-arr muted">{fmtArrival(g.expected_arrival_on)}</div>
                  <div className="c-cnt r">
                    {s.orders} 筆 · {s.people} 人
                  </div>
                  <div className="c-amt r" style={{ fontWeight: s.amount > 0 ? 600 : 400 }}>
                    {s.amount > 0 ? money(s.amount) : '—'}
                  </div>
                  <div className="c-ops gb-ops">
                    <Link href={detailHref} className="ui-btn ui-btn-outline ui-btn-xs">看詳情</Link>
                    {st === 'open' && (
                      <form action={closeGroupBuy}>
                        {hidden}
                        <SubmitButton size="sm" variant="secondary" pendingText="處理中…" confirmText={`確定提前截止「${g.name}」?截止後客人不能再下團購單,還沒訂貨前可以重新開放。`}>
                          提前截止
                        </SubmitButton>
                      </form>
                    )}
                    {st === 'closed' && (
                      <>
                        <form action={reopenGroupBuy}>
                          {hidden}
                          <SubmitButton
                            size="sm"
                            variant="secondary"
                            pendingText="處理中…"
                            confirmText={`重新開放「${g.name}」收單?${g.ends_at && new Date(g.ends_at).getTime() <= now.getTime() ? '原本的截止時間已經過了,會改成手動截止,之後要自己按「提前截止」。' : ''}`}
                          >
                            重新開放
                          </SubmitButton>
                        </form>
                        <form action={markGroupBuyOrdered}>
                          {hidden}
                          <SubmitButton size="sm" pendingText="處理中…" confirmText={`確定已向供應商訂貨「${g.name}」?標了之後就不能再重新開放收單。`}>
                            標已訂貨
                          </SubmitButton>
                        </form>
                      </>
                    )}
                    {st === 'ordered' && (
                      <form action={markGroupBuyArrived}>
                        {hidden}
                        <SubmitButton size="sm" pendingText="推播中…" confirmText={`確定「${g.name}」已到貨?會推 LINE 通知給本團每張單的客人,每人一則,會用掉推播額度。`}>
                          標到貨
                        </SubmitButton>
                      </form>
                    )}
                    {st === 'arrived' && (
                      <form action={markGroupBuyDone}>
                        {hidden}
                        <SubmitButton size="sm" variant="secondary" pendingText="處理中…" confirmText={`結團「${g.name}」?結團後不能再編輯。`}>
                          結團
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
