/**
 * 後台總覽(2026-10-20 改版)
 *
 * 原本是一堆單點數字(今日訂單、今日營收…),看了不知道好不好。
 * 改成四排:數字卡(本月 vs 上月同期)→ 每週營收 + 付款通路 → 分類排行 + 熱銷 → 快速操作。
 * 訂單相關的數字全部從「近 90 天訂單(含明細)」一支查詢在程式裡算,不再十幾支查詢各算各的。
 * 營收主數字一律「不含運費」,含運另標小字。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ range?: string }>;
};

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  source: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  user_id: string | null;
  shipping_phone: string | null;
  created_at: string;
  order_items: { qty: number; price_at_purchase: number; products: { name: string; category: string | null } | null }[] | null;
};

const TW = 8 * 3600 * 1000;
/** 台北時區的「某天 00:00」對應的 UTC Date */
function twDayStart(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - TW);
}
function money(n: number): string {
  return 'NT$ ' + Math.round(n).toLocaleString();
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

const c = {
  text: '#18181b',
  sec: '#52525b',
  muted: '#71717a',
  faint: '#a1a1aa',
  line: '#e4e4e7',
  lineSoft: '#f4f4f5',
  up: '#15803d',
  down: '#b91c1c',
  blue: '#2563eb',
  linePay: '#06c755',
};
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${c.line}`, borderRadius: 12 };
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const lbl: React.CSSProperties = { fontSize: 12, color: c.muted };
const big: React.CSSProperties = { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, ...num };
const ct: React.CSSProperties = { margin: 0, fontSize: 13.5, fontWeight: 700 };
const cs: React.CSSProperties = { fontSize: 12, color: c.muted, marginTop: 2 };

function Delta({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  const diff = now - before;
  const color = diff > 0 ? c.up : diff < 0 ? c.down : c.muted;
  const sign = diff > 0 ? '+ ' : diff < 0 ? '− ' : '';
  const fmt = (v: number) => (unit === '$' ? money(v) : `${v.toLocaleString()}${unit}`);
  return (
    <div style={{ marginTop: 8, fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ ...num, fontWeight: 700, color }}>{sign}{fmt(Math.abs(diff))}</span>
      <span style={{ ...num, color: c.muted }}>上月同期 {fmt(before)}</span>
    </div>
  );
}

export default async function TenantDashboardPage({ params, searchParams }: Props) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const hasActivities = hasFeature(tenant, 'activities');
  const hasLinePay = hasFeature(tenant, 'line_pay');

  // ── 時間範圍(全部以台北時區算)──
  const now = new Date();
  const tw = new Date(now.getTime() + TW);
  const y = tw.getUTCFullYear();
  const m = tw.getUTCMonth();
  const d = tw.getUTCDate();
  const monthStart = twDayStart(y, m, 1);
  const lastMonthStart = twDayStart(y, m - 1, 1);
  const lastMonthSameEnd = new Date(Math.min(twDayStart(y, m - 1, d + 1).getTime(), monthStart.getTime()));
  const since90 = new Date(now.getTime() - 90 * 86400000);
  const dayStart = twDayStart(y, m, d);
  const dayEnd = twDayStart(y, m, d + 1);
  const week7 = new Date(now.getTime() + 7 * 86400000);
  const range = sp.range === '30' || sp.range === '90' ? sp.range : 'month';
  const rangeSince = range === '30' ? new Date(now.getTime() - 30 * 86400000) : range === '90' ? since90 : monthStart;
  const rangeLabel = range === '30' ? '近 30 天' : range === '90' ? '近 90 天' : '本月';

  const [ordersResp, reportedResp, pendShipResp, lowStockResp, classesTodayResp, attendTodayResp, upcomingResp] =
    await Promise.all([
      supabaseAdmin
        .from('orders')
        .select(
          'id, status, payment_status, payment_method, source, total_twd, shipping_fee_twd, user_id, shipping_phone, created_at, order_items(qty, price_at_purchase, products(name, category))',
        )
        .eq('tenant_id', tenant.id)
        .gte('created_at', new Date(Math.min(since90.getTime(), lastMonthStart.getTime())).toISOString())
        .limit(2000),
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('payment_status', 'pending')
        .not('payment_reported_at', 'is', null)
        .not('status', 'in', '(cancelled,refunded)'),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'paid'),
      supabaseAdmin
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .lte('stock', 3),
      hasActivities
        ? supabaseAdmin
            .from('classes')
            .select('id, name, scheduled_at, capacity')
            .eq('tenant_id', tenant.id)
            .eq('is_paid', true)
            .gte('scheduled_at', dayStart.toISOString())
            .lt('scheduled_at', dayEnd.toISOString())
            .neq('status', 'cancelled')
            .order('scheduled_at')
        : Promise.resolve({ data: null }),
      hasActivities
        ? supabaseAdmin
            .from('attendances')
            .select('id, classes!inner(is_paid)', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('classes.is_paid', true)
            .gte('checked_in_at', dayStart.toISOString())
            .lt('checked_in_at', dayEnd.toISOString())
        : Promise.resolve({ count: null }),
      hasActivities
        ? supabaseAdmin
            .from('classes')
            .select('id, name, scheduled_at, capacity, reservations!inner(status)')
            .eq('tenant_id', tenant.id)
            .eq('is_paid', true)
            .gte('scheduled_at', now.toISOString())
            .lt('scheduled_at', week7.toISOString())
            .neq('status', 'cancelled')
            .in('reservations.status', ['confirmed', 'waitlist'])
            .order('scheduled_at')
            .limit(20)
        : Promise.resolve({ data: null }),
    ]);

  const all = ((ordersResp.data ?? []) as unknown as OrderRow[]).map((o) => ({ ...o, t: new Date(o.created_at).getTime() }));
  const valid = all.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
  const inRange = (o: { t: number }, from: Date, to?: Date) => o.t >= from.getTime() && (!to || o.t < to.getTime());

  // ── 第一排:本月 vs 上月同期 ──
  const thisM = valid.filter((o) => inRange(o, monthStart));
  const lastM = valid.filter((o) => inRange(o, lastMonthStart, lastMonthSameEnd));
  const sum = (xs: typeof valid) => xs.reduce((s, o) => s + (o.total_twd ?? 0), 0);
  const revThis = sum(thisM);
  const revLast = sum(lastM);
  const shipThis = thisM.reduce((s, o) => s + (o.shipping_fee_twd ?? 0), 0);
  const aovThis = thisM.length ? revThis / thisM.length : 0;
  const aovLast = lastM.length ? revLast / lastM.length : 0;
  const itemsThis = thisM.reduce((s, o) => s + (o.order_items ?? []).reduce((a, i) => a + i.qty, 0), 0);
  const customersThis = new Set(thisM.map((o) => o.user_id ?? o.shipping_phone ?? o.id)).size;
  const cancelledThis = all.filter((o) => inRange(o, monthStart) && (o.status === 'cancelled' || o.status === 'refunded')).length;
  const reported = reportedResp.count ?? 0;
  const pendShip = pendShipResp.count ?? 0;
  const lowStock = lowStockResp.count ?? 0;

  // ── 第二排左:近 8 週(週一起算)──
  const dow = (tw.getUTCDay() + 6) % 7; // 週一 = 0
  const thisWeekStart = twDayStart(y, m, d - dow);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisWeekStart.getTime() - (7 - i) * 7 * 86400000);
    const end = new Date(start.getTime() + 7 * 86400000);
    const v = sum(valid.filter((o) => inRange(o, start, end)));
    const s = new Date(start.getTime() + TW);
    return { label: `${s.getUTCMonth() + 1}/${s.getUTCDate()}`, value: v, current: i === 7 };
  });
  const weekMax = Math.max(2500, ...weeks.map((w) => w.value)) * 1.15;
  const bestWeek = weeks.slice(0, 7).reduce((b, w) => (w.value > b.value ? w : b), weeks[0]);
  const avg4 = Math.round(weeks.slice(3, 7).reduce((s, w) => s + w.value, 0) / 4);

  // ── 範圍內(本月 / 30 / 90 天):付款、通路、分類、熱銷 ──
  const scoped = valid.filter((o) => inRange(o, rangeSince));
  const count = (key: (o: OrderRow) => string) => {
    const mp = new Map<string, number>();
    for (const o of scoped) mp.set(key(o), (mp.get(key(o)) ?? 0) + 1);
    return mp;
  };
  const payMap = count((o) => (o.payment_method === 'line_pay' ? 'line_pay' : 'bank'));
  const srcMap = count((o) => (o.source === 'liff' ? 'liff' : o.source === 'web' ? 'web' : 'other'));
  const payBank = payMap.get('bank') ?? 0;
  const payLine = payMap.get('line_pay') ?? 0;
  const srcLiff = srcMap.get('liff') ?? 0;
  const srcWeb = srcMap.get('web') ?? 0;
  const srcOther = srcMap.get('other') ?? 0;

  const catMap = new Map<string, number>();
  const prodMap = new Map<string, { qty: number; rev: number }>();
  for (const o of scoped) {
    for (const i of o.order_items ?? []) {
      if (!i.products) continue;
      const amt = i.qty * i.price_at_purchase;
      if (amt <= 0) continue; // 贈品(0 元)不計
      const cat = i.products.category ?? '未分類';
      catMap.set(cat, (catMap.get(cat) ?? 0) + amt);
      const p = prodMap.get(i.products.name) ?? { qty: 0, rev: 0 };
      p.qty += i.qty;
      p.rev += amt;
      prodMap.set(i.products.name, p);
    }
  }
  const cats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const catMax = cats[0]?.[1] ?? 1;
  const tops = [...prodMap.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 8);

  // ── 活動 ──
  type Cls = { id: string; name: string; scheduled_at: string; capacity: number | null; reservations?: { status: string }[] };
  const classesToday = ((classesTodayResp.data as unknown) as Cls[] | null) ?? [];
  const attendToday = attendTodayResp.count ?? 0;
  const upcomingRaw = ((upcomingResp.data as unknown) as Cls[] | null) ?? [];
  const upcoming = new Map<string, { name: string; at: string; capacity: number | null; confirmed: number; waitlist: number }>();
  for (const cl of upcomingRaw) {
    const ex = upcoming.get(cl.id) ?? { name: cl.name, at: cl.scheduled_at, capacity: cl.capacity, confirmed: 0, waitlist: 0 };
    for (const r of cl.reservations ?? []) {
      if (r.status === 'confirmed') ex.confirmed++;
      else if (r.status === 'waitlist') ex.waitlist++;
    }
    upcoming.set(cl.id, ex);
  }
  const fmtAt = (iso: string) =>
    new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  const todayLabel = tw.toLocaleDateString('zh-TW', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const base = `/admin/${tenant.slug}`;
  const rangeHref = (r: string) => (r === 'month' ? base : `${base}?range=${r}`);

  return (
    <main className="dash" style={{ color: c.text }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.dash { padding: 28px 32px 48px; }
@media (max-width: 768px) { .dash { padding: 8px 4px 32px; } .wv { display: none; } }
.qa { display:flex; align-items:center; gap:8px; padding:12px 14px; border:1px solid ${c.line}; border-radius:10px; background:#fff; font-size:13px; font-weight:600; color:${c.text}; text-decoration:none; flex:1 1 160px; min-width:0; }
.qa:hover { border-color:${c.text}; }
.qa .n { margin-left:auto; font-size:12px; font-weight:700; padding:2px 8px; border-radius:999px; background:${c.lineSoft}; color:${c.sec}; font-variant-numeric:tabular-nums; }
.qa .n.hot { background:#fee2e2; color:${c.down}; }
.dash-grid4 { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; }
.dash-grid21 { display:grid; grid-template-columns:2fr 1fr; gap:14px; }
.dash-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width: 1100px) { .dash-grid4 { grid-template-columns:repeat(2, minmax(0,1fr)); } .dash-grid21, .dash-grid2 { grid-template-columns:1fr; } }
          `,
        }}
      />

      {/* 頁首 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>總覽</h1>
          <div style={cs}>{tenant.name} · {todayLabel} · 本月第 {d} 天</div>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: c.lineSoft, borderRadius: 9 }}>
          {[['month', '本月'], ['30', '近 30 天'], ['90', '近 90 天']].map(([r, label]) => {
            const on = r === range;
            return (
              <Link
                key={r}
                href={rangeHref(r)}
                style={{ padding: '7px 12px', borderRadius: 7, background: on ? '#fff' : 'transparent', color: on ? c.text : c.sec, fontSize: 12.5, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none', textDecoration: 'none' }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 第一排:數字卡 */}
      <div className="dash-grid4" style={{ marginBottom: 14 }}>
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={lbl}>本月營收(不含運費)</div>
          <div style={{ ...big, marginTop: 8 }}>{money(revThis)}</div>
          <Delta now={revThis} before={revLast} unit="$" />
          <div style={{ ...cs, ...num, marginTop: 6 }}>含運費 {money(revThis + shipThis)} · 運費 {money(shipThis)}</div>
        </div>
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={lbl}>本月訂單</div>
          <div style={{ ...big, marginTop: 8 }}>{thisM.length} <span style={{ fontSize: 14, fontWeight: 500, color: c.muted }}>筆</span></div>
          <Delta now={thisM.length} before={lastM.length} unit=" 筆" />
          <div style={{ ...cs, ...num, marginTop: 6 }}>{customersThis} 位客人 · 取消 / 退款 {cancelledThis}</div>
        </div>
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={lbl}>客單價</div>
          <div style={{ ...big, marginTop: 8 }}>{money(aovThis)}</div>
          <Delta now={Math.round(aovThis)} before={Math.round(aovLast)} unit="$" />
          <div style={{ ...cs, ...num, marginTop: 6 }}>每單平均 {thisM.length ? (itemsThis / thisM.length).toFixed(1) : '0'} 件</div>
        </div>
        <Link href={`${base}/orders`} style={{ ...card, padding: '16px 18px', textDecoration: 'none', color: c.text, display: 'block' }}>
          <div style={lbl}>待處理</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
            <div><div style={{ ...big, color: reported > 0 ? c.down : c.text }}>{reported}</div><div style={cs}>待核帳</div></div>
            <div><div style={{ ...big, color: pendShip > 0 ? c.blue : c.text }}>{pendShip}</div><div style={cs}>待出貨</div></div>
            <div><div style={{ ...big, color: lowStock > 0 ? c.down : c.text }}>{lowStock}</div><div style={cs}>低庫存</div></div>
          </div>
          <div style={{ ...cs, marginTop: 6 }}>點進去看清單 ›</div>
        </Link>
      </div>

      {/* 第二排:每週營收 + 付款通路 */}
      <div className="dash-grid21" style={{ marginBottom: 14 }}>
        <div style={{ ...card, padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={ct}>每週營收</h2>
              <div style={cs}>近 8 週,一週一根(週一起算);最右邊是本週(進行中)</div>
            </div>
            <div style={{ ...num, fontSize: 12, color: c.sec, textAlign: 'right' }}>
              <div>本月累積 <strong style={{ color: c.text, fontSize: 14 }}>{money(revThis)}</strong></div>
              <div style={{ marginTop: 2 }}>上月同期 {money(revLast)}</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 190, marginTop: 18 }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <div style={{ borderTop: `1px dashed ${c.line}`, fontSize: 10.5, color: c.faint, textAlign: 'right', ...num }}>{money(weekMax / 1.15)}</div>
              <div style={{ borderTop: `1px dashed ${c.line}`, fontSize: 10.5, color: c.faint, textAlign: 'right', ...num }}>{money(weekMax / 1.15 / 2)}</div>
              <div style={{ borderTop: `1px solid ${c.line}` }} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, display: 'flex', alignItems: 'flex-end', gap: 14, padding: '0 6px' }}>
              {weeks.map((w) => (
                <div key={w.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
                  <span className="wv" style={{ ...num, fontSize: 11.5, fontWeight: 700, color: w.current ? c.muted : w.value ? c.text : '#d4d4d8', whiteSpace: 'nowrap' }}>
                    {w.value ? money(w.value) : w.current ? '進行中' : '—'}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: w.value ? `${(w.value / weekMax) * 100}%` : 4,
                      background: w.current ? '#fff' : w.value ? c.text : '#ececee',
                      border: w.current ? `2px dashed ${c.faint}` : 0,
                      boxSizing: 'border-box',
                      borderRadius: '6px 6px 0 0',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, padding: '0 6px', marginTop: 8 }}>
            {weeks.map((w) => (
              <div key={w.label} style={{ ...num, flex: 1, textAlign: 'center', fontSize: 10.5, color: w.current ? c.text : c.faint, whiteSpace: 'nowrap', minWidth: 0 }}>
                {w.current ? '本週' : w.label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.lineSoft}`, fontSize: 12, color: c.sec, flexWrap: 'wrap', ...num }}>
            <span>單週最高 <strong style={{ color: c.text }}>{money(bestWeek.value)}</strong>{bestWeek.value > 0 ? `(${bestWeek.label} 那週)` : ''}</span>
            <span>近 4 週平均 <strong style={{ color: c.text }}>{money(avg4)}</strong> / 週</span>
            <span>本週到目前 <strong style={{ color: c.text }}>{money(weeks[7].value)}</strong></span>
          </div>
        </div>

        <div style={{ ...card, padding: '16px 18px' }}>
          <h2 style={ct}>付款與通路</h2>
          <div style={cs}>{rangeLabel}的訂單怎麼來、怎麼付</div>
          {scoped.length === 0 ? (
            <p style={{ ...cs, marginTop: 18 }}>這段期間還沒有訂單。</p>
          ) : (
            <>
              <div style={{ marginTop: 18 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>付款方式</div>
                <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: c.lineSoft }}>
                  <div style={{ width: `${pct(payBank, scoped.length)}%`, background: c.text }} />
                  <div style={{ width: `${pct(payLine, scoped.length)}%`, background: c.linePay }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, gap: 8, flexWrap: 'wrap', ...num }}>
                  <span><Dot color={c.text} />匯款 {payBank} 筆({pct(payBank, scoped.length)}%)</span>
                  <span><Dot color={c.linePay} />LINE Pay {payLine} 筆({pct(payLine, scoped.length)}%)</span>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>下單通路</div>
                <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: c.lineSoft }}>
                  <div style={{ width: `${pct(srcLiff, scoped.length)}%`, background: c.text }} />
                  <div style={{ width: `${pct(srcWeb, scoped.length)}%`, background: c.faint }} />
                  <div style={{ width: `${pct(srcOther, scoped.length)}%`, background: '#d4d4d8' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, gap: 8, flexWrap: 'wrap', ...num }}>
                  <span><Dot color={c.text} />LINE 商品專區 {srcLiff} 筆</span>
                  <span><Dot color={c.faint} />網頁 {srcWeb} 筆</span>
                  {srcOther > 0 && <span><Dot color="#d4d4d8" />其他 {srcOther} 筆</span>}
                </div>
              </div>
              {hasLinePay && payLine > 0 && (
                <div style={{ marginTop: 20, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
                  {rangeLabel}有 {payLine} 筆用 LINE Pay 付款,省下 {payLine} 次核帳。
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 第三排:分類排行 + 熱銷 */}
      <div className="dash-grid2" style={{ marginBottom: 14 }}>
        <div style={{ ...card, padding: '16px 18px' }}>
          <h2 style={ct}>分類排行</h2>
          <div style={cs}>{rangeLabel}各分類營收(不含贈品)</div>
          {cats.length === 0 ? (
            <p style={{ ...cs, marginTop: 14 }}>還沒有資料。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              {cats.map(([name, rev]) => (
                <div key={name} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 96px', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <div style={{ height: 14, background: c.lineSoft, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(2, (rev / catMax) * 100)}%`, background: c.text, borderRadius: 3 }} />
                  </div>
                  <span style={{ ...num, textAlign: 'right', fontWeight: 600 }}>{money(rev)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div><h2 style={ct}>熱銷商品</h2><div style={cs}>{rangeLabel}前 8 名,依營收</div></div>
            <Link href={`${base}/products`} style={{ fontSize: 12, color: c.sec, textDecoration: 'none' }}>看全部 ›</Link>
          </div>
          {tops.length === 0 ? (
            <p style={{ ...cs, marginTop: 14 }}>還沒有資料。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
              {tops.map(([name, p], i) => (
                <div key={name} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 56px 96px', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${c.lineSoft}`, fontSize: 12.5 }}>
                  <span style={{ ...num, color: c.faint }}>{i + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ ...num, color: c.muted, textAlign: 'right' }}>× {p.qty}</span>
                  <span style={{ ...num, textAlign: 'right', fontWeight: 600 }}>{money(p.rev)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 第四排:快速操作 + 活動 */}
      <div className={hasActivities ? 'dash-grid21' : undefined}>
        <div>
          <div style={{ ...lbl, marginBottom: 8 }}>快速操作</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`${base}/products`} className="qa">新增商品</Link>
            <Link href={`${base}/orders?payment=pending`} className="qa">待核帳訂單 <span className={`n${reported > 0 ? ' hot' : ''}`}>{reported}</span></Link>
            <Link href={`${base}/orders?status=paid`} className="qa">待出貨訂單 <span className={`n${pendShip > 0 ? ' hot' : ''}`}>{pendShip}</span></Link>
            <Link href={`${base}/inventory`} className="qa">庫存不足 <span className={`n${lowStock > 0 ? ' hot' : ''}`}>{lowStock}</span></Link>
            {hasLinePay && <Link href={`${base}/linepay`} className="qa">LINE Pay 對帳</Link>}
            {hasActivities && <Link href={`${base}/classes`} className="qa">活動與簽到</Link>}
          </div>
        </div>

        {hasActivities && (
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={ct}>活動</h2>
              <span style={{ ...cs, ...num }}>今日簽到 {attendToday}</span>
            </div>
            {classesToday.length === 0 && upcoming.size === 0 ? (
              <p style={{ ...cs, marginTop: 10 }}>今天沒有收費課,7 天內也沒有已報名的課。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                {classesToday.map((cl) => (
                  <div key={cl.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${c.lineSoft}`, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>今天 {cl.name}</span>
                    <span style={{ ...num, color: c.muted }}>{fmtAt(cl.scheduled_at)}{cl.capacity ? ` · 名額 ${cl.capacity}` : ''}</span>
                  </div>
                ))}
                {[...upcoming.entries()].slice(0, 4).map(([id, u]) => (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: `1px solid ${c.lineSoft}`, fontSize: 12.5 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                    <span style={{ ...num, color: c.muted, whiteSpace: 'nowrap' }}>{fmtAt(u.at)} · 報名 {u.confirmed}{u.capacity ? `/${u.capacity}` : ''}{u.waitlist ? ` · 候補 ${u.waitlist}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, background: color, borderRadius: 2, marginRight: 5 }} />;
}
