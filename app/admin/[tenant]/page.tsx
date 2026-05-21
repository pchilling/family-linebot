import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type Props = {
  params: Promise<{ tenant: string }>;
};

function asiaTaipeiDayRange() {
  const now = new Date();
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const start = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate()) - twOffsetMs,
  );
  const end = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() + 1) - twOffsetMs,
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

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

export default async function TenantDashboardPage({ params }: Props) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const { start: dayStart, end: dayEnd } = asiaTaipeiDayRange();
  const nowIso = new Date().toISOString();
  const week7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 平行撈所有數字
  const [
    ordersTodayResp,
    revenueTodayResp,
    attendancesTodayResp,
    classesTodayResp,
    pendingPaymentResp,
    pendingShipResp,
    lowStockResp,
    upcomingResvResp,
  ] = await Promise.all([
    // 今日訂單數
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),
    // 今日營收(已付款訂單)
    supabaseAdmin
      .from('orders')
      .select('total_twd')
      .eq('tenant_id', tenant.id)
      .eq('payment_status', 'paid')
      .gte('paid_at', dayStart)
      .lt('paid_at', dayEnd),
    // 今日簽到
    supabaseAdmin
      .from('attendances')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('checked_in_at', dayStart)
      .lt('checked_in_at', dayEnd),
    // 今日課程
    supabaseAdmin
      .from('classes')
      .select('id, name, scheduled_at, capacity, status')
      .eq('tenant_id', tenant.id)
      .gte('scheduled_at', dayStart)
      .lt('scheduled_at', dayEnd)
      .neq('status', 'cancelled')
      .order('scheduled_at'),
    // 待付款訂單
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'open')
      .eq('payment_status', 'pending'),
    // 等出貨訂單(已付款未出貨)
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'paid'),
    // 低庫存 variant(Pro+ 才顯示;Free 跳過 query 結果不顯示)
    tenant.plan === 'free'
      ? Promise.resolve({ data: null, count: null })
      : supabaseAdmin
          .from('product_variants')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'active')
          .lte('stock', 3),
    // 接下來 7 天有 active reservation 的課程
    supabaseAdmin
      .from('classes')
      .select('id, name, scheduled_at, capacity, reservations!inner(status, position)')
      .eq('tenant_id', tenant.id)
      .gte('scheduled_at', nowIso)
      .lt('scheduled_at', week7)
      .neq('status', 'cancelled')
      .in('reservations.status', ['confirmed', 'waitlist'])
      .order('scheduled_at')
      .limit(20),
  ]);

  const ordersToday = ordersTodayResp.count ?? 0;
  const revenueToday = (
    (revenueTodayResp.data as { total_twd: number }[] | null) ?? []
  ).reduce((s, o) => s + (o.total_twd ?? 0), 0);
  const attendancesToday = attendancesTodayResp.count ?? 0;
  const classesToday = ((classesTodayResp.data as unknown) as { id: string; name: string; scheduled_at: string; capacity: number | null; status: string }[] | null) ?? [];
  const pendingPayment = pendingPaymentResp.count ?? 0;
  const pendingShip = pendingShipResp.count ?? 0;
  const lowStockCount = lowStockResp.count ?? null;

  // 接下來 7 天的報名,需要 group by class 算 confirmed / waitlist
  type ResvCls = {
    id: string;
    name: string;
    scheduled_at: string;
    capacity: number | null;
    reservations: { status: string; position: number | null }[];
  };
  const resvClassRows = ((upcomingResvResp.data as unknown) as ResvCls[] | null) ?? [];
  // dedupe by class id(supabase inner join 會展開)
  const classMap = new Map<string, { name: string; scheduled_at: string; capacity: number | null; confirmed: number; waitlist: number }>();
  for (const c of resvClassRows) {
    const ex = classMap.get(c.id);
    if (!ex) {
      classMap.set(c.id, {
        name: c.name,
        scheduled_at: c.scheduled_at,
        capacity: c.capacity,
        confirmed: 0,
        waitlist: 0,
      });
    }
    const entry = classMap.get(c.id)!;
    for (const r of c.reservations ?? []) {
      if (r.status === 'confirmed') entry.confirmed++;
      else if (r.status === 'waitlist') entry.waitlist++;
    }
  }
  const upcomingResvs = Array.from(classMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <main style={{ padding: 24, maxWidth: 1080, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>{tenant.name} · 總覽</h1>

      {/* Row 1: 三組 metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricCard
          title="今日"
          items={[
            { label: '訂單', value: ordersToday, link: `/admin/${slug}/orders` },
            { label: '營收', value: `NT$ ${revenueToday.toLocaleString()}` },
            { label: '簽到', value: attendancesToday, link: `/admin/${slug}/attendances` },
            { label: '課程', value: classesToday.length, link: `/admin/${slug}/classes` },
          ]}
        />

        <MetricCard
          title="待處理"
          accent={pendingPayment > 0 || pendingShip > 0 ? '#d97706' : '#10b981'}
          items={[
            { label: '待付款', value: pendingPayment, link: `/admin/${slug}/orders`, warn: pendingPayment > 0 },
            { label: '待出貨', value: pendingShip, link: `/admin/${slug}/orders`, warn: pendingShip > 0 },
          ]}
        />

        {tenant.plan === 'free' ? (
          <MetricCard
            title="庫存"
            items={[{ label: '功能', value: '🔒 Pro+', muted: true }]}
          />
        ) : (
          <MetricCard
            title="庫存"
            accent={(lowStockCount ?? 0) > 0 ? '#d97706' : '#10b981'}
            items={[
              {
                label: '低庫存 variant (≤3)',
                value: lowStockCount ?? 0,
                link: `/admin/${slug}/inventory`,
                warn: (lowStockCount ?? 0) > 0,
              },
            ]}
          />
        )}
      </div>

      {/* Row 2: 今日課程 list */}
      <section style={section}>
        <h2 style={h2}>今日課程 ({classesToday.length})</h2>
        {classesToday.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>(今日無課程)</p>}
        {classesToday.length > 0 && (
          <ul style={listStyle}>
            {classesToday.map((c) => (
              <li key={c.id} style={liStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {formatDateTime(c.scheduled_at)}
                    {c.capacity && <> · 容量 {c.capacity}</>}
                  </div>
                </div>
                <Link
                  href={`/admin/${slug}/attendances?class_id=${c.id}`}
                  style={{ ...btnSmall, textDecoration: 'none' }}
                >
                  看簽到
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Row 3: 接下來 7 天有報名的課 */}
      <section style={section}>
        <h2 style={h2}>未來 7 天有報名的活動 ({upcomingResvs.length})</h2>
        {upcomingResvs.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>(無未來活動報名)</p>}
        {upcomingResvs.length > 0 && (
          <ul style={listStyle}>
            {upcomingResvs.map((r) => (
              <li key={r.id} style={liStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {formatDateTime(r.scheduled_at)}
                    {' · 已報 '}
                    <strong>{r.confirmed}</strong>
                    {r.capacity && ` / ${r.capacity}`}
                    {r.waitlist > 0 && (
                      <span style={{ color: '#9a7400' }}> · 候補 {r.waitlist}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/admin/${slug}/attendances?class_id=${r.id}`}
                  style={{ ...btnSmall, textDecoration: 'none' }}
                >
                  管理
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Row 4: 快速連結 */}
      <section style={section}>
        <h2 style={h2}>快速操作</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <QuickLink href={`/admin/${slug}/products`} label="+ 新增商品" />
          <QuickLink href={`/admin/${slug}/classes`} label="+ 新增課程" />
          <QuickLink href={`/admin/${slug}/orders`} label="📦 看所有訂單" />
          <QuickLink href={`/admin/${slug}/customers`} label="👥 客戶名單" />
          <QuickLink href={`/admin/${slug}/settings`} label="⚙️ 攤位設定" />
          <QuickLink href={`/${slug}`} label="🌐 預覽公開頁" external />
        </div>
      </section>
    </main>
  );
}

type MetricItem = {
  label: string;
  value: number | string;
  link?: string;
  warn?: boolean;
  muted?: boolean;
};

function MetricCard({
  title,
  items,
  accent,
}: {
  title: string;
  items: MetricItem[];
  accent?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        borderTop: accent ? `3px solid ${accent}` : '1px solid #e5e7eb',
      }}
    >
      <div style={{ fontSize: 13, color: '#888', marginBottom: 12, fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((it, i) => {
          const content = (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: 14,
              }}
            >
              <span style={{ color: it.muted ? '#bbb' : '#444' }}>{it.label}</span>
              <strong
                style={{
                  fontSize: typeof it.value === 'string' ? 15 : 22,
                  color: it.muted ? '#bbb' : it.warn ? '#d97706' : '#111',
                  fontWeight: 700,
                }}
              >
                {it.value}
              </strong>
            </div>
          );
          if (it.link) {
            return (
              <Link key={i} href={it.link} style={{ textDecoration: 'none' }}>
                {content}
              </Link>
            );
          }
          return content;
        })}
      </div>
    </div>
  );
}

function QuickLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const style: React.CSSProperties = {
    padding: '8px 14px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {label} ↗
      </a>
    );
  }
  return (
    <Link href={href} style={style}>
      {label}
    </Link>
  );
}

const section: React.CSSProperties = {
  marginBottom: 28,
  padding: 16,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fff',
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12 };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const liStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: '#fafafa',
  border: '1px solid #ececec',
  borderRadius: 4,
};
const btnSmall: React.CSSProperties = {
  padding: '6px 12px',
  background: '#0070f3',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 500,
};
