import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsForm } from './settings-form';
import { LogoUploader } from './logo-uploader';
import { BannerUploader } from './banner-uploader';

type TenantFull = {
  id: string;
  name: string;
  description: string | null;
  brand_color: string | null;
  og_image_url: string | null;
  logo_url: string | null;
  contact_info: string | null;
  payment_info: string | null;
  plan: string;
  slug: string;
  order_prefix: string;
  features: Record<string, unknown> | null;
  status: string;
};

async function getTenantFull(slug: string): Promise<TenantFull | null> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, name, description, brand_color, og_image_url, logo_url, contact_info, payment_info, plan, slug, order_prefix, features, status',
    )
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

const meta: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7rem 1fr',
  gap: '8px 16px',
  fontSize: 14,
};
const metaKey: React.CSSProperties = { color: '#888' };

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantFull(slug);
  if (!tenant) notFound();

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 攤位設定</h1>

      <section style={section}>
        <h2 style={h2}>Logo</h2>
        <LogoUploader tenantSlug={tenant.slug} currentLogoUrl={tenant.logo_url} />
      </section>

      <section style={section}>
        <h2 style={h2}>Banner / 分享圖</h2>
        <BannerUploader
          tenantSlug={tenant.slug}
          currentBannerUrl={tenant.og_image_url}
        />
      </section>

      <section style={section}>
        <h2 style={h2}>品牌資訊</h2>
        <SettingsForm
          tenantSlug={tenant.slug}
          defaults={{
            name: tenant.name,
            description: tenant.description ?? '',
            brand_color: tenant.brand_color ?? '',
            og_image_url: tenant.og_image_url ?? '',
            contact_info: tenant.contact_info ?? '',
            payment_info: tenant.payment_info ?? '',
          }}
        />
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
