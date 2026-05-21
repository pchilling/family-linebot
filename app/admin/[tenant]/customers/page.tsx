import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type UserRow = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  birthday: string | null;
  status: string;
  added_at: string;
};

async function getCustomers(tenantId: string): Promise<UserRow[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select(
      'id, line_user_id, display_name, full_name, phone, address, birthday, status, added_at',
    )
    .eq('tenant_id', tenantId)
    .order('added_at', { ascending: false });
  return (data ?? []) as UserRow[];
}

// 客戶下單 stats(per user 訂單數 + 總金額)
type StatsRow = { user_id: string; order_count: number; total_spent: number };
async function getCustomerStats(tenantId: string): Promise<Map<string, StatsRow>> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('user_id, total_twd, status')
    .eq('tenant_id', tenantId)
    .not('user_id', 'is', null);
  const map = new Map<string, StatsRow>();
  for (const o of (data ?? []) as Array<{ user_id: string; total_twd: number; status: string }>) {
    // cancelled / refunded 不計
    if (o.status === 'cancelled' || o.status === 'refunded') continue;
    const existing = map.get(o.user_id);
    if (existing) {
      existing.order_count += 1;
      existing.total_spent += o.total_twd;
    } else {
      map.set(o.user_id, { user_id: o.user_id, order_count: 1, total_spent: o.total_twd });
    }
  }
  return map;
}

function statusLabel(s: string): string {
  return ({ active: '活躍', blocked: '封鎖', left: '已退' }[s]) ?? s;
}

function formatTw(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle', fontSize: 14 };

export default async function CustomersPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const [customers, statsMap] = await Promise.all([getCustomers(tenant.id), getCustomerStats(tenant.id)]);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 客戶名單 ({customers.length})</h1>

      {customers.length === 0 && (
        <p style={{ color: '#666', padding: 32, textAlign: 'center' }}>
          (尚無客戶 — 用戶加 LINE@ 好友 / 進 LIFF 會員專區後自動建檔)
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
            <th style={th}>LINE 顯示名</th>
            <th style={th}>真名</th>
            <th style={th}>電話</th>
            <th style={th}>地址</th>
            <th style={th}>生日</th>
            <th style={{ ...th, textAlign: 'right' }}>訂單數</th>
            <th style={{ ...th, textAlign: 'right' }}>累積消費</th>
            <th style={th}>狀態</th>
            <th style={th}>加入</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const stats = statsMap.get(c.id);
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontWeight: 500 }}>
                  <Link
                    href={`/admin/${tenant.slug}/customers/${c.id}`}
                    style={{ color: '#0070f3', textDecoration: 'none' }}
                  >
                    {c.display_name ?? '(無)'}
                  </Link>
                </td>
                <td style={td}>{c.full_name ?? '—'}</td>
                <td style={td}>{c.phone ?? '—'}</td>
                <td style={{ ...td, fontSize: 13, color: '#666', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address ?? '—'}</td>
                <td style={td}>{c.birthday ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{stats?.order_count ?? 0}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: stats?.total_spent ? 600 : 400 }}>
                  {stats?.total_spent ? `NT$ ${stats.total_spent.toLocaleString()}` : '—'}
                </td>
                <td style={td}>{statusLabel(c.status)}</td>
                <td style={{ ...td, fontSize: 13, color: '#666' }}>{formatTw(c.added_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
