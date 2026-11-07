import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, orderPayable } from '@/lib/supabase';
import {
  effectiveStatus,
  fmtArrival,
  fmtEndsAt,
  getGroupBuyById,
  getGroupBuyOrders,
  GROUP_BUY_STATUS_LABEL,
  isCancelledOrder,
  summarizeGroupBuyItems,
  type GroupBuyStatus,
} from '@/lib/groupbuy';
import { IconCheck, IconChevronLeft, IconDownload, IconPencil } from '@/lib/icons';
import { SubmitButton } from '../../../_components/submit-button';
import { FlashToast } from '../../../../_components/toast';
import { closeGroupBuy, markGroupBuyArrived, markGroupBuyDone, markGroupBuyOrdered, reopenGroupBuy, updateGroupBuy } from '../actions';

/**
 * 團詳情(Phase 35,2026-11-07)。規格:docs/GROUPBUY.md 第六節。
 * 四格數字(訂單數 / 人數、已付款筆數、金額、件數)、五步流程、彙總單(商品 × 規格,已付款 / 全部兩組數字,可匯出 CSV)、本團訂單。
 */

const STATUS_CLS: Record<GroupBuyStatus, string> = {
  draft: 'gbd-st-draft',
  open: 'gbd-st-open',
  closed: 'gbd-st-closed',
  ordered: 'gbd-st-ordered',
  arrived: 'gbd-st-arrived',
  done: 'gbd-st-done',
};
const STEPS: GroupBuyStatus[] = ['open', 'closed', 'ordered', 'arrived', 'done'];
const ORDER_STATUS: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};

function fmtTw(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
/** ISO → datetime-local 的值(台北) */
function toLocalInput(iso: string): string {
  const tw = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())}T${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}
const money = (n: number) => `NT$ ${n.toLocaleString()}`;

const CSS = `
.gbd-back{display:inline-flex;align-items:center;gap:2px;font-size:13px;color:#71717a;text-decoration:none;margin-bottom:10px}
.gbd-back:hover{color:#18181b}
.gbd-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.gbd-top h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.gbd-top .sp{flex:1}
.gbd-ops{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.gbd-ops form{margin:0;display:inline-flex}
.gbd-meta{font-size:13px;color:#71717a;margin:6px 0 18px;line-height:1.6}
.gbd-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:18px 20px;margin-bottom:16px}
.gbd-card h2{margin:0 0 12px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
.gbd-card h2 .hint{margin-left:auto;font-size:12px;font-weight:400;color:#a1a1aa}
.gbd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.gbd-stat{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:14px 16px}
.gbd-stat .l{font-size:12px;color:#71717a}
.gbd-stat .v{font-size:22px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}
.gbd-stat .s{font-size:12px;color:#71717a;margin-top:2px}
.gbd-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative}
.gbd-step{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;position:relative;padding:0 6px}
.gbd-step .dot{width:26px;height:26px;border-radius:50%;border:2px solid #e4e4e7;background:#fff;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:600;position:relative;z-index:1}
.gbd-step[data-done="true"] .dot{background:#18181b;border-color:#18181b}
.gbd-step[data-now="true"] .dot{border-color:#18181b;color:#18181b;box-shadow:0 0 0 4px #f4f4f5}
.gbd-step .n{font-size:13px;font-weight:500;color:#71717a}
.gbd-step[data-done="true"] .n,.gbd-step[data-now="true"] .n{color:#18181b;font-weight:600}
.gbd-step .t{font-size:11.5px;color:#a1a1aa;min-height:16px}
.gbd-step::before{content:"";position:absolute;top:12px;left:-50%;width:100%;height:2px;background:#e4e4e7}
.gbd-step:first-child::before{display:none}
.gbd-step[data-done="true"]::before{background:#18181b}
.gbd-step[data-now="true"]::before{background:#18181b}
.gbd-sum .row{display:grid;grid-template-columns:minmax(0,1.6fr) 110px 70px 110px 70px 110px;gap:10px;padding:10px 0;border-top:1px solid #f4f4f5;font-size:13.5px;align-items:center}
.gbd-sum .row.head{border-top:0;padding:0 0 6px;font-size:11.5px;color:#71717a}
.gbd-sum .row.total{border-top:1px solid #e4e4e7;font-weight:600}
.gbd-sum .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.gbd-sum .sku{font-size:12px;color:#a1a1aa;margin-top:2px;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.gbd-sum .grp{font-size:11px;color:#a1a1aa;font-weight:500;letter-spacing:.02em}
.gbd-ord .row{display:grid;grid-template-columns:150px minmax(0,1.4fr) 90px 80px 110px 120px;gap:10px;padding:10px 0;border-top:1px solid #f4f4f5;font-size:13.5px;align-items:center}
.gbd-ord .row.head{border-top:0;padding:0 0 6px;font-size:11.5px;color:#71717a}
.gbd-ord .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.gbd-ord .no{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-weight:600;color:#18181b;text-decoration:none}
.gbd-ord .no:hover{text-decoration:underline}
.gbd-ord .muted{color:#71717a;font-size:13px}
.gbd-ord .row[data-off="true"]{opacity:.55}
.gbd-empty{padding:24px 0;text-align:center;color:#71717a;font-size:13.5px}
.gbd-st-open{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.gbd-st-closed{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
.gbd-st-ordered{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.gbd-st-arrived{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
.gbd-st-done,.gbd-st-draft{background:#f4f4f5;color:#71717a;border-color:transparent}
.gbd-edit{margin:0 0 16px}
.gbd-edit summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#52525b;padding:6px 10px;border:1px solid #e4e4e7;border-radius:6px;background:#fff}
.gbd-edit summary::-webkit-details-marker{display:none}
.gbd-edit[open] summary{border-color:#18181b;color:#18181b}
.gbd-form{display:grid;gap:12px;margin-top:12px}
.gbd-form .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:767px){
  .gbd-card{padding:14px;border-radius:10px}
  .gbd-stats{grid-template-columns:1fr 1fr}
  .gbd-stat .v{font-size:19px}
  .gbd-step .n{font-size:11.5px}
  .gbd-step .t{display:none}
  .gbd-sum .row{grid-template-columns:minmax(0,1fr) 70px 90px;gap:6px}
  .gbd-sum .row > .c-pq,.gbd-sum .row > .c-pa{display:none}
  .gbd-ord .row{grid-template-columns:1fr auto;gap:4px 10px}
  .gbd-ord .row.head{display:none}
  .gbd-ord .row > .c-who{grid-column:1/-1}
  .gbd-ord .row > .c-time{grid-column:1/-1;text-align:left}
  .gbd-form .two{grid-template-columns:1fr}
}
`;

export default async function GroupBuyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; id: string }>;
  searchParams: Promise<{ saved?: string; sent?: string; failed?: string }>;
}) {
  const { tenant: slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const g = await getGroupBuyById(tenant.id, id);
  if (!g) notFound();

  const orders = await getGroupBuyOrders(tenant.id, g.id);
  const now = new Date();
  const st = effectiveStatus(g, now);
  const stepIdx = STEPS.indexOf(st);

  // 四格數字:非取消訂單
  const live = orders.filter((o) => !isCancelledOrder(o.status));
  const people = new Set(live.map((o) => o.platform_user_id ?? o.user_id ?? ((o.shipping_phone ?? '').replace(/\D/g, '') || o.id))).size;
  const paidCount = live.filter((o) => o.payment_status === 'paid').length;
  const amount = live.reduce((s, o) => s + orderPayable(o), 0);
  const pieces = live.reduce((s, o) => s + o.order_items.filter((it) => it.products?.channel === 'groupbuy').reduce((a, it) => a + it.qty, 0), 0);
  const summary = summarizeGroupBuyItems(orders);
  const sumTotal = summary.reduce(
    (a, l) => ({ paid_qty: a.paid_qty + l.paid_qty, paid_twd: a.paid_twd + l.paid_twd, all_qty: a.all_qty + l.all_qty, all_twd: a.all_twd + l.all_twd }),
    { paid_qty: 0, paid_twd: 0, all_qty: 0, all_twd: 0 },
  );

  // 流程各步的時間
  const stepTimes: Record<GroupBuyStatus, string | null> = {
    draft: null,
    open: g.created_at,
    closed: g.closed_at ?? (stepIdx >= 1 ? g.ends_at : null),
    ordered: g.ordered_at,
    arrived: g.arrived_at,
    done: g.done_at,
  };

  // 回饋訊息
  const sent = Number(sp.sent ?? 0) || 0;
  const failed = Number(sp.failed ?? 0) || 0;
  let toast: { message: string; tone?: 'success' | 'error' } | null = null;
  if (sp.saved === 'created') toast = { message: sp.sent !== undefined ? `已開團,LINE 通知已推給 ${sent} 位好友` : '已開團' };
  else if (sp.saved === 'edit') toast = { message: '已儲存' };
  else if (sp.saved === 'closed') toast = { message: '已截止收單' };
  else if (sp.saved === 'reopened') toast = { message: '已重新開放收單' };
  else if (sp.saved === 'ordered') toast = { message: '已標為已訂貨' };
  else if (sp.saved === 'arrived') toast = { message: `已標到貨,LINE 通知已推給 ${sent} 位客人` };
  else if (sp.saved === 'done') toast = { message: '已結團' };

  const endsExpired = !!g.ends_at && new Date(g.ends_at).getTime() <= now.getTime();
  const hidden = (
    <>
      <input type="hidden" name="tenant_slug" value={tenant.slug} />
      <input type="hidden" name="id" value={g.id} />
    </>
  );

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {toast && <FlashToast message={toast.message} tone={toast.tone} />}

      <Link href={`/admin/${tenant.slug}/groupbuy`} className="gbd-back">
        <IconChevronLeft size={14} /> 團購
      </Link>
      <div className="gbd-top">
        <h1>{g.name}</h1>
        <span className={`ui-badge ${STATUS_CLS[st]}`}>{GROUP_BUY_STATUS_LABEL[st]}</span>
        <span className="sp" />
        <div className="gbd-ops">
          {st === 'open' && (
            <form action={closeGroupBuy}>
              {hidden}
              <SubmitButton size="sm" variant="secondary" pendingText="處理中…" confirmText="確定提前截止?截止後客人不能再下團購單,還沒訂貨前可以重新開放。">
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
                  confirmText={`重新開放收單?${endsExpired ? '原本的截止時間已經過了,會改成手動截止,之後要自己按「提前截止」。' : ''}`}
                >
                  重新開放
                </SubmitButton>
              </form>
              <form action={markGroupBuyOrdered}>
                {hidden}
                <SubmitButton size="sm" pendingText="處理中…" confirmText="確定已向供應商訂貨?標了之後就不能再重新開放收單。">
                  標已訂貨
                </SubmitButton>
              </form>
            </>
          )}
          {st === 'ordered' && (
            <form action={markGroupBuyArrived}>
              {hidden}
              <SubmitButton size="sm" pendingText="推播中…" confirmText={`確定已到貨?會推 LINE 通知給本團 ${live.length} 張單的客人(有 LINE 的才推),每人一則,會用掉推播額度。`}>
                標到貨
              </SubmitButton>
            </form>
          )}
          {st === 'arrived' && (
            <form action={markGroupBuyDone}>
              {hidden}
              <SubmitButton size="sm" variant="secondary" pendingText="處理中…" confirmText="結團?結團後不能再編輯這一團。">
                結團
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
      <p className="gbd-meta">
        截止 {fmtEndsAt(g.ends_at)}
        {endsExpired && st === 'closed' && g.status === 'open' ? '(時間到自動截止)' : ''}
        {' · '}預計到貨 {fmtArrival(g.expected_arrival_on)}
        {' · '}開團 {fmtTw(g.created_at)}
        {g.description && (
          <>
            <br />
            <span style={{ whiteSpace: 'pre-wrap' }}>{g.description}</span>
          </>
        )}
      </p>

      {sp.saved === 'arrived' && failed > 0 && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#78350f', fontSize: 13, marginBottom: 14 }}>
          有 {failed} 位客人的 LINE 通知沒送成功(可能已封鎖官方帳號),請用其他方式告知。
        </div>
      )}
      {sp.saved === 'created' && failed > 0 && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#78350f', fontSize: 13, marginBottom: 14 }}>
          有 {failed} 位好友的開團通知沒送成功。
        </div>
      )}

      {/* 編輯(結團後不給) */}
      {st !== 'done' && (
        <details className="gbd-edit">
          <summary><IconPencil size={13} /> 編輯團名、說明、截止、到貨日</summary>
          <form action={updateGroupBuy} className="gbd-card gbd-form" style={{ marginTop: 10 }}>
            {hidden}
            <div>
              <label className="ui-label" htmlFor="e-name">團名</label>
              <input id="e-name" name="name" required maxLength={60} defaultValue={g.name} className="ui-input" />
            </div>
            <div>
              <label className="ui-label" htmlFor="e-desc">說明</label>
              <textarea id="e-desc" name="description" rows={4} maxLength={1000} defaultValue={g.description ?? ''} className="ui-input" />
            </div>
            <div className="two">
              <div>
                <label className="ui-label" htmlFor="e-ends">截止時間<span style={{ color: '#71717a', fontWeight: 400 }}>(留空 = 手動截止)</span></label>
                <input id="e-ends" name="ends_at" type="datetime-local" defaultValue={g.ends_at ? toLocalInput(g.ends_at) : ''} className="ui-input" style={{ display: 'block', WebkitAppearance: 'none', appearance: 'none' }} />
              </div>
              <div>
                <label className="ui-label" htmlFor="e-arr">預計到貨日</label>
                <input id="e-arr" name="expected_arrival_on" type="date" defaultValue={g.expected_arrival_on ?? ''} className="ui-input" style={{ display: 'block', WebkitAppearance: 'none', appearance: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
            </div>
          </form>
        </details>
      )}

      {/* 四格數字 */}
      <div className="gbd-stats">
        <div className="gbd-stat">
          <div className="l">訂單 / 人數</div>
          <div className="v">{live.length} <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>筆</span></div>
          <div className="s">{people} 位客人</div>
        </div>
        <div className="gbd-stat">
          <div className="l">已付款</div>
          <div className="v">{paidCount} <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>筆</span></div>
          <div className="s">{live.length - paidCount > 0 ? `${live.length - paidCount} 筆待核帳` : '全部收齊'}</div>
        </div>
        <div className="gbd-stat">
          <div className="l">金額</div>
          <div className="v">{money(amount)}</div>
          <div className="s">非取消訂單的應付加總</div>
        </div>
        <div className="gbd-stat">
          <div className="l">件數</div>
          <div className="v">{pieces} <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>件</span></div>
          <div className="s">只算團購商品</div>
        </div>
      </div>

      {/* 五步流程 */}
      <div className="gbd-card">
        <div className="gbd-steps">
          {STEPS.map((s, i) => {
            const done = i < stepIdx || st === 'done';
            const isNow = i === stepIdx && st !== 'done';
            return (
              <div key={s} className="gbd-step" data-done={done ? 'true' : 'false'} data-now={isNow ? 'true' : 'false'}>
                <span className="dot">{done ? <IconCheck size={13} color="#fff" /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: isNow ? '#18181b' : '#e4e4e7', display: 'block' }} />}</span>
                <span className="n">{GROUP_BUY_STATUS_LABEL[s]}</span>
                <span className="t">{(done || isNow) ? fmtTw(stepTimes[s]) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 彙總單 */}
      <div className="gbd-card gbd-sum">
        <h2>
          彙總單
          <span className="hint">按商品 × 規格,只算團購商品、非取消訂單</span>
          <a href={`/admin/${tenant.slug}/groupbuy/${g.id}/export`} className="ui-btn ui-btn-outline ui-btn-xs" style={{ marginLeft: 8 }}>
            <IconDownload size={12} /> 匯出 CSV
          </a>
        </h2>
        {summary.length === 0 ? (
          <div className="gbd-empty">還沒有團購訂單。</div>
        ) : (
          <>
            <div className="row head" aria-hidden>
              <span>商品 / 規格</span>
              <span className="r c-pq"><span className="grp">已付款</span> 件數</span>
              <span className="r c-pa">金額</span>
              <span className="r"><span className="grp">全部</span> 件數</span>
              <span className="r">金額</span>
              <span className="r" style={{ fontSize: 11, color: '#a1a1aa' }}>含待核帳</span>
            </div>
            {summary.map((l) => (
              <div key={l.key} className="row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500 }}>{l.product_name}</span>
                    {l.variant_name && <span className="ui-badge">{l.variant_name}</span>}
                  </div>
                  {l.sku && <div className="sku">{l.sku}</div>}
                </div>
                <span className="r c-pq">{l.paid_qty}</span>
                <span className="r c-pa" style={{ color: '#52525b' }}>{money(l.paid_twd)}</span>
                <span className="r" style={{ fontWeight: 600 }}>{l.all_qty}</span>
                <span className="r">{money(l.all_twd)}</span>
                <span />
              </div>
            ))}
            <div className="row total">
              <span>合計</span>
              <span className="r c-pq">{sumTotal.paid_qty}</span>
              <span className="r c-pa">{money(sumTotal.paid_twd)}</span>
              <span className="r">{sumTotal.all_qty}</span>
              <span className="r">{money(sumTotal.all_twd)}</span>
              <span />
            </div>
          </>
        )}
      </div>

      {/* 本團訂單 */}
      <div className="gbd-card gbd-ord">
        <h2>
          本團訂單
          <span className="hint">{orders.length} 筆{orders.length - live.length > 0 ? `,含 ${orders.length - live.length} 筆已取消 / 退款` : ''}</span>
        </h2>
        {orders.length === 0 ? (
          <div className="gbd-empty">還沒有訂單。</div>
        ) : (
          <>
            <div className="row head" aria-hidden>
              <span>單號</span>
              <span>客人</span>
              <span>狀態</span>
              <span>付款</span>
              <span className="r">金額</span>
              <span className="r">下單時間</span>
            </div>
            {orders.map((o) => {
              const who = o.shipping_recipient ?? o.users?.display_name ?? '—';
              const sub = o.users?.display_name && o.users.display_name !== who ? o.users.display_name : o.shipping_phone;
              return (
                <div key={o.id} className="row" data-off={isCancelledOrder(o.status) ? 'true' : undefined}>
                  <Link href={`/admin/${tenant.slug}/orders/${o.id}`} className="no">{o.order_no}</Link>
                  <div className="c-who" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</div>
                    {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
                  </div>
                  <span><span className={`ui-badge ob-${o.status}`}>{ORDER_STATUS[o.status] ?? o.status}</span></span>
                  <span className="muted">{o.payment_status === 'paid' ? '已付款' : '待核帳'}</span>
                  <span className="r" style={{ fontWeight: 500 }}>{money(orderPayable(o))}</span>
                  <span className="r c-time muted">{fmtTw(o.created_at)}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
