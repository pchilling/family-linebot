import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { createClass, deleteClass, updateClass } from '../../actions';

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
      'id, region_id, regions(name), name, scheduled_at, instructor, is_paid, price_twd, duration_min',
    )
    .eq('tenant_id', tenantId)
    .order('scheduled_at');
  return (data ?? []) as unknown as ClassRow[];
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const Y = tw.getUTCFullYear();
  const M = String(tw.getUTCMonth() + 1).padStart(2, '0');
  const D = String(tw.getUTCDate()).padStart(2, '0');
  const h = String(tw.getUTCHours()).padStart(2, '0');
  const m = String(tw.getUTCMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D}T${h}:${m}`;
}

const section: React.CSSProperties = { marginBottom: 32, padding: 16, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' };
const h2: React.CSSProperties = { fontSize: 16, marginBottom: 12 };
const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const label: React.CSSProperties = { fontSize: 13 };
const labelText: React.CSSProperties = { display: 'block', marginBottom: 4, color: '#444' };
const input: React.CSSProperties = { width: '100%', padding: 6, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: 10, background: '#000', color: '#fff', border: 0, cursor: 'pointer', fontSize: 14, borderRadius: 4 };
const btnDanger: React.CSSProperties = { padding: '6px 12px', background: 'none', color: '#d00', border: '1px solid #d00', cursor: 'pointer', fontSize: 12, borderRadius: 4 };
const listItem: React.CSSProperties = { padding: 14, border: '1px solid #e5e5e5', marginBottom: 10, borderRadius: 6, background: '#fff' };

export default async function ClassesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const [regions, classes] = await Promise.all([getRegions(tenant.id), getClasses(tenant.id)]);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 本月課程管理</h1>

      <section style={section}>
        <h2 style={h2}>新增課程</h2>
        <form action={createClass} style={formGrid}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <label style={label}>
            <span style={labelText}>地點</span>
            <select name="region_id" required style={input}>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label style={label}><span style={labelText}>課程名稱</span><input name="name" required style={input} /></label>
          <label style={label}><span style={labelText}>時間</span><input name="scheduled_at" type="datetime-local" required style={input} /></label>
          <label style={label}><span style={labelText}>講師</span><input name="instructor" style={input} /></label>
          <label style={label}><span style={labelText}>時長(分)</span><input name="duration_min" type="number" defaultValue={90} style={input} /></label>
          <label style={label}><span style={labelText}>價格 TWD(收費才填)</span><input name="price_twd" type="number" style={input} /></label>
          <label style={{ ...label, gridColumn: '1 / -1' }}><input name="is_paid" type="checkbox" /> 收費課</label>
          <button type="submit" style={{ ...btn, gridColumn: '1 / -1' }}>新增</button>
        </form>
      </section>

      <section style={section}>
        <h2 style={h2}>現有課程 ({classes.length})</h2>
        {classes.length === 0 && <p style={{ color: '#666' }}>(尚無資料)</p>}
        {regions.length === 0 && <p style={{ color: '#d00', fontSize: 13 }}>⚠️ 此 tenant 沒有 regions(地點),新增課程前先在 DB 加 regions 表資料</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {classes.map((c) => (
            <li key={c.id} style={listItem}>
              <form action={updateClass} style={formGrid}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="tenant_id" value={tenant.id} />
                <input type="hidden" name="tenant_slug" value={tenant.slug} />
                <label style={label}>
                  <span style={labelText}>地點</span>
                  <select name="region_id" defaultValue={c.region_id} style={input}>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label style={label}><span style={labelText}>名稱</span><input name="name" defaultValue={c.name} style={input} /></label>
                <label style={label}><span style={labelText}>時間</span><input name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(c.scheduled_at)} style={input} /></label>
                <label style={label}><span style={labelText}>講師</span><input name="instructor" defaultValue={c.instructor ?? ''} style={input} /></label>
                <label style={label}><span style={labelText}>價格</span><input name="price_twd" type="number" defaultValue={c.price_twd ?? ''} style={input} /></label>
                <label style={{ ...label, alignSelf: 'end' }}><input name="is_paid" type="checkbox" defaultChecked={c.is_paid} /> 收費</label>
                <button type="submit" style={{ ...btn, gridColumn: '1 / 3' }}>儲存</button>
              </form>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={`/admin/${tenant.slug}/classes/${c.id}/qr`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 12px',
                    background: '#fff',
                    color: '#0070f3',
                    border: '1px solid #0070f3',
                    borderRadius: 4,
                    fontSize: 12,
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  📱 簽到 QR
                </a>
                <form action={deleteClass} style={{ display: 'inline' }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="tenant_slug" value={tenant.slug} />
                  <button type="submit" style={btnDanger}>刪除</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
