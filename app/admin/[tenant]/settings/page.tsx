import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { updateTenantSettings } from './actions';

type TenantFull = {
  id: string;
  name: string;
  description: string | null;
  brand_color: string | null;
  og_image_url: string | null;
  contact_info: string | null;
  plan: string;
  slug: string;
  order_prefix: string;
  features: Record<string, unknown> | null;
  status: string;
};

async function getTenantFull(slug: string): Promise<TenantFull | null> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('id, name, description, brand_color, og_image_url, contact_info, plan, slug, order_prefix, features, status')
    .eq('slug', slug)
    .maybeSingle();
  return (data ?? null) as TenantFull | null;
}

const section: React.CSSProperties = {
  marginBottom: 28,
  padding: 20,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fff',
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 16, color: '#222' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', fontWeight: 500 };
const hint: React.CSSProperties = { fontSize: 12, color: '#888', marginTop: 2 };
const input: React.CSSProperties = {
  padding: 9,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const btn: React.CSSProperties = {
  padding: '10px 18px',
  background: '#000',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const meta: React.CSSProperties = { display: 'grid', gridTemplateColumns: '7rem 1fr', gap: '8px 16px', fontSize: 14 };
const metaKey: React.CSSProperties = { color: '#888' };

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantFull(slug);
  if (!tenant) notFound();

  const t = await getTenantBySlug(slug); // 給後續 link 用,確認名字
  if (!t) notFound();

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 攤位設定</h1>

      <section style={section}>
        <h2 style={h2}>品牌資訊</h2>
        <form action={updateTenantSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="tenant_slug" value={tenant.slug} />

          <label style={label}>
            <span style={labelText}>店名</span>
            <input
              name="name"
              defaultValue={tenant.name}
              required
              style={input}
              placeholder="例:Cyndi 童裝代購"
            />
          </label>

          <label style={label}>
            <span style={labelText}>簡介 / Tagline</span>
            <input
              name="description"
              defaultValue={tenant.description ?? ''}
              style={input}
              placeholder="會出現在公開網站 header 下方 + SEO 描述"
            />
            <span style={hint}>留空則公開頁不顯示</span>
          </label>

          <label style={label}>
            <span style={labelText}>主題色</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="color"
                name="brand_color"
                defaultValue={tenant.brand_color ?? '#1f2937'}
                style={{ width: 60, height: 38, padding: 2, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#666', fontFamily: 'monospace' }}>
                目前:{tenant.brand_color ?? '(未設,預設 #1f2937)'}
              </span>
            </div>
            <span style={hint}>店名顯示色 / 公開網站主色調</span>
          </label>

          <label style={label}>
            <span style={labelText}>分享圖網址(og:image)</span>
            <input
              name="og_image_url"
              defaultValue={tenant.og_image_url ?? ''}
              type="url"
              style={input}
              placeholder="https://..."
            />
            <span style={hint}>用於 LINE / IG / Threads 分享時的預覽圖。建議 1200×630</span>
          </label>

          <label style={label}>
            <span style={labelText}>對外聯絡資訊</span>
            <textarea
              name="contact_info"
              defaultValue={tenant.contact_info ?? ''}
              rows={4}
              style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
              placeholder={'LINE: @yourshop\n電話: 0900-000-000\nEmail: hello@yourshop.com\nIG: @yourshop'}
            />
            <span style={hint}>客人下單成立頁會看到這段,知道怎麼聯絡你匯款 / 對帳 / 詢問商品。多行 free text,你愛怎麼寫就怎麼寫</span>
          </label>

          <div>
            <button type="submit" style={btn}>儲存</button>
          </div>
        </form>
      </section>

      <section style={section}>
        <h2 style={h2}>系統資訊(不可改)</h2>
        <dl style={meta}>
          <dt style={metaKey}>Slug</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{tenant.slug}</dd>
          <dt style={metaKey}>方案</dt>
          <dd style={{ margin: 0 }}>{tenant.plan}</dd>
          <dt style={metaKey}>訂單編號 prefix</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{tenant.order_prefix}-YYYYMM-NNNN</dd>
          <dt style={metaKey}>狀態</dt>
          <dd style={{ margin: 0 }}>{tenant.status}</dd>
          <dt style={metaKey}>Features</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>
            {tenant.features && Object.keys(tenant.features).length > 0
              ? JSON.stringify(tenant.features)
              : '(空)'}
          </dd>
        </dl>
        <p style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 0 }}>
          升級方案 / 啟用 LINE Bot / LIFF / 改 slug 等請聯繫 NEO。
        </p>
      </section>
    </main>
  );
}
