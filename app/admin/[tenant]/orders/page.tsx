import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  source: string;
  shipping_recipient: string | null;
  created_at: string;
  users: { display_name: string | null; full_name: string | null } | null;
};

async function getOrders(tenantId: string): Promise<OrderRow[]> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, total_twd, source, shipping_recipient, created_at, users(display_name, full_name)',
    )
    .eq('tenant_id', tenantId)
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

export default async function OrdersListPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const orders = await getOrders(tenant.id);

  return (
    <main style={{ padding: 24, maxWidth: 1080, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 訂單管理 ({orders.length})</h1>

      {orders.length === 0 && <p style={{ color: '#666', padding: 32, textAlign: 'center' }}>(尚無訂單)</p>}

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
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
