import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type Props = {
  params: Promise<{ tenant: string; id: string }>;
};

function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

function statusLabel(s: string): string {
  return ({ active: '活躍', blocked: '封鎖', left: '已退' }[s]) ?? s;
}

function orderStatusLabel(s: string): string {
  return ({ open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款' }[s]) ?? s;
}

function methodLabel(m: string): string {
  return ({ liff: 'LIFF', qr: 'QR', manual: '老師', admin: '後台' }[m]) ?? m;
}

function resvStatusLabel(s: string): string {
  return ({ confirmed: '已報名', waitlist: '候補', cancelled: '已取消', no_show: '沒到' }[s]) ?? s;
}

function resvStatusColor(s: string): string {
  return ({
    confirmed: '#0a7038',
    waitlist: '#9a7400',
    cancelled: '#888',
    no_show: '#d00',
  }[s]) ?? '#444';
}

export default async function CustomerDetailPage({ params }: Props) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // 平行撈:user / orders / attendances / reservations
  const [
    { data: userRaw },
    { data: ordersRaw },
    { data: attsRaw },
    { data: resvsRaw },
  ] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select(
        'id, line_user_id, display_name, full_name, phone, address, birthday, member_id, referrer_member_id, status, added_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('orders')
      .select('id, order_no, status, payment_status, total_twd, source, created_at')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('attendances')
      .select('id, method, checked_in_at, classes(name, scheduled_at)')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('checked_in_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('reservations')
      .select('id, status, position, created_at, classes(name, scheduled_at)')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  type UserRow = {
    id: string;
    line_user_id: string;
    display_name: string | null;
    full_name: string | null;
    phone: string | null;
    address: string | null;
    birthday: string | null;
    member_id: string | null;
    referrer_member_id: string | null;
    status: string;
    added_at: string;
  };
  const user = (userRaw ?? null) as UserRow | null;
  if (!user) {
    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <Link href={`/admin/${slug}/customers`} style={{ color: '#666', fontSize: 13 }}>
          ← 返回客戶名單
        </Link>
        <p style={{ marginTop: 20, color: '#d00' }}>找不到此客戶</p>
      </main>
    );
  }

  type OrderRow = {
    id: string;
    order_no: string;
    status: string;
    payment_status: string;
    total_twd: number;
    source: string;
    created_at: string;
  };
  type AttRow = {
    id: string;
    method: string;
    checked_in_at: string;
    classes: { name: string; scheduled_at: string } | null;
  };
  type ResvRow = {
    id: string;
    status: string;
    position: number | null;
    created_at: string;
    classes: { name: string; scheduled_at: string } | null;
  };
  const orders = ((ordersRaw as unknown) as OrderRow[] | null) ?? [];
  const atts = ((attsRaw as unknown) as AttRow[] | null) ?? [];
  const resvs = ((resvsRaw as unknown) as ResvRow[] | null) ?? [];

  // 找「我介紹進來的人」(referrer_member_id = 我的 member_id)
  type RefereeRow = { id: string; display_name: string | null; full_name: string | null; member_id: string | null };
  let referrals: RefereeRow[] = [];
  if (user.member_id) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, display_name, full_name, member_id')
      .eq('tenant_id', tenant.id)
      .eq('referrer_member_id', user.member_id);
    referrals = (data as RefereeRow[] | null) ?? [];
  }

  // 找「我的介紹人」(如果填的 referrer_member_id 在系統內有對應的 user)
  let referrer: RefereeRow | null = null;
  if (user.referrer_member_id) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, display_name, full_name, member_id')
      .eq('tenant_id', tenant.id)
      .eq('member_id', user.referrer_member_id)
      .maybeSingle();
    referrer = (data as RefereeRow | null) ?? null;
  }

  // 統計(排除 cancelled/refunded 訂單)
  const activeOrders = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
  const totalSpent = activeOrders.reduce((s, o) => s + o.total_twd, 0);
  const activeAttCount = atts.length;
  const activeResvCount = resvs.filter((r) => r.status === 'confirmed' || r.status === 'waitlist').length;

  const displayName = user.full_name ?? user.display_name ?? '(無名)';

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Link href={`/admin/${slug}/customers`} style={{ color: '#666', fontSize: 13 }}>
        ← 返回客戶名單
      </Link>

      <h1 style={{ fontSize: 24, marginTop: 12, marginBottom: 8 }}>{displayName}</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        加入 {formatDate(user.added_at)} · 狀態 {statusLabel(user.status)}
      </p>

      {/* 統計 cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="累積消費" value={`NT$ ${totalSpent.toLocaleString()}`} />
        <StatCard label="訂單數" value={`${activeOrders.length}`} />
        <StatCard label="簽到次數" value={`${activeAttCount}`} />
        <StatCard label="未來報名" value={`${activeResvCount}`} />
      </div>

      {/* 個資 */}
      <section style={section}>
        <h2 style={h2}>個人資料</h2>
        <dl style={meta}>
          <dt style={metaKey}>LINE 顯示名</dt>
          <dd style={{ margin: 0 }}>
            <code style={lineCode}>{user.display_name ?? '—'}</code>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>← LINE@ Manager 搜尋對話</span>
          </dd>
          <dt style={metaKey}>真名(填)</dt>
          <dd style={{ margin: 0 }}>{user.full_name ?? '—'}</dd>
          <dt style={metaKey}>電話</dt>
          <dd style={{ margin: 0 }}>{user.phone ?? '—'}</dd>
          <dt style={metaKey}>地址</dt>
          <dd style={{ margin: 0 }}>{user.address ?? '—'}</dd>
          <dt style={metaKey}>生日</dt>
          <dd style={{ margin: 0 }}>{user.birthday ?? '—'}</dd>
          <dt style={metaKey}>ID</dt>
          <dd style={{ margin: 0 }}>
            {user.member_id ? (
              <code style={{ padding: '2px 8px', background: '#f3f4f6', borderRadius: 3, fontFamily: 'monospace', fontSize: 13, userSelect: 'all' }}>
                {user.member_id}
              </code>
            ) : (
              <span style={{ color: '#9ca3af' }}>—(學員未填)</span>
            )}
          </dd>
          <dt style={metaKey}>介紹人 ID</dt>
          <dd style={{ margin: 0 }}>
            {user.referrer_member_id ? (
              <span>
                <code style={{ padding: '2px 8px', background: '#f3f4f6', borderRadius: 3, fontFamily: 'monospace', fontSize: 13 }}>
                  {user.referrer_member_id}
                </code>
                {referrer && (
                  <Link
                    href={`/admin/${slug}/customers/${referrer.id}`}
                    style={{ marginLeft: 8, color: '#0070f3', textDecoration: 'none', fontSize: 13 }}
                  >
                    → {referrer.full_name ?? referrer.display_name ?? '(無名)'}
                  </Link>
                )}
                {!referrer && (
                  <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>
                    (此 ID 尚未在系統內、可能還沒辦會員)
                  </span>
                )}
              </span>
            ) : (
              <span style={{ color: '#9ca3af' }}>—</span>
            )}
          </dd>
          <dt style={metaKey}>LINE userId</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
            {user.line_user_id}
          </dd>
        </dl>
      </section>

      {referrals.length > 0 && (
        <section style={section}>
          <h2 style={h2}>我介紹進來的人 ({referrals.length})</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {referrals.map((r) => (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: '#fafafa',
                  border: '1px solid #e4e4e7',
                  borderRadius: 4,
                  fontSize: 14,
                }}
              >
                <Link
                  href={`/admin/${slug}/customers/${r.id}`}
                  style={{ flex: 1, color: '#0070f3', textDecoration: 'none', fontWeight: 500 }}
                >
                  {r.full_name ?? r.display_name ?? '(無名)'}
                </Link>
                {r.member_id && (
                  <code style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace' }}>
                    {r.member_id}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 訂單歷史 */}
      <section style={section}>
        <h2 style={h2}>訂單歷史 ({orders.length})</h2>
        {orders.length === 0 && <p style={mutedText}>(無訂單)</p>}
        {orders.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr style={trHead}>
                <th style={th}>訂單編號</th>
                <th style={th}>來源</th>
                <th style={th}>狀態</th>
                <th style={{ ...th, textAlign: 'right' }}>金額</th>
                <th style={th}>時間</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={trBody}>
                  <td style={td}>
                    <Link
                      href={`/admin/${slug}/orders/${o.id}`}
                      style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {o.order_no}
                    </Link>
                  </td>
                  <td style={{ ...td, fontSize: 13 }}>{o.source}</td>
                  <td style={{ ...td, fontSize: 13 }}>{orderStatusLabel(o.status)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>
                    NT$ {o.total_twd.toLocaleString()}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#666' }}>{formatTw(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 簽到歷史 */}
      <section style={section}>
        <h2 style={h2}>簽到歷史 ({atts.length})</h2>
        {atts.length === 0 && <p style={mutedText}>(無簽到紀錄)</p>}
        {atts.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr style={trHead}>
                <th style={th}>課程</th>
                <th style={th}>簽到時間</th>
                <th style={th}>方式</th>
              </tr>
            </thead>
            <tbody>
              {atts.map((a) => (
                <tr key={a.id} style={trBody}>
                  <td style={td}>{a.classes?.name ?? '(已刪課程)'}</td>
                  <td style={{ ...td, fontSize: 12, color: '#666' }}>{formatTw(a.checked_in_at)}</td>
                  <td style={{ ...td, fontSize: 13 }}>{methodLabel(a.method)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 報名歷史 */}
      <section style={section}>
        <h2 style={h2}>報名歷史 ({resvs.length})</h2>
        {resvs.length === 0 && <p style={mutedText}>(無報名紀錄)</p>}
        {resvs.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr style={trHead}>
                <th style={th}>活動</th>
                <th style={th}>狀態</th>
                <th style={th}>活動時間</th>
                <th style={th}>報名時間</th>
              </tr>
            </thead>
            <tbody>
              {resvs.map((r) => (
                <tr key={r.id} style={trBody}>
                  <td style={td}>{r.classes?.name ?? '(已刪活動)'}</td>
                  <td style={{ ...td, fontSize: 13 }}>
                    <span style={{ color: resvStatusColor(r.status), fontWeight: 500 }}>
                      {resvStatusLabel(r.status)}
                      {r.status === 'waitlist' && r.position !== null && ` #${r.position}`}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#666' }}>
                    {r.classes?.scheduled_at ? formatTw(r.classes.scheduled_at) : '—'}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#666' }}>{formatTw(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{value}</div>
    </div>
  );
}

const section: React.CSSProperties = {
  marginBottom: 24,
  padding: 18,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fff',
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 14 };
const meta: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7rem 1fr',
  gap: '8px 16px',
  fontSize: 14,
  margin: 0,
};
const metaKey: React.CSSProperties = { color: '#888' };
const lineCode: React.CSSProperties = {
  padding: '2px 8px',
  background: '#fff7d6',
  borderRadius: 3,
  fontSize: 14,
  userSelect: 'all',
};
const mutedText: React.CSSProperties = { color: '#999', fontSize: 13 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const trHead: React.CSSProperties = { borderBottom: '1px solid #ddd', background: '#fafafa' };
const trBody: React.CSSProperties = { borderBottom: '1px solid #f0f0f0' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '10px 8px', verticalAlign: 'middle', fontSize: 14 };
