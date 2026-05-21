import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import {
  card,
  colors,
  contentMaxWidth,
  fontFamilyMono,
  fontSize,
  fontWeight,
  h1Style,
  h2Style,
  monoNum,
  radius,
  sectionLabel,
  space,
} from '@/lib/admin-theme';

type Props = {
  params: Promise<{ tenant: string }>;
};

// Admin dashboard 每次都重抓最新數據,不用任何 cache
export const dynamic = 'force-dynamic';

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

function formatToday(): string {
  return new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export default async function TenantDashboardPage({ params }: Props) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const hasActivities = hasFeature(tenant, 'activities');

  const { start: dayStart, end: dayEnd } = asiaTaipeiDayRange();
  const nowIso = new Date().toISOString();
  const week7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),
    supabaseAdmin
      .from('orders')
      .select('total_twd')
      .eq('tenant_id', tenant.id)
      .eq('payment_status', 'paid')
      .gte('paid_at', dayStart)
      .lt('paid_at', dayEnd),
    hasActivities
      ? supabaseAdmin
          .from('attendances')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('checked_in_at', dayStart)
          .lt('checked_in_at', dayEnd)
      : Promise.resolve({ count: null }),
    hasActivities
      ? supabaseAdmin
          .from('classes')
          .select('id, name, scheduled_at, capacity, status')
          .eq('tenant_id', tenant.id)
          .gte('scheduled_at', dayStart)
          .lt('scheduled_at', dayEnd)
          .neq('status', 'cancelled')
          .order('scheduled_at')
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'open')
      .eq('payment_status', 'pending'),
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'paid'),
    tenant.plan === 'free'
      ? Promise.resolve({ data: null, count: null })
      : supabaseAdmin
          .from('product_variants')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'active')
          .lte('stock', 3),
    hasActivities
      ? supabaseAdmin
          .from('classes')
          .select('id, name, scheduled_at, capacity, reservations!inner(status, position)')
          .eq('tenant_id', tenant.id)
          .gte('scheduled_at', nowIso)
          .lt('scheduled_at', week7)
          .neq('status', 'cancelled')
          .in('reservations.status', ['confirmed', 'waitlist'])
          .order('scheduled_at')
          .limit(20)
      : Promise.resolve({ data: null }),
  ]);

  const ordersToday = ordersTodayResp.count ?? 0;
  const revenueToday = (
    (revenueTodayResp.data as { total_twd: number }[] | null) ?? []
  ).reduce((s, o) => s + (o.total_twd ?? 0), 0);
  const attendancesToday = attendancesTodayResp.count ?? 0;
  type TodayClass = { id: string; name: string; scheduled_at: string; capacity: number | null; status: string };
  const classesToday = ((classesTodayResp.data as unknown) as TodayClass[] | null) ?? [];
  const pendingPayment = pendingPaymentResp.count ?? 0;
  const pendingShip = pendingShipResp.count ?? 0;
  const lowStockCount = lowStockResp.count ?? null;

  type ResvCls = {
    id: string;
    name: string;
    scheduled_at: string;
    capacity: number | null;
    reservations: { status: string; position: number | null }[];
  };
  const resvClassRows = ((upcomingResvResp.data as unknown) as ResvCls[] | null) ?? [];
  const classMap = new Map<
    string,
    { name: string; scheduled_at: string; capacity: number | null; confirmed: number; waitlist: number }
  >();
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
    <div style={{ maxWidth: contentMaxWidth, margin: '0 auto' }}>
      {/* Hero */}
      <header style={{ marginBottom: space['10'] }}>
        <div style={{ ...sectionLabel, marginBottom: space['2'] }}>{formatToday()}</div>
        <h1 style={h1Style}>{tenant.name}</h1>
      </header>

      {/* Metric row */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: space['4'],
          marginBottom: space['10'],
        }}
      >
        <MetricCard
          label="今日訂單"
          value={ordersToday}
          link={`/admin/${slug}/orders`}
          sub={`營收 NT$ ${revenueToday.toLocaleString()}`}
        />
        {hasActivities ? (
          <MetricCard
            label="今日簽到"
            value={attendancesToday}
            link={`/admin/${slug}/attendances`}
            sub={`活動 ${classesToday.length} 場`}
          />
        ) : (
          <MetricCard label="客戶" value="—" sub="客戶名單" link={`/admin/${slug}/customers`} muted />
        )}
        <MetricCard
          label="待付款"
          value={pendingPayment}
          link={`/admin/${slug}/orders`}
          sub={`待出貨 ${pendingShip}`}
          warn={pendingPayment > 0 || pendingShip > 0}
        />
        {tenant.plan === 'free' ? (
          <MetricCard label="庫存" value="—" sub="Pro 方案才有" muted />
        ) : (
          <MetricCard
            label="低庫存"
            value={lowStockCount ?? 0}
            link={`/admin/${slug}/inventory`}
            sub="變體 ≤ 3"
            warn={(lowStockCount ?? 0) > 0}
          />
        )}
      </section>

      {/* 活動相關 sections — 只給 features.activities 開啟的 tenant 看 */}
      {hasActivities && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: space['6'],
            marginBottom: space['10'],
          }}
        >
          <ListSection
            title="今日活動"
            count={classesToday.length}
            empty="今日無活動"
            items={classesToday.map((c) => ({
              id: c.id,
              primary: c.name,
              secondary: `${formatDateTime(c.scheduled_at)}${c.capacity ? ` · 容量 ${c.capacity}` : ''}`,
              href: `/admin/${slug}/attendances?class_id=${c.id}`,
              cta: '簽到',
            }))}
          />

          <ListSection
            title="未來 7 天有報名"
            count={upcomingResvs.length}
            empty="無報名"
            items={upcomingResvs.map((r) => ({
              id: r.id,
              primary: r.name,
              secondary: `${formatDateTime(r.scheduled_at)}`,
              stat: (
                <>
                  <strong style={monoNum}>{r.confirmed}</strong>
                  {r.capacity && (
                    <span style={{ color: colors.textMuted }}> / {r.capacity}</span>
                  )}
                  {r.waitlist > 0 && (
                    <span style={{ color: colors.warning, marginLeft: 6 }}>
                      +{r.waitlist}
                    </span>
                  )}
                </>
              ),
              href: `/admin/${slug}/attendances?class_id=${r.id}`,
              cta: '管理',
            }))}
          />
        </section>
      )}

      {/* Quick actions */}
      <section>
        <div style={{ ...sectionLabel, marginBottom: space['3'] }}>快速操作</div>
        <div style={{ display: 'flex', gap: space['2'], flexWrap: 'wrap' }}>
          <QuickAction href={`/admin/${slug}/products`} label="新增商品" />
          {hasActivities && (
            <QuickAction href={`/admin/${slug}/classes`} label="新增活動" />
          )}
          <QuickAction href={`/admin/${slug}/orders`} label="所有訂單" />
          <QuickAction href={`/admin/${slug}/customers`} label="客戶名單" />
          <QuickAction href={`/admin/${slug}/settings`} label="攤位設定" />
          <QuickAction href={`/${slug}`} label="預覽公開頁" external />
        </div>
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────
// Components
// ────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  link,
  warn,
  muted,
}: {
  label: string;
  value: number | string;
  sub?: string;
  link?: string;
  warn?: boolean;
  muted?: boolean;
}) {
  const inner = (
    <div
      style={{
        ...card,
        padding: space['5'],
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: space['1'],
        transition: 'border-color 150ms, box-shadow 150ms',
        cursor: link ? 'pointer' : 'default',
      }}
    >
      <div style={{ ...sectionLabel, color: muted ? colors.textDisabled : colors.textMuted }}>
        {label}
      </div>
      <div
        style={{
          ...monoNum,
          fontSize: typeof value === 'string' && value.length > 6 ? fontSize['2xl'] : fontSize['3xl'],
          fontWeight: fontWeight.semibold,
          color: muted
            ? colors.textDisabled
            : warn
              ? colors.warning
              : colors.textPrimary,
          lineHeight: 1.1,
          marginTop: space['2'],
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: fontSize.sm,
            color: muted ? colors.textDisabled : colors.textMuted,
            marginTop: space['1'],
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );

  if (link) {
    return (
      <Link href={link} style={{ textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

type ListItem = {
  id: string;
  primary: string;
  secondary: string;
  href: string;
  cta: string;
  stat?: React.ReactNode;
};

function ListSection({
  title,
  count,
  empty,
  items,
}: {
  title: string;
  count: number;
  empty: string;
  items: ListItem[];
}) {
  return (
    <div style={card}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: space['4'],
        }}
      >
        <h2 style={h2Style}>{title}</h2>
        <span style={{ ...monoNum, fontSize: fontSize.base, color: colors.textMuted }}>
          {count}
        </span>
      </div>

      {items.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: `${space['6']}px 0`,
            textAlign: 'center',
            color: colors.textDisabled,
            fontSize: fontSize.sm,
          }}
        >
          {empty}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => (
            <li
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: space['3'],
                padding: `${space['3']}px 0`,
                borderTop: i > 0 ? `1px solid ${colors.borderSubtle}` : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.medium,
                    color: colors.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.primary}
                </div>
                <div
                  style={{
                    fontSize: fontSize.sm,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {it.secondary}
                </div>
              </div>
              {it.stat && (
                <div style={{ fontSize: fontSize.md, ...monoNum, textAlign: 'right' }}>
                  {it.stat}
                </div>
              )}
              <Link
                href={it.href}
                style={{
                  fontSize: fontSize.sm,
                  color: colors.textSecondary,
                  textDecoration: 'none',
                  padding: `${space['1']}px ${space['2']}px`,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgCard,
                  whiteSpace: 'nowrap',
                }}
              >
                {it.cta}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    padding: `${space['2']}px ${space['4']}px`,
    background: colors.bgCard,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    textDecoration: 'none',
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    transition: 'border-color 100ms, background 100ms, color 100ms',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={baseStyle}>
        {label}
        <span aria-hidden style={{ fontSize: fontSize.sm, color: colors.textMuted, fontFamily: fontFamilyMono }}>
          ↗
        </span>
      </a>
    );
  }
  return (
    <Link href={href} style={baseStyle}>
      {label}
    </Link>
  );
}
