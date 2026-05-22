import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { markOrderPaid, markOrderShipped } from '../../actions';

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  source: string;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  created_at: string;
  users: { display_name: string | null; full_name: string | null } | null;
};

type Filters = {
  status?: string;
  payment?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
  saved?: string; // 來自 markOrderPaid / markOrderShipped redirect 的訂單 id
};

async function getOrders(tenantId: string, f: Filters): Promise<OrderRow[]> {
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, total_twd, source, shipping_recipient, shipping_phone, created_at, users(display_name, full_name)',
    )
    .eq('tenant_id', tenantId);

  if (f.status) query = query.eq('status', f.status);
  if (f.payment) query = query.eq('payment_status', f.payment);
  if (f.source) query = query.eq('source', f.source);
  if (f.from) query = query.gte('created_at', `${f.from}T00:00:00+08:00`);
  if (f.to) query = query.lt('created_at', `${f.to}T00:00:00+08:00`);
  if (f.q) {
    // 搜尋:order_no 或 shipping_recipient 或 shipping_phone(任一 ilike 命中)
    const q = f.q.replace(/[%,]/g, ''); // 防 supabase or syntax 被亂寫
    query = query.or(
      `order_no.ilike.%${q}%,shipping_recipient.ilike.%${q}%,shipping_phone.ilike.%${q}%`,
    );
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as OrderRow[];
}

function statusLabel(s: string): string {
  return ({ open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款' }[s]) ?? s;
}
function statusColor(s: string): string {
  return ({ open: '#666', paid: '#0070f3', shipped: '#06c755', delivered: '#0a7038', cancelled: '#999', refunded: '#d00' }[s]) ?? '#666';
}
function sourceLabel(s: string): string {
  return ({ web: '網站', liff: 'LIFF', manual: '手動', line_chat: 'LINE 對話' }[s]) ?? s;
}
function sourceColor(s: string): string {
  return ({ web: '#7c3aed', liff: '#06c755', manual: '#9ca3af', line_chat: '#f59e0b' }[s]) ?? '#666';
}
function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle' };

const filterInput: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  background: '#fff',
  color: '#18181b',
  fontFamily: 'inherit',
  outline: 'none',
};

export default async function OrdersListPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Filters>;
}) {
  const { tenant: slug } = await params;
  const filters = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const orders = await getOrders(tenant.id, filters);

  const hasAnyFilter = !!(
    filters.status ||
    filters.payment ||
    filters.source ||
    filters.q ||
    filters.from ||
    filters.to
  );
  const savedId = filters.saved;

  return (
    <main style={{ padding: 24, maxWidth: 1080, margin: '0 auto' }}>
      {savedId && (
        <div
          style={{
            padding: '8px 14px',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 14,
          }}
        >
          ✓ 已更新訂單狀態
        </div>
      )}
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>
        {tenant.name} · 訂單管理{' '}
        <span style={{ color: '#71717a', fontSize: 14, fontWeight: 400 }}>
          ({orders.length}
          {orders.length >= 200 ? '+,只顯示最近 200 筆' : ''})
        </span>
      </h1>

      {/* Filter bar — 預設折疊,有 filter 才自動展開 */}
      <details
        open={hasAnyFilter}
        style={{
          marginBottom: 20,
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <summary
          style={{
            padding: '10px 14px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: '#52525b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            listStyle: 'none',
          }}
        >
          <span style={{ fontSize: 11, color: '#71717a' }}>▶</span>
          🔍 篩選 / 搜尋
          {hasAnyFilter && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#0070f3', fontWeight: 500 }}>
              · 條件啟用中
            </span>
          )}
        </summary>
        <form
          method="GET"
          action={`/admin/${tenant.slug}/orders`}
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '12px 14px 14px',
            background: '#fafafa',
            borderTop: '1px solid #e4e4e7',
          }}
        >
        <input
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="搜尋訂單號 / 姓名 / 電話"
          style={{ ...filterInput, flex: '1 1 200px', minWidth: 160 }}
        />
        <select name="status" defaultValue={filters.status ?? ''} style={filterInput}>
          <option value="">所有狀態</option>
          <option value="open">待付款</option>
          <option value="paid">已付款</option>
          <option value="shipped">已出貨</option>
          <option value="delivered">已送達</option>
          <option value="cancelled">已取消</option>
          <option value="refunded">已退款</option>
        </select>
        <select name="payment" defaultValue={filters.payment ?? ''} style={filterInput}>
          <option value="">所有付款</option>
          <option value="pending">未付</option>
          <option value="paid">已付</option>
          <option value="failed">失敗</option>
          <option value="refunded">已退</option>
        </select>
        <select name="source" defaultValue={filters.source ?? ''} style={filterInput}>
          <option value="">所有來源</option>
          <option value="web">網站</option>
          <option value="liff">LIFF</option>
          <option value="manual">手動</option>
          <option value="line_chat">LINE 對話</option>
        </select>
        <input
          name="from"
          type="date"
          defaultValue={filters.from ?? ''}
          style={filterInput}
          aria-label="起始日期"
        />
        <span style={{ color: '#a1a1aa', fontSize: 13 }}>~</span>
        <input
          name="to"
          type="date"
          defaultValue={filters.to ?? ''}
          style={filterInput}
          aria-label="結束日期"
        />
        <button
          type="submit"
          style={{
            padding: '6px 14px',
            background: '#18181b',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          查詢
        </button>
        {hasAnyFilter && (
          <Link
            href={`/admin/${tenant.slug}/orders`}
            style={{
              padding: '6px 12px',
              color: '#52525b',
              textDecoration: 'none',
              fontSize: 13,
              border: '1px solid #e4e4e7',
              borderRadius: 6,
              background: '#fff',
            }}
          >
            清除
          </Link>
        )}
        </form>
      </details>

      {orders.length === 0 && (
        <p style={{ color: '#71717a', padding: 32, textAlign: 'center', fontSize: 14 }}>
          {hasAnyFilter ? '(條件下無符合訂單)' : '(尚無訂單)'}
        </p>
      )}

      {orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
              <th style={th}>訂單編號</th>
              <th style={th}>來源</th>
              <th style={th}>客戶</th>
              <th style={{ ...th, textAlign: 'right' }}>金額</th>
              <th style={th}>狀態</th>
              <th style={th}>付款</th>
              <th style={th}>建立時間</th>
              <th style={th}>動作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  <Link href={`/admin/${tenant.slug}/orders/${o.id}`} style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 500 }}>
                    {o.order_no}
                  </Link>
                </td>
                <td style={td}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', background: sourceColor(o.source) + '22', color: sourceColor(o.source), borderRadius: 3, fontSize: 12 }}>
                    {sourceLabel(o.source)}
                  </span>
                </td>
                <td style={td}>
                  {o.users?.display_name ? (
                    <>
                      <div style={{ fontWeight: 500 }}>{o.users.display_name}</div>
                      {o.users.full_name && (
                        <div style={{ fontSize: 12, color: '#888' }}>填:{o.users.full_name}</div>
                      )}
                    </>
                  ) : o.shipping_recipient ? (
                    <>
                      <div style={{ fontWeight: 500 }}>{o.shipping_recipient}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>訪客</div>
                    </>
                  ) : (
                    <div style={{ color: '#888' }}>(無客戶資料)</div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>NT$ {o.total_twd.toLocaleString()}</td>
                <td style={td}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', background: statusColor(o.status) + '22', color: statusColor(o.status), borderRadius: 3, fontSize: 12 }}>
                    {statusLabel(o.status)}
                  </span>
                </td>
                <td style={td}>{statusLabel(o.payment_status)}</td>
                <td style={{ ...td, fontSize: 13, color: '#666' }}>{formatTw(o.created_at)}</td>
                <td style={td}>
                  <QuickAction
                    order={o}
                    tenantSlug={tenant.slug}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

/**
 * 訂單列表 inline quick action button:
 * - 未付款 → 「✓ 標已付款」綠 button(直接呼叫 markOrderPaid,跳轉回此頁 ?saved=paid)
 * - 已付款 未出貨 → 「📦 標已出貨」藍 button
 * - 已出貨 / 已送達 / 已取消 / 已退款 → 「詳細」灰 link
 */
function QuickAction({
  order,
  tenantSlug,
}: {
  order: OrderRow;
  tenantSlug: string;
}) {
  const linkBtn = (
    <Link
      href={`/admin/${tenantSlug}/orders/${order.id}`}
      style={{
        padding: '5px 10px',
        background: '#fff',
        color: '#52525b',
        border: '1px solid #e4e4e7',
        borderRadius: 4,
        fontSize: 11,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      詳細
    </Link>
  );

  if (order.status === 'open') {
    return (
      <form action={markOrderPaid} style={{ display: 'flex', gap: 4 }}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="tenant_slug" value={tenantSlug} />
        <input type="hidden" name="return_to" value="list" />
        <button
          type="submit"
          style={{
            padding: '5px 10px',
            background: '#16a34a',
            color: '#fff',
            border: 0,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          ✓ 已收款
        </button>
        {linkBtn}
      </form>
    );
  }

  if (order.status === 'paid') {
    return (
      <form action={markOrderShipped} style={{ display: 'flex', gap: 4 }}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="tenant_slug" value={tenantSlug} />
        <input type="hidden" name="return_to" value="list" />
        <button
          type="submit"
          style={{
            padding: '5px 10px',
            background: '#0070f3',
            color: '#fff',
            border: 0,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          📦 已出貨
        </button>
        {linkBtn}
      </form>
    );
  }

  return linkBtn;
}
