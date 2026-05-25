import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { createClass, deleteClass, updateClass } from '../../actions';
import { ProductImageUploader } from '../products/image-uploader';

type Region = { id: string; name: string };
type ClassRow = {
  id: string;
  region_id: string;
  regions: { name: string } | null;
  name: string;
  scheduled_at: string;
  instructor: string | null;
  is_paid: boolean;
  price_twd: number | null;
  duration_min: number | null;
  capacity: number | null;
  status: string;
  image_url: string | null;
};

async function getRegions(tenantId: string): Promise<Region[]> {
  const { data } = await supabaseAdmin
    .from('regions')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name');
  return (data ?? []) as Region[];
}

async function getClasses(tenantId: string): Promise<ClassRow[]> {
  const { data } = await supabaseAdmin
    .from('classes')
    .select(
      'id, region_id, regions(name), name, scheduled_at, instructor, is_paid, price_twd, duration_min, capacity, status, image_url',
    )
    .eq('tenant_id', tenantId)
    .order('scheduled_at');
  return (data ?? []) as unknown as ClassRow[];
}

type Stats = { confirmed: number; waitlist: number; attended: number };
async function getStats(tenantId: string, classIds: string[]): Promise<Map<string, Stats>> {
  const map = new Map<string, Stats>();
  if (classIds.length === 0) return map;
  const [resvResp, attResp] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('class_id, status')
      .eq('tenant_id', tenantId)
      .in('class_id', classIds),
    supabaseAdmin
      .from('attendances')
      .select('class_id')
      .eq('tenant_id', tenantId)
      .in('class_id', classIds),
  ]);
  const resvs = (resvResp.data as { class_id: string; status: string }[] | null) ?? [];
  const atts = (attResp.data as { class_id: string }[] | null) ?? [];
  for (const r of resvs) {
    const s = map.get(r.class_id) ?? { confirmed: 0, waitlist: 0, attended: 0 };
    if (r.status === 'confirmed') s.confirmed += 1;
    if (r.status === 'waitlist') s.waitlist += 1;
    map.set(r.class_id, s);
  }
  for (const a of atts) {
    const s = map.get(a.class_id) ?? { confirmed: 0, waitlist: 0, attended: 0 };
    s.attended += 1;
    map.set(a.class_id, s);
  }
  return map;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}T${String(tw.getUTCHours()).padStart(2, '0')}:${String(tw.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDate(iso: string): { day: string; month: string; weekday: string; time: string; full: string } {
  const d = new Date(iso);
  const day = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', day: 'numeric' });
  const month = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'short' });
  const weekday = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'narrow' });
  const time = d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
  const full = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return { day, month, weekday, time, full };
}

const c = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  borderSubtle: '#f4f4f5',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  textDisabled: '#a1a1aa',
  accent: '#18181b',
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  info: '#0070f3',
  infoBg: '#dbeafe',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: c.textMuted,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 12,
};
const label: React.CSSProperties = { fontSize: 12, color: c.textSec };
const labelText: React.CSSProperties = { display: 'block', marginBottom: 4 };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: `1px solid ${c.border}`,
  borderRadius: 5,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: c.card,
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px',
  background: c.accent,
  color: '#fff',
  border: 0,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  fontFamily: 'inherit',
};
const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: c.card,
  color: c.danger,
  border: `1px solid ${c.dangerBorder}`,
  cursor: 'pointer',
  fontSize: 12,
  borderRadius: 5,
  fontFamily: 'inherit',
};

export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const [regions, classes] = await Promise.all([getRegions(tenant.id), getClasses(tenant.id)]);
  const stats = await getStats(tenant.id, classes.map((c) => c.id));

  // 區分 今天/未來/過期
  const now = Date.now();
  const dayMs = 86400000;
  const today = classes.filter((c) => {
    const t = new Date(c.scheduled_at).getTime();
    return Math.abs(t - now) < dayMs && new Date(c.scheduled_at).toDateString() === new Date().toDateString();
  });
  const upcoming = classes.filter((c) => new Date(c.scheduled_at).getTime() > now && !today.includes(c));
  const past = classes.filter((c) => new Date(c.scheduled_at).getTime() < now && !today.includes(c)).reverse();

  const savedId = sp.saved;

  return (
    <main style={{ padding: '24px 20px', maxWidth: 1000, margin: '0 auto', color: c.text }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus, select:focus { outline: none; border-color: ${c.accent} !important; }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
details[open] .chev { transform: rotate(90deg); }
.chev { display: inline-block; transition: transform 150ms ease; }
.class-card { transition: border-color 0.15s, box-shadow 0.15s; }
.class-card:hover { border-color: ${c.textDisabled}; }
@keyframes fadein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
          `,
        }}
      />

      {savedId && (
        <div
          style={{
            padding: '10px 14px',
            background: c.successBg,
            border: `1px solid ${c.successBorder}`,
            color: c.success,
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 16,
            animation: 'fadein 0.25s ease',
          }}
        >
          ✓ 已儲存活動
        </div>
      )}

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>{tenant.name} · 活動管理</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>
          共 {classes.length} 個活動 · 今天 {today.length} · 未來 {upcoming.length} · 已結束 {past.length}
        </p>
      </header>

      {regions.length === 0 && (
        <div
          style={{
            padding: '10px 14px',
            background: c.dangerBg,
            border: `1px solid ${c.dangerBorder}`,
            color: c.danger,
            fontSize: 12,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          ⚠️ 此攤位沒有地點(regions),新增活動前要先 DB 加 regions 資料
        </div>
      )}

      {/* 新增活動 — 折疊 */}
      <details
        style={{
          background: c.card,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        <summary style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}>
          <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
          + 新增活動
          <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
            建立後可下載簽到 QR
          </span>
        </summary>
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${c.borderSubtle}` }}>
          <form action={createClass} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <label style={label}>
              <span style={labelText}>地點 *</span>
              <select name="region_id" required style={input}>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label style={label}><span style={labelText}>活動名稱 *</span><input name="name" required style={input} placeholder="例:芳療基礎工作坊" /></label>
            <label style={label}><span style={labelText}>時間 *</span><input name="scheduled_at" type="datetime-local" required style={input} /></label>
            <label style={label}><span style={labelText}>講師</span><input name="instructor" style={input} placeholder="王老師" /></label>
            <label style={label}><span style={labelText}>時長(分)</span><input name="duration_min" type="number" defaultValue={90} style={input} /></label>
            <label style={label}><span style={labelText}>價格(收費才填)</span><input name="price_twd" type="number" style={input} placeholder="例:500" /></label>
            <label style={{ ...label, gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, color: c.text }}>
              <input name="is_paid" type="checkbox" />
              收費課程
            </label>
            <button type="submit" style={{ ...btnPrimary, gridColumn: '1 / -1' }}>建立活動</button>
          </form>
        </div>
      </details>

      {/* Today */}
      {today.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>🔴 今天進行</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {today.map((cls) => (
              <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} accent="today" />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>未來活動({upcoming.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((cls) => (
              <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} />
            ))}
          </div>
        </section>
      )}

      {/* Past — 折疊 */}
      {past.length > 0 && (
        <details style={{ marginBottom: 24 }}>
          <summary style={{ ...sectionTitle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="chev" aria-hidden style={{ fontSize: 10 }}>▶</span>
            已結束 ({past.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {past.map((cls) => (
              <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} accent="past" />
            ))}
          </div>
        </details>
      )}

      {classes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem', background: c.card, border: `1px solid ${c.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>還沒有活動</p>
          <p style={{ margin: 0, fontSize: 12, color: c.textMuted }}>點上方「+ 新增活動」開始</p>
        </div>
      )}
    </main>
  );
}

function ClassCard({
  cls,
  tenant,
  regions,
  stats,
  savedId,
  accent,
}: {
  cls: ClassRow;
  tenant: { id: string; slug: string };
  regions: Region[];
  stats: Stats | undefined;
  savedId: string | undefined;
  accent?: 'today' | 'past';
}) {
  const isExpanded = cls.id === savedId;
  const dt = formatDate(cls.scheduled_at);
  const confirmed = stats?.confirmed ?? 0;
  const waitlist = stats?.waitlist ?? 0;
  const attended = stats?.attended ?? 0;
  const cap = cls.capacity;
  const isFull = cap !== null && confirmed >= cap;

  const borderColor = accent === 'today' ? c.danger : accent === 'past' ? c.borderSubtle : c.border;
  const opacity = accent === 'past' ? 0.7 : 1;

  return (
    <details
      open={isExpanded}
      className="class-card"
      style={{
        background: c.card,
        border: `1px solid ${borderColor}`,
        borderLeft: accent === 'today' ? `3px solid ${c.danger}` : `1px solid ${borderColor}`,
        borderRadius: 10,
        overflow: 'hidden',
        opacity,
      }}
    >
      <summary
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11, flexShrink: 0 }}>▶</span>

        {/* 日期區塊 */}
        <div
          style={{
            flexShrink: 0,
            width: 50,
            padding: '6px 0',
            background: '#fafafa',
            border: `1px solid ${c.borderSubtle}`,
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>{dt.month}</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, monospace', lineHeight: 1.1 }}>{dt.day}</div>
          <div style={{ fontSize: 9, color: c.textMuted }}>{dt.weekday}</div>
        </div>

        {/* Cover 縮圖 4:5 直式(有設才顯示)*/}
        {cls.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.image_url}
            alt={cls.name}
            style={{
              flexShrink: 0,
              width: 40,
              height: 50,
              objectFit: 'cover',
              borderRadius: 4,
              border: `1px solid ${c.borderSubtle}`,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{cls.name}</span>
            {cls.status === 'cancelled' && (
              <span style={{ padding: '1px 6px', background: c.dangerBg, color: c.danger, borderRadius: 3, fontSize: 10, fontWeight: 600 }}>已取消</span>
            )}
            {cls.is_paid && cls.price_twd && (
              <span style={{ fontSize: 11, color: c.textMuted, fontFamily: 'ui-monospace, monospace' }}>NT$ {cls.price_twd}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 4 }}>
            🕒 {dt.time}
            {cls.regions?.name && <> · 📍 {cls.regions.name}</>}
            {cls.instructor && <> · 👤 {cls.instructor}</>}
          </div>
          {/* 報名 / 簽到 stats */}
          <div style={{ display: 'flex', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
            <span style={{ color: isFull ? c.danger : c.success, fontWeight: 600 }}>
              📝 報名 {confirmed}{cap !== null && <>/{cap}</>}
            </span>
            {waitlist > 0 && (
              <span style={{ color: c.warning, fontWeight: 600 }}>⏳ 候補 {waitlist}</span>
            )}
            <span style={{ color: c.info, fontWeight: 600 }}>✓ 簽到 {attended}</span>
            {isFull && <span style={{ color: c.danger, fontWeight: 600 }}>🔴 已滿</span>}
          </div>
        </div>

        {/* 突出 QR 按鈕在 summary 右側 */}
        <a
          href={`/admin/${tenant.slug}/classes/${cls.id}/qr`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '7px 12px',
            background: c.info,
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          📱 QR
        </a>
      </summary>

      <div style={{ borderTop: `1px solid ${c.borderSubtle}`, padding: '16px 18px', background: '#fafafa' }}>
        {/* Cover 圖上傳器 — 16:9 — 顯示在 LIFF / Rich Menu Flex / admin */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: c.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            活動 cover 圖 · 16:9
          </div>
          <ProductImageUploader
            entity="class"
            entityId={cls.id}
            tenantSlug={tenant.slug}
            currentImageUrl={cls.image_url}
            productName={cls.name}
          />
        </div>

        <form action={updateClass} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <input type="hidden" name="id" value={cls.id} />
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <label style={label}>
            <span style={labelText}>地點</span>
            <select name="region_id" defaultValue={cls.region_id} style={input}>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label style={label}><span style={labelText}>名稱</span><input name="name" defaultValue={cls.name} style={input} /></label>
          <label style={label}><span style={labelText}>時間</span><input name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(cls.scheduled_at)} style={input} /></label>
          <label style={label}><span style={labelText}>講師</span><input name="instructor" defaultValue={cls.instructor ?? ''} style={input} /></label>
          <label style={label}><span style={labelText}>價格</span><input name="price_twd" type="number" defaultValue={cls.price_twd ?? ''} style={input} /></label>
          <label style={{ ...label, alignSelf: 'end', display: 'flex', alignItems: 'center', gap: 6, color: c.text }}>
            <input name="is_paid" type="checkbox" defaultChecked={cls.is_paid} />
            收費
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <a
              href={`/admin/${tenant.slug}/attendances?class_id=${cls.id}`}
              style={{
                padding: '8px 14px',
                background: c.card,
                color: c.textSec,
                border: `1px solid ${c.border}`,
                borderRadius: 6,
                fontSize: 12,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              看出席紀錄 →
            </a>
            <button type="submit" style={btnPrimary}>儲存</button>
          </div>
        </form>

        <details style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${c.border}` }}>
          <summary style={{ fontSize: 11, color: c.danger, fontWeight: 500, padding: '2px 0' }}>
            <span className="chev" aria-hidden style={{ marginRight: 4 }}>▶</span>
            危險區
          </summary>
          <div style={{ marginTop: 8, padding: 10, background: c.dangerBg, border: `1px solid ${c.dangerBorder}`, borderRadius: 5 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: c.danger }}>
              刪除活動同時會帶走報名 + 出席紀錄,無法復原。
            </p>
            <form action={deleteClass} style={{ display: 'inline' }}>
              <input type="hidden" name="id" value={cls.id} />
              <input type="hidden" name="tenant_slug" value={tenant.slug} />
              <button type="submit" style={btnDanger}>確認刪除</button>
            </form>
          </div>
        </details>
      </div>
    </details>
  );
}
