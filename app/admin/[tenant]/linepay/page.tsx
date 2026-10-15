/**
 * LINE Pay 對帳(2026-10-16)
 *
 * 訂單層的對帳是自動的(付款成功就自動標已付款),這頁處理的是另一層:
 * 核對 LINE Pay 實際撥款進銀行的金額對不對。
 * 選一段期間 → 列出該期間的 LINE Pay 收款與退款 → 算出淨額、手續費、預估撥款,
 * 拿這個數字去跟 LINE Pay 商家中心的撥款單對。
 *
 * 手續費率因合約而異,所以做成可自行輸入(預設 3%),不寫死。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

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

const section: React.CSSProperties = {
  marginBottom: 24,
  padding: 18,
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  background: '#fff',
};
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '9px 8px',
  fontWeight: 600,
  fontSize: 12,
  color: '#52525b',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '9px 8px', fontSize: 13, verticalAlign: 'top' };
const mono: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
};
const input: React.CSSProperties = {
  padding: '7px 9px',
  fontSize: 13,
  border: '1px solid #d4d4d8',
  borderRadius: 5,
  fontFamily: 'inherit',
  background: '#fff',
};

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

export default async function LinePayReconcilePage({
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

  const fallback = defaultRange();
  const from = sp.from || fallback.from;
  const to = sp.to || fallback.to;
  const rate = Math.max(0, Math.min(100, Number(sp.rate ?? 3) || 0));

  // 含 to 當天:lt 隔天 00:00(台北)
  const toEnd = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000).toISOString();

  const { data } = await supabaseAdmin
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
    .limit(500);

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
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Link href={`/admin/${tenant.slug}`} style={{ color: '#71717a', fontSize: 13 }}>
        ← 返回 {tenant.name} 總覽
      </Link>
      <h1 style={{ fontSize: 22, margin: '12px 0 6px' }}>LINE Pay 對帳</h1>
      <p style={{ color: '#71717a', fontSize: 13, lineHeight: 1.7, margin: '0 0 20px' }}>
        訂單是否收到款項系統已自動處理,這頁是用來核對 <strong>LINE Pay 實際撥款進銀行的金額</strong>。
        拿下面算出的「預估撥款金額」去對 LINE Pay 商家中心的撥款單即可。
      </p>

      <form style={{ ...section, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#52525b' }}>
          起始日
          <input type="date" name="from" defaultValue={from} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#52525b' }}>
          結束日(含當天)
          <input type="date" name="to" defaultValue={to} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#52525b' }}>
          手續費率(%)
          <input type="number" name="rate" defaultValue={rate} step="0.01" min="0" max="100" style={{ ...input, width: 90 }} />
        </label>
        <button
          type="submit"
          style={{ padding: '8px 18px', background: '#18181b', color: '#fff', border: 0, borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          查詢
        </button>
      </form>

      <section style={section}>
        <h2 style={{ fontSize: 15, margin: '0 0 14px' }}>
          {from} ~ {to} 合計
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {[
            { label: '成功收款筆數', value: `${settled.length} 筆`, note: null },
            { label: '收款總額', value: `NT$ ${gross.toLocaleString()}`, note: '含運費' },
            { label: '退款總額', value: `− NT$ ${refunded.toLocaleString()}`, note: refunded > 0 ? null : '無退款' },
            { label: '淨收款', value: `NT$ ${net.toLocaleString()}`, note: '收款 − 退款' },
            { label: `手續費(${rate}%)`, value: `− NT$ ${fee.toLocaleString()}`, note: '依你輸入的費率估算' },
          ].map((m) => (
            <div key={m.label} style={{ padding: '10px 12px', background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>{m.label}</div>
              <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#18181b' }}>{m.value}</div>
              {m.note && <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 2 }}>{m.note}</div>}
            </div>
          ))}
          <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#15803d', marginBottom: 4 }}>預估撥款金額</div>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: '#15803d' }}>
              NT$ {payout.toLocaleString()}
            </div>
            <div style={{ fontSize: 10.5, color: '#16a34a', marginTop: 2 }}>拿這個數字對撥款單</div>
          </div>
        </div>
        {unpaid.length > 0 && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
            另有 <strong>{unpaid.length}</strong> 筆發動過 LINE Pay 但客人沒付完的訂單,
            不計入對帳。系統每天會自動再確認一次,逾期未付會自動取消並退回庫存。
          </div>
        )}
      </section>

      <section style={section}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>明細({settled.length} 筆)</h2>
        {settled.length === 0 ? (
          <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0 }}>這段期間沒有 LINE Pay 收款。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e4e4e7' }}>
                  <th style={th}>訂單</th>
                  <th style={th}>付款時間</th>
                  <th style={{ ...th, textAlign: 'right' }}>收款</th>
                  <th style={{ ...th, textAlign: 'right' }}>退款</th>
                  <th style={{ ...th, textAlign: 'right' }}>淨額</th>
                  <th style={th}>LINE Pay 交易序號</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((r) => {
                  const amount = r.total_twd + (r.shipping_fee_twd ?? 0);
                  const back = r.linepay_refunded_twd ?? 0;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                      <td style={td}>
                        <Link href={`/admin/${tenant.slug}/orders/${r.id}`} style={{ color: '#18181b', fontWeight: 600, textDecoration: 'none' }}>
                          {r.order_no}
                        </Link>
                      </td>
                      <td style={{ ...td, color: '#71717a', whiteSpace: 'nowrap' }}>{twDate(r.paid_at ?? r.created_at)}</td>
                      <td style={{ ...td, ...mono, textAlign: 'right' }}>{amount.toLocaleString()}</td>
                      <td style={{ ...td, ...mono, textAlign: 'right', color: back > 0 ? '#dc2626' : '#d4d4d8' }}>
                        {back > 0 ? `−${back.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...td, ...mono, textAlign: 'right', fontWeight: 700 }}>
                        {(amount - back).toLocaleString()}
                      </td>
                      <td style={{ ...td, ...mono, fontSize: 11, color: '#a1a1aa' }}>{r.linepay_transaction_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
