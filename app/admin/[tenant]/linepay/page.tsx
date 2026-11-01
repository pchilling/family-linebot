/**
 * 對帳(2026-11-01 從「LINE Pay 對帳」擴成「對帳」)
 *
 * 上半:等你核帳的訂單 — 客人已回報匯款後五碼或掃碼付款,但還沒按「確認已收款」的單。
 *       每個攤位都有,點進去就是訂單明細的確認收款。
 * 下半:LINE Pay 撥款對帳(2026-10-16)— 只有開 LINE Pay 的攤位才顯示。
 *       訂單層的對帳是自動的(付款成功就自動標已付款),這裡核對的是
 *       LINE Pay 實際撥款進銀行的金額:選一段期間 → 收款與退款 → 淨額、手續費、預估撥款。
 *       手續費率因合約而異,做成可自行輸入(預設 3%)。
 *
 * 路由沿用 /linepay,舊連結不會壞。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import { IconMessage } from '@/lib/icons';

type Row = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  linepay_transaction_id: string | null;
  linepay_refunded_twd: number | null;
  paid_at: string | null;
  created_at: string;
};

type PendingRow = {
  id: string;
  order_no: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  payment_method: string | null;
  payment_reported_at: string;
  payment_last5: string | null;
  payment_note: string | null;
  shipping_recipient: string | null;
  users: { display_name: string | null } | null;
};

const METHOD_LABEL: Record<string, string> = { bank: '匯款', qr: '掃碼付款', cash: '現金' };

function twDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 預設區間:這個月 1 號到今天(台北時區) */
function defaultRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // 轉台北
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

const CSS = `
.lp-head{margin-bottom:16px}
.lp-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.lp-head p{margin:6px 0 0;font-size:13px;color:#71717a;line-height:1.6;max-width:640px}
.lp-sec{display:flex;align-items:baseline;gap:8px;margin:24px 0 10px}
.lp-sec h2{margin:0;font-size:15px;font-weight:600}
.lp-sec p{margin:0;font-size:12.5px;color:#71717a}
.lp-filter{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;padding:12px 14px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:16px}
.lp-filter .f{display:flex;flex-direction:column;gap:4px}
.lp-filter .f span{font-size:12px;color:#52525b}
.lp-filter input.ui-input{width:150px}
.lp-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:16px;overflow:hidden}
.lp-card h3{margin:0;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;gap:8px}
.lp-card h3 .n{font-weight:400;color:#71717a;font-size:13px}
.lp-card.warn{border-color:#fde68a}
.lp-card.warn h3{background:#fffbeb;color:#92400e;border-bottom-color:#fde68a}
.lp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:16px}
.lp-stat{padding:10px 12px;background:#fafafa;border:1px solid #f4f4f5;border-radius:8px}
.lp-stat .l{font-size:11.5px;color:#71717a;margin-bottom:4px}
.lp-stat .v{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.lp-stat .s{font-size:10.5px;color:#a1a1aa;margin-top:2px}
.lp-stat.payout{background:#f0fdf4;border-color:#bbf7d0}
.lp-stat.payout .l,.lp-stat.payout .s{color:#15803d}
.lp-stat.payout .v{color:#15803d;font-size:18px}
.lp-unpaid{margin:0 16px 16px;padding:9px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12.5px;color:#92400e;line-height:1.6}
.lp-row{display:grid;grid-template-columns:150px 120px 100px 100px 100px 1fr;gap:12px;align-items:center;padding:10px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.lp-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px;border-top:0}
.lp-row .r{text-align:right;font-variant-numeric:tabular-nums}
.lp-row .muted{color:#71717a;font-size:13px}
.lp-row .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:12px;color:#a1a1aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-pend{grid-template-columns:170px 90px 1.4fr 130px 110px 90px}
.lp-pend .note{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#92400e}
.lp-no{font-weight:600;color:#18181b;text-decoration:none;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:13px}
.lp-no:hover{text-decoration:underline}
.lp-sub{font-size:12px;color:#71717a;margin-top:2px}
.lp-empty{padding:28px 16px;text-align:center;color:#71717a;font-size:13.5px}
@media (max-width:767px){
  .lp-filter input.ui-input{width:100%}
  .lp-filter .f{flex:1 1 45%}
  .lp-card{border-radius:10px}
  .lp-row{grid-template-columns:1fr auto;gap:4px 12px;padding:12px 14px}
  .lp-row.head{display:none}
  .lp-row > .c-txn{grid-column:1/-1}
  .lp-row > .c-paid{grid-column:1}
  .lp-row > .c-net{grid-column:2;grid-row:1}
  .lp-pend > .c-note,.lp-pend > .c-time{grid-column:1/-1}
  .lp-pend > .c-amt{grid-column:2;grid-row:1}
  .lp-pend > .c-go{grid-column:1/-1;justify-self:end}
}
`;

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ from?: string; to?: string; rate?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const hasLinePay = hasFeature(tenant, 'line_pay');

  const fallback = defaultRange();
  const from = sp.from || fallback.from;
  const to = sp.to || fallback.to;
  const rate = Math.max(0, Math.min(100, Number(sp.rate ?? 3) || 0));

  // 含 to 當天:lt 隔天 00:00(台北)
  const toEnd = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000).toISOString();

  const [{ data: pendingRaw }, { data }] = await Promise.all([
    // 客人回報了(後五碼 / 掃碼)但還沒確認收款的單,跟總覽的「待核帳」同一條件
    supabaseAdmin
      .from('orders')
      .select('id, order_no, total_twd, shipping_fee_twd, payment_method, payment_reported_at, payment_last5, payment_note, shipping_recipient, users(display_name)')
      .eq('tenant_id', tenant.id)
      .eq('payment_status', 'pending')
      .not('payment_reported_at', 'is', null)
      .not('status', 'in', '(cancelled,refunded)')
      .order('payment_reported_at', { ascending: false })
      .limit(100),
    hasLinePay
      ? supabaseAdmin
          .from('orders')
          .select(
            'id, order_no, status, payment_status, total_twd, shipping_fee_twd, linepay_transaction_id, linepay_refunded_twd, paid_at, created_at',
          )
          .eq('tenant_id', tenant.id)
          .eq('payment_method', 'line_pay')
          .not('linepay_transaction_id', 'is', null)
          .gte('created_at', `${from}T00:00:00+08:00`)
          .lt('created_at', toEnd)
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const pending = ((pendingRaw ?? []) as unknown) as PendingRow[];
  const rows = (data ?? []) as unknown as Row[];
  // 只有真的收到錢的才列入對帳(付款成功過 = 已付款或後來退款)
  const settled = rows.filter((r) => r.payment_status === 'paid' || r.payment_status === 'refunded');
  const unpaid = rows.filter((r) => r.payment_status === 'pending');

  const gross = settled.reduce((s, r) => s + r.total_twd + (r.shipping_fee_twd ?? 0), 0);
  const refunded = settled.reduce((s, r) => s + (r.linepay_refunded_twd ?? 0), 0);
  const net = gross - refunded;
  const fee = Math.round((net * rate) / 100);
  const payout = net - fee;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        <header className="lp-head">
          <h1>對帳</h1>
          <p>
            匯款和掃碼付款要你自己核對入帳;線上金流(LINE Pay、綠界)付完會自動變已收款,不用核。
            {hasLinePay && ' 下面另外有 LINE Pay 撥款對帳。'}
          </p>
        </header>

        <div className={`lp-card${pending.length > 0 ? ' warn' : ''}`}>
          <h3>
            等你核帳
            <span className="n">{pending.length > 0 ? `${pending.length} 筆` : '目前沒有'}</span>
          </h3>
          {pending.length === 0 ? (
            <div className="lp-empty">沒有等你核帳的訂單。客人在訂單頁回報付款後會出現在這裡。</div>
          ) : (
            <>
              <div className="lp-row lp-pend head" aria-hidden>
                <span>訂單</span>
                <span>方式</span>
                <span>客人回報</span>
                <span>回報時間</span>
                <span className="r">應收</span>
                <span />
              </div>
              {pending.map((o) => {
                const amount = o.total_twd + (o.shipping_fee_twd ?? 0);
                const who = o.users?.display_name ?? o.shipping_recipient ?? '';
                return (
                  <div key={o.id} className="lp-row lp-pend">
                    <div>
                      <Link href={`/admin/${tenant.slug}/orders/${o.id}`} className="lp-no">{o.order_no}</Link>
                      {who && <div className="lp-sub">{who}</div>}
                    </div>
                    <div className="muted">{METHOD_LABEL[o.payment_method ?? ''] ?? o.payment_method ?? '—'}</div>
                    <div className="c-note">
                      <span className="note">
                        <IconMessage size={13} />
                        {o.payment_method === 'qr'
                          ? `已掃碼付款${o.payment_note ? `,備註「${o.payment_note}」` : ''}`
                          : o.payment_last5
                            ? `後五碼 ${o.payment_last5}`
                            : '已回報付款'}
                      </span>
                    </div>
                    <div className="c-time muted">{twDate(o.payment_reported_at)}</div>
                    <div className="c-amt r" style={{ fontWeight: 600 }}>NT$ {amount.toLocaleString()}</div>
                    <div className="c-go" style={{ textAlign: 'right' }}>
                      <Link href={`/admin/${tenant.slug}/orders/${o.id}`} className="ui-btn ui-btn-primary ui-btn-xs">去確認</Link>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {hasLinePay && (
          <>
            <div className="lp-sec">
              <h2>LINE Pay 撥款對帳</h2>
              <p>拿「預估撥款金額」去對 LINE Pay 商家中心的撥款單。</p>
            </div>

            <form className="lp-filter">
              <label className="f">
                <span>起始日</span>
                <input type="date" name="from" defaultValue={from} className="ui-input ui-input-sm" style={{ WebkitAppearance: 'none', appearance: 'none' }} />
              </label>
              <label className="f">
                <span>結束日(含當天)</span>
                <input type="date" name="to" defaultValue={to} className="ui-input ui-input-sm" style={{ WebkitAppearance: 'none', appearance: 'none' }} />
              </label>
              <label className="f">
                <span>手續費率(%)</span>
                <input type="number" name="rate" defaultValue={rate} step="0.01" min="0" max="100" className="ui-input ui-input-sm" style={{ width: 100 }} />
              </label>
              <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">查詢</button>
            </form>

            <div className="lp-card">
              <h3>
                {from} ~ {to}
                <span className="n">合計</span>
              </h3>
              <div className="lp-stats">
                {[
                  { label: '成功收款筆數', value: `${settled.length} 筆`, note: null },
                  { label: '收款總額', value: `NT$ ${gross.toLocaleString()}`, note: '含運費' },
                  { label: '退款總額', value: `− NT$ ${refunded.toLocaleString()}`, note: refunded > 0 ? null : '沒有退款' },
                  { label: '淨收款', value: `NT$ ${net.toLocaleString()}`, note: '收款減退款' },
                  { label: `手續費(${rate}%)`, value: `− NT$ ${fee.toLocaleString()}`, note: '依你輸入的費率估算' },
                ].map((m) => (
                  <div key={m.label} className="lp-stat">
                    <div className="l">{m.label}</div>
                    <div className="v">{m.value}</div>
                    {m.note && <div className="s">{m.note}</div>}
                  </div>
                ))}
                <div className="lp-stat payout">
                  <div className="l">預估撥款金額</div>
                  <div className="v">NT$ {payout.toLocaleString()}</div>
                  <div className="s">拿這個數字對撥款單</div>
                </div>
              </div>
              {unpaid.length > 0 && (
                <div className="lp-unpaid">
                  另有 <strong>{unpaid.length}</strong> 筆發動過 LINE Pay 但客人沒付完的訂單,不計入對帳。
                  系統每天會自動再確認一次,逾期未付會自動取消並退回庫存。
                </div>
              )}
            </div>

            <div className="lp-card">
              <h3>
                明細
                <span className="n">{settled.length} 筆</span>
              </h3>
              {settled.length === 0 ? (
                <div className="lp-empty">這段期間沒有 LINE Pay 收款。</div>
              ) : (
                <>
                  <div className="lp-row head" aria-hidden>
                    <span>訂單</span>
                    <span>付款時間</span>
                    <span className="r">收款</span>
                    <span className="r">退款</span>
                    <span className="r">淨額</span>
                    <span>LINE Pay 交易序號</span>
                  </div>
                  {settled.map((r) => {
                    const amount = r.total_twd + (r.shipping_fee_twd ?? 0);
                    const back = r.linepay_refunded_twd ?? 0;
                    return (
                      <div key={r.id} className="lp-row">
                        <div>
                          <Link href={`/admin/${tenant.slug}/orders/${r.id}`} className="lp-no">{r.order_no}</Link>
                        </div>
                        <div className="c-paid muted">{twDate(r.paid_at ?? r.created_at)}</div>
                        <div className="r">{amount.toLocaleString()}</div>
                        <div className="r" style={{ color: back > 0 ? '#b91c1c' : '#d4d4d8' }}>
                          {back > 0 ? `−${back.toLocaleString()}` : '—'}
                        </div>
                        <div className="c-net r" style={{ fontWeight: 700 }}>{(amount - back).toLocaleString()}</div>
                        <div className="c-txn mono" title={r.linepay_transaction_id ?? ''}>{r.linepay_transaction_id}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
