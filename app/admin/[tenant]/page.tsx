import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import {
  card,
  colors,
  contentMaxWidth,
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
  // 報表 - 過去 30 天
  const days30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    ordersTodayResp,
    revenueTodayResp,
    attendancesTodayResp,
    classesTodayResp,
    pendingPaymentResp,
    pendingShipResp,
    lowStockResp,
    upcomingResvResp,
    revenue30dResp,
    topProductsResp,
    funnelResp,
    activityTrendResp,
  ] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd),
    // 今日下單總額(不管付款狀態 — 反映「真實銷售」直覺)
    // 排除 cancelled / refunded(這些 trigger 自動退庫存,不算)
    supabaseAdmin
      .from('orders')
      .select('total_twd, status')
      .eq('tenant_id', tenant.id)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .not('status', 'in', '(cancelled,refunded)'),
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
          // 只列收費課(2026-09-02):免費課直接到場不用管理,總覽只看要對帳的
          .eq('is_paid', true)
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
    // 報表 A:過去 30 天每日營收
    supabaseAdmin
      .from('orders')
      .select('created_at, total_twd')
      .eq('tenant_id', tenant.id)
      .gte('created_at', days30Ago)
      .not('status', 'in', '(cancelled,refunded)'),
    // 報表 B:熱賣商品(過去 30 天 by revenue,join products 拿名)
    supabaseAdmin
      .from('order_items')
      .select('product_id, qty, price_at_purchase, products(name), orders!inner(created_at, tenant_id, status)')
      .eq('orders.tenant_id', tenant.id)
      .gte('orders.created_at', days30Ago)
      .not('orders.status', 'in', '(cancelled,refunded)')
      .limit(500),
    // 報表 C:訂單狀態分布(過去 30 天)
    supabaseAdmin
      .from('orders')
      .select('status, payment_status')
      .eq('tenant_id', tenant.id)
      .gte('created_at', days30Ago),
    // 報表 D:活動趨勢(過去 30 天 attendances per day)
    hasActivities
      ? supabaseAdmin
          .from('attendances')
          .select('checked_in_at')
          .eq('tenant_id', tenant.id)
          .gte('checked_in_at', days30Ago)
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

  // ============ 報表處理 ============

  // A. 30 天每日營收(以 Asia/Taipei 日期 group)
  const dayKeys: string[] = [];
  const dayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const k = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}`;
    dayKeys.push(k);
    dayMap.set(k, 0);
  }
  for (const o of (revenue30dResp.data as { created_at: string; total_twd: number | null }[] | null) ?? []) {
    const tw = new Date(new Date(o.created_at).getTime() + 8 * 60 * 60 * 1000);
    const k = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}`;
    if (dayMap.has(k)) dayMap.set(k, dayMap.get(k)! + (o.total_twd ?? 0));
  }
  const revenueSeries = dayKeys.map((k) => ({ date: k, revenue: dayMap.get(k) ?? 0 }));
  const revenueMax = Math.max(1, ...revenueSeries.map((d) => d.revenue));
  const revenueTotal30 = revenueSeries.reduce((s, d) => s + d.revenue, 0);

  // B. 熱賣商品 top 5(by revenue)
  type OrderItemRow = {
    product_id: string;
    qty: number;
    price_at_purchase: number;
    products: { name: string } | null;
  };
  const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const it of (topProductsResp.data as unknown as OrderItemRow[] | null) ?? []) {
    const ex = topMap.get(it.product_id) ?? {
      name: it.products?.name ?? '(已刪)',
      qty: 0,
      revenue: 0,
    };
    ex.qty += it.qty;
    ex.revenue += (it.price_at_purchase ?? 0) * it.qty;
    topMap.set(it.product_id, ex);
  }
  const topProducts = Array.from(topMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const topRevenueMax = Math.max(1, ...topProducts.map((p) => p.revenue));

  // C. 訂單狀態分布(過去 30 天)
  const statusCounts = { open: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0, refunded: 0 };
  for (const o of (funnelResp.data as { status: string }[] | null) ?? []) {
    if (o.status in statusCounts) statusCounts[o.status as keyof typeof statusCounts]++;
  }
  const funnelTotal =
    statusCounts.open +
    statusCounts.paid +
    statusCounts.shipped +
    statusCounts.delivered +
    statusCounts.cancelled +
    statusCounts.refunded;

  // D. 活動 30 天 attendance per day
  const activityDayMap = new Map<string, number>();
  for (const k of dayKeys) activityDayMap.set(k, 0);
  for (const a of (activityTrendResp.data as { checked_in_at: string }[] | null) ?? []) {
    const tw = new Date(new Date(a.checked_in_at).getTime() + 8 * 60 * 60 * 1000);
    const k = `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}`;
    if (activityDayMap.has(k)) activityDayMap.set(k, activityDayMap.get(k)! + 1);
  }
  const activitySeries = dayKeys.map((k) => ({ date: k, count: activityDayMap.get(k) ?? 0 }));
  const activityMax = Math.max(1, ...activitySeries.map((d) => d.count));
  const activityTotal30 = activitySeries.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ maxWidth: contentMaxWidth, margin: '0 auto' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
/* iPad portrait / horizontal / 小筆電(<1300):4 col 太擠改 2x2 */
@media (min-width: 768px) and (max-width: 1300px) {
  body .admin-content .dashboard-metric-grid {
    grid-template-columns: 1fr 1fr !important;
    gap: 14px !important;
    margin-bottom: 32px !important;
  }
  body .admin-content .dashboard-metric-grid > a > div,
  body .admin-content .dashboard-metric-grid > div {
    padding: 18px 20px !important;
  }
  body .admin-content .dashboard-list-grid {
    grid-template-columns: 1fr 1fr !important;
    gap: 16px !important;
    margin-bottom: 32px !important;
  }
}

@media (max-width: 767px) {
  /* 高 specificity 蓋過 layout 的 catch-all [style*=...] rule */
  body .admin-content .dashboard-metric-grid {
    grid-template-columns: 1fr 1fr !important;
    gap: 10px !important;
    margin-bottom: 20px !important;
  }
  /* 卡片壓扁:高度自然 + padding 緊湊 + 內部 gap 縮小 */
  body .admin-content .dashboard-metric-grid > a > div,
  body .admin-content .dashboard-metric-grid > div {
    padding: 10px 12px !important;
    height: auto !important;
    min-height: 76px !important;
    gap: 0 !important;
    border-radius: 10px !important;
  }
  /* Label small caps 縮一點 */
  body .admin-content .dashboard-metric-grid [style*="text-transform: uppercase"],
  body .admin-content .dashboard-metric-grid [style*="textTransform: uppercase"] {
    font-size: 10px !important;
    letter-spacing: 0.06em !important;
  }
  /* 大數字 — 不那麼粗大,line-height 緊湊 */
  body .admin-content .dashboard-metric-grid [style*="lineHeight: 1.1"] {
    font-size: 26px !important;
    margin-top: 2px !important;
    line-height: 1 !important;
  }
  /* sub 字 — 緊貼大數字 */
  body .admin-content .dashboard-metric-grid > a > div > div:last-child,
  body .admin-content .dashboard-metric-grid > div > div:last-child {
    margin-top: 2px !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
  }
  body .admin-content .dashboard-list-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  body .admin-content .dashboard-hero h1 {
    font-size: 24px !important;
  }
}
          `,
        }}
      />

      {/* Hero */}
      <header className="dashboard-hero" style={{ marginBottom: space['10'] }}>
        <div style={{ ...sectionLabel, marginBottom: space['2'] }}>{formatToday()}</div>
        <h1 style={h1Style}>{tenant.name}</h1>
      </header>

      {/* Metric row */}
      <section
        className="dashboard-metric-grid"
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
          sub={`下單 NT$ ${revenueToday.toLocaleString()}`}
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
          className="dashboard-list-grid"
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

      {/* 報表 A:30 天營收時序 */}
      <section style={{ marginBottom: space['10'] }}>
        <div style={{ ...sectionLabel, marginBottom: space['3'] }}>
          過去 30 天營收(NT$ {revenueTotal30.toLocaleString()} 累積)
        </div>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            padding: space['6'],
          }}
        >
          <RevenueLineChart series={revenueSeries} max={revenueMax} />
        </div>
      </section>

      {/* 報表 B:熱賣商品 Top 5 */}
      {topProducts.length > 0 && (
        <section style={{ marginBottom: space['10'] }}>
          <div style={{ ...sectionLabel, marginBottom: space['3'] }}>過去 30 天熱賣商品 Top 5</div>
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              padding: space['6'],
              display: 'flex',
              flexDirection: 'column',
              gap: space['3'],
            }}
          >
            {topProducts.map((p, i) => (
              <ProductBar
                key={p.id}
                rank={i + 1}
                name={p.name}
                qty={p.qty}
                revenue={p.revenue}
                max={topRevenueMax}
              />
            ))}
          </div>
        </section>
      )}

      {/* 報表 C:訂單狀態漏斗 */}
      {funnelTotal > 0 && (
        <section style={{ marginBottom: space['10'] }}>
          <div style={{ ...sectionLabel, marginBottom: space['3'] }}>
            過去 30 天訂單狀態(共 {funnelTotal} 筆)
          </div>
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              padding: space['6'],
            }}
          >
            <OrderFunnel counts={statusCounts} total={funnelTotal} />
          </div>
        </section>
      )}

      {/* 報表 D:活動 30 天簽到趨勢(只 hasActivities) */}
      {hasActivities && (
        <section style={{ marginBottom: space['10'] }}>
          <div style={{ ...sectionLabel, marginBottom: space['3'] }}>
            過去 30 天簽到({activityTotal30} 人次累積)
          </div>
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              padding: space['6'],
            }}
          >
            <ActivityBarChart series={activitySeries} max={activityMax} />
          </div>
        </section>
      )}

    </div>
  );
}

// ────────────────────────────────────────────────
// Components
// ────────────────────────────────────────────────

/**
 * SVG 折線 chart — 30 天每日營收。純 SVG,沒裝 lib。
 */
function RevenueLineChart({
  series,
  max,
}: {
  series: { date: string; revenue: number }[];
  max: number;
}) {
  const W = 720;
  const H = 200;
  const PAD_X = 40;
  const PAD_Y = 16;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const stepX = innerW / Math.max(1, series.length - 1);
  const points = series
    .map((d, i) => {
      const x = PAD_X + i * stepX;
      const y = PAD_Y + innerH - (d.revenue / max) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `M ${PAD_X} ${PAD_Y + innerH} L ${points.replace(/ /g, ' L ')} L ${PAD_X + innerW} ${PAD_Y + innerH} Z`;

  // 標 Y 軸最大 + 中間 + 0
  const yLabels = [max, Math.round(max / 2), 0];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 480, height: 'auto', display: 'block' }}
      >
        {/* Grid lines */}
        {yLabels.map((v, i) => {
          const y = PAD_Y + (innerH * i) / 2;
          return (
            <g key={i}>
              <line x1={PAD_X} y1={y} x2={PAD_X + innerW} y2={y} stroke="#e4e4e7" strokeDasharray="2,3" />
              <text x={PAD_X - 6} y={y + 4} fontSize="9" textAnchor="end" fill="#71717a">
                {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={areaPath} fill="rgba(5,200,120,0.08)" />
        {/* Line */}
        <polyline points={points} fill="none" stroke="#05C878" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {series.map((d, i) => {
          const x = PAD_X + i * stepX;
          const y = PAD_Y + innerH - (d.revenue / max) * innerH;
          return (
            <circle key={i} cx={x} cy={y} r={d.revenue > 0 ? 2 : 0} fill="#05C878">
              <title>
                {d.date}:NT$ {d.revenue.toLocaleString()}
              </title>
            </circle>
          );
        })}
        {/* X 軸標籤(每 5 天) */}
        {series.map((d, i) => {
          if (i % 5 !== 0 && i !== series.length - 1) return null;
          const x = PAD_X + i * stepX;
          const label = d.date.slice(5); // MM-DD
          return (
            <text key={i} x={x} y={H - 2} fontSize="9" textAnchor="middle" fill="#71717a">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * 熱賣商品橫桿
 */
function ProductBar({
  rank,
  name,
  qty,
  revenue,
  max,
}: {
  rank: number;
  name: string;
  qty: number;
  revenue: number;
  max: number;
}) {
  const w = Math.max(2, (revenue / max) * 100);
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
          {medal} {name}
        </span>
        <span style={{ ...monoNum, fontSize: fontSize.sm, color: colors.textMuted, whiteSpace: 'nowrap' }}>
          {qty} 件 · NT$ {revenue.toLocaleString()}
        </span>
      </div>
      <div style={{ width: '100%', height: 6, background: colors.bgSubtle, borderRadius: 3, overflow: 'hidden' }}>
        <div
          style={{
            width: `${w}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #05C878 0%, #16a34a 100%)',
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  );
}

/**
 * 訂單狀態漏斗
 */
function OrderFunnel({
  counts,
  total,
}: {
  counts: { open: number; paid: number; shipped: number; delivered: number; cancelled: number; refunded: number };
  total: number;
}) {
  const stages = [
    { key: 'open', label: '未付款', count: counts.open, color: '#d97706' },
    { key: 'paid', label: '已付款', count: counts.paid, color: '#16a34a' },
    { key: 'shipped', label: '已出貨', count: counts.shipped, color: '#0070f3' },
    { key: 'delivered', label: '已送達', count: counts.delivered, color: '#15803d' },
    { key: 'cancelled', label: '取消', count: counts.cancelled, color: '#9ca3af' },
    { key: 'refunded', label: '退款', count: counts.refunded, color: '#71717a' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stages.filter((s) => s.count > 0).map((s) => {
        const pct = total > 0 ? (s.count / total) * 100 : 0;
        return (
          <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: fontSize.sm }}>
              <span style={{ color: colors.textPrimary, fontWeight: fontWeight.medium }}>
                {s.label}
              </span>
              <span style={{ ...monoNum, color: colors.textMuted }}>
                {s.count} · {pct.toFixed(1)}%
              </span>
            </div>
            <div style={{ width: '100%', height: 10, background: colors.bgSubtle, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: s.color, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 活動簽到 30 天 bar chart
 */
function ActivityBarChart({
  series,
  max,
}: {
  series: { date: string; count: number }[];
  max: number;
}) {
  const W = 720;
  const H = 160;
  const PAD_X = 36;
  const PAD_Y = 12;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const barW = (innerW / series.length) * 0.7;
  const gap = (innerW / series.length) * 0.3;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: 'auto', display: 'block' }}>
        {[max, 0].map((v, i) => {
          const y = PAD_Y + (innerH * i);
          return (
            <g key={i}>
              <line x1={PAD_X} y1={y} x2={PAD_X + innerW} y2={y} stroke="#e4e4e7" strokeDasharray="2,3" />
              <text x={PAD_X - 6} y={y + 4} fontSize="9" textAnchor="end" fill="#71717a">{v}</text>
            </g>
          );
        })}
        {series.map((d, i) => {
          const h = (d.count / max) * innerH;
          const x = PAD_X + i * (barW + gap);
          const y = PAD_Y + innerH - h;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={d.count > 0 ? '#05C878' : 'transparent'}
              rx={1}
            >
              <title>{d.date}:{d.count} 人</title>
            </rect>
          );
        })}
        {series.map((d, i) => {
          if (i % 5 !== 0 && i !== series.length - 1) return null;
          const x = PAD_X + i * (barW + gap) + barW / 2;
          return (
            <text key={i} x={x} y={H - 2} fontSize="9" textAnchor="middle" fill="#71717a">
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

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
  // 緊湊版:固定高度 + 縮 padding,4 卡並排視覺一致
  const inner = (
    <div
      style={{
        ...card,
        padding: `${space['4']}px ${space['5']}px`,
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
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
          fontSize: typeof value === 'string' && value.length > 6 ? fontSize.xl : fontSize['2xl'],
          fontWeight: fontWeight.semibold,
          color: muted
            ? colors.textDisabled
            : warn
              ? colors.warning
              : colors.textPrimary,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: fontSize.xs,
          color: muted ? colors.textDisabled : colors.textMuted,
          minHeight: 16,
        }}
      >
        {sub ?? ''}
      </div>
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

