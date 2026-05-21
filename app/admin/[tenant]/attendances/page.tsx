import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { markAttendance, unmarkAttendance } from './actions';

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ class_id?: string }>;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function methodLabel(m: string): string {
  return ({ liff: 'LIFF', qr: 'QR', manual: '老師', admin: '後台' }[m]) ?? m;
}

function methodColor(m: string): string {
  return ({ liff: '#0070f3', qr: '#06c755', manual: '#f59e0b', admin: '#6b7280' }[m]) ?? '#6b7280';
}

// ====================
// 列表 view:本週課程(已過 + 即將)+ 每堂簽到數
// ====================
async function ListView({ tenantId, slug, tenantName }: { tenantId: string; slug: string; tenantName: string }) {
  // 本週區間(Asia/Taipei)
  const now = new Date();
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const dayOfWeek = twNow.getUTCDay(); // 0=Sun .. 6=Sat
  const weekStart = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() - dayOfWeek) - twOffsetMs,
  ).toISOString();
  const weekEnd = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() - dayOfWeek + 7) - twOffsetMs,
  ).toISOString();

  const { data: classes } = await supabaseAdmin
    .from('classes')
    .select('id, name, instructor, scheduled_at, capacity, status, regions(name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', weekStart)
    .lt('scheduled_at', weekEnd)
    .order('scheduled_at');

  type ClassRow = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    capacity: number | null;
    status: string;
    regions: { name: string } | null;
  };
  const rows = ((classes as unknown) as ClassRow[] | null) ?? [];

  // 一次拉本週所有課的簽到數
  const classIds = rows.map((c) => c.id);
  const counts = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: atts } = await supabaseAdmin
      .from('attendances')
      .select('class_id')
      .in('class_id', classIds);
    for (const a of ((atts as { class_id: string }[] | null) ?? [])) {
      counts.set(a.class_id, (counts.get(a.class_id) ?? 0) + 1);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenantName} · 出席紀錄(本週)</h1>

      {rows.length === 0 && (
        <p style={{ color: '#666', padding: 32, textAlign: 'center' }}>本週無課程</p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
            <th style={th}>時間</th>
            <th style={th}>課程</th>
            <th style={th}>地點</th>
            <th style={th}>老師</th>
            <th style={{ ...th, textAlign: 'right' }}>已簽 / 容量</th>
            <th style={th}>狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const signed = counts.get(c.id) ?? 0;
            const isPast = new Date(c.scheduled_at) < now;
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontSize: 13, color: isPast ? '#999' : '#222' }}>
                  {formatDateTime(c.scheduled_at)}
                </td>
                <td style={td}>
                  <Link
                    href={`/admin/${slug}/attendances?class_id=${c.id}`}
                    style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {c.name}
                  </Link>
                </td>
                <td style={{ ...td, fontSize: 13 }}>{c.regions?.name ?? '—'}</td>
                <td style={{ ...td, fontSize: 13 }}>{c.instructor ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                  {signed} / {c.capacity ?? '∞'}
                </td>
                <td style={{ ...td, fontSize: 13 }}>
                  {c.status === 'cancelled' ? <span style={{ color: '#d00' }}>已取消</span> : '正常'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

// ====================
// 詳情 view:單堂課的簽到名單 + 手動勾未簽
// ====================
async function DetailView({
  tenantId,
  slug,
  tenantName,
  classId,
}: {
  tenantId: string;
  slug: string;
  tenantName: string;
  classId: string;
}) {
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, instructor, scheduled_at, capacity, status, regions(name)')
    .eq('tenant_id', tenantId)
    .eq('id', classId)
    .maybeSingle();
  type Cls = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    capacity: number | null;
    status: string;
    regions: { name: string } | null;
  };
  const c = cls as Cls | null;
  if (!c) {
    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <Link href={`/admin/${slug}/attendances`} style={{ color: '#666', fontSize: 13 }}>
          ← 返回 {tenantName} 出席紀錄
        </Link>
        <p style={{ marginTop: 20, color: '#d00' }}>找不到此課程</p>
      </main>
    );
  }

  // 已簽 + 全 tenant users(找出未簽的)
  const [{ data: attRaw }, { data: usersRaw }] = await Promise.all([
    supabaseAdmin
      .from('attendances')
      .select('user_id, method, checked_in_at, users(display_name, full_name)')
      .eq('class_id', classId)
      .order('checked_in_at'),
    supabaseAdmin
      .from('users')
      .select('id, display_name, full_name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('display_name'),
  ]);

  type AttRow = {
    user_id: string;
    method: string;
    checked_in_at: string;
    users: { display_name: string | null; full_name: string | null } | null;
  };
  type UserRow = {
    id: string;
    display_name: string | null;
    full_name: string | null;
  };
  const atts = ((attRaw as unknown) as AttRow[] | null) ?? [];
  const allUsers = ((usersRaw as unknown) as UserRow[] | null) ?? [];

  const signedIds = new Set(atts.map((a) => a.user_id));
  const unsigned = allUsers.filter((u) => !signedIds.has(u.id));

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Link href={`/admin/${slug}/attendances`} style={{ color: '#666', fontSize: 13 }}>
        ← 返回 {tenantName} 出席紀錄
      </Link>

      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 4 }}>
        {c.name}
        {c.status === 'cancelled' && (
          <span style={{ marginLeft: 10, fontSize: 13, color: '#d00' }}>(已取消)</span>
        )}
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        {formatDateTime(c.scheduled_at)} · {c.regions?.name ?? '—'} · {c.instructor ?? '—'} · 容量 {c.capacity ?? '∞'}
      </p>

      <section style={section}>
        <h2 style={h2}>
          已簽到 ({atts.length}{c.capacity ? ` / ${c.capacity}` : ''})
        </h2>
        {atts.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>(尚無學員簽到)</p>}
        {atts.length > 0 && (
          <ul style={listStyle}>
            {atts.map((a) => (
              <li key={a.user_id} style={liStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {a.users?.full_name ?? a.users?.display_name ?? '(無名)'}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {formatTime(a.checked_in_at)}
                    <span
                      style={{
                        marginLeft: 8,
                        padding: '1px 6px',
                        background: methodColor(a.method) + '22',
                        color: methodColor(a.method),
                        borderRadius: 3,
                        fontSize: 11,
                      }}
                    >
                      {methodLabel(a.method)}
                    </span>
                  </div>
                </div>
                <form action={unmarkAttendance}>
                  <input type="hidden" name="tenant_slug" value={slug} />
                  <input type="hidden" name="class_id" value={classId} />
                  <input type="hidden" name="user_id" value={a.user_id} />
                  <button type="submit" style={btnGhost} title="取消這個簽到">
                    取消
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>未簽到 ({unsigned.length})</h2>
        {unsigned.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>(全部簽完了)</p>}
        {unsigned.length > 0 && (
          <ul style={listStyle}>
            {unsigned.map((u) => (
              <li key={u.id} style={liStyle}>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {u.full_name ?? u.display_name ?? '(無名)'}
                  {!u.full_name && u.display_name && (
                    <span style={{ fontSize: 12, color: '#999', marginLeft: 6 }}>LINE 名</span>
                  )}
                </div>
                <form action={markAttendance}>
                  <input type="hidden" name="tenant_slug" value={slug} />
                  <input type="hidden" name="class_id" value={classId} />
                  <input type="hidden" name="user_id" value={u.id} />
                  <button type="submit" style={btnPrimary}>
                    手動簽到
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ fontSize: 12, color: '#999', marginTop: 24 }}>
        提示:學員只會在加 LINE@ 好友後出現在「未簽到」名單(從 users 表撈,排除 blocked/left)。
      </p>
    </main>
  );
}

// ====================
// Entry
// ====================
export default async function AttendancesPage({ params, searchParams }: Props) {
  const { tenant: slug } = await params;
  const { class_id } = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  if (class_id) {
    return (
      <DetailView
        tenantId={tenant.id}
        slug={tenant.slug}
        tenantName={tenant.name}
        classId={class_id}
      />
    );
  }
  return <ListView tenantId={tenant.id} slug={tenant.slug} tenantName={tenant.name} />;
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle', fontSize: 14 };
const section: React.CSSProperties = { marginBottom: 28, padding: 16, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' };
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const liStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
};
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px',
  background: '#06c755',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: '#888',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
};
