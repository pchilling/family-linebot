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

type Filters = {
  q?: string;
  status?: string;
  has_orders?: string; // 'yes' | 'no'
  sort?: string; // 'spent' | 'orders' | 'added' (default 'added')
};

async function getCustomers(tenantId: string, f: Filters): Promise<UserRow[]> {
  let query = supabaseAdmin
    .from('users')
    .select(
      'id, line_user_id, display_name, full_name, phone, address, birthday, status, added_at',
    )
    .eq('tenant_id', tenantId);

  if (f.status) query = query.eq('status', f.status);
  if (f.q) {
    const q = f.q.replace(/[%,]/g, '');
    query = query.or(
      `display_name.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  query = query.order('added_at', { ascending: false }).limit(300);
  const { data } = await query;
  return (data ?? []) as UserRow[];
}

type StatsRow = { user_id: string; order_count: number; total_spent: number };
async function getCustomerStats(tenantId: string): Promise<Map<string, StatsRow>> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('user_id, total_twd, status')
    .eq('tenant_id', tenantId)
    .not('user_id', 'is', null);
  const map = new Map<string, StatsRow>();
  for (const o of (data ?? []) as Array<{ user_id: string; total_twd: number; status: string }>) {
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

export default async function CustomersPage({
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

  const [allCustomers, statsMap] = await Promise.all([
    getCustomers(tenant.id, filters),
    getCustomerStats(tenant.id),
  ]);

  // 後端再篩 has_orders / 排序(這些用 supabase 查詢成本高,小規模 in-memory 比較簡單)
  let customers = allCustomers;
  if (filters.has_orders === 'yes') {
    customers = customers.filter((c) => (statsMap.get(c.id)?.order_count ?? 0) > 0);
  } else if (filters.has_orders === 'no') {
    customers = customers.filter((c) => !statsMap.has(c.id));
  }

  if (filters.sort === 'spent') {
    customers = [...customers].sort(
      (a, b) => (statsMap.get(b.id)?.total_spent ?? 0) - (statsMap.get(a.id)?.total_spent ?? 0),
    );
  } else if (filters.sort === 'orders') {
    customers = [...customers].sort(
      (a, b) => (statsMap.get(b.id)?.order_count ?? 0) - (statsMap.get(a.id)?.order_count ?? 0),
    );
  }
  // 預設按 added_at 降序(已在 SQL order by 排過)

  const hasAnyFilter = !!(filters.q || filters.status || filters.has_orders || filters.sort);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>
        {tenant.name} · 客戶名單{' '}
        <span style={{ color: '#71717a', fontSize: 14, fontWeight: 400 }}>
          ({customers.length}
          {allCustomers.length >= 300 ? '+,只顯示最近 300 筆' : ''})
        </span>
      </h1>

      {/* Filter — 預設折疊,有條件啟用才自動 open */}
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
          action={`/admin/${tenant.slug}/customers`}
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
          placeholder="搜尋 LINE 名 / 真名 / 電話"
          style={{ ...filterInput, flex: '1 1 200px', minWidth: 160 }}
        />
        <select name="status" defaultValue={filters.status ?? ''} style={filterInput}>
          <option value="">所有狀態</option>
          <option value="active">活躍</option>
          <option value="blocked">封鎖</option>
          <option value="left">已退</option>
        </select>
        <select name="has_orders" defaultValue={filters.has_orders ?? ''} style={filterInput}>
          <option value="">不限訂單</option>
          <option value="yes">有訂單</option>
          <option value="no">沒訂單</option>
        </select>
        <select name="sort" defaultValue={filters.sort ?? ''} style={filterInput}>
          <option value="">最近加入</option>
          <option value="spent">消費最多</option>
          <option value="orders">訂單最多</option>
        </select>
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
            href={`/admin/${tenant.slug}/customers`}
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

      {customers.length === 0 && (
        <p style={{ color: '#71717a', padding: 32, textAlign: 'center', fontSize: 14 }}>
          {hasAnyFilter
            ? '(條件下無符合客戶)'
            : '(尚無客戶 — 用戶加 LINE@ 好友 / 進 LIFF 會員專區後自動建檔)'}
        </p>
      )}

      {customers.length > 0 && (
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
      )}
    </main>
  );
}
