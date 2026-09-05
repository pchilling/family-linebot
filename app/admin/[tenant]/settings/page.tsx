import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsForm } from './settings-form';
import { LogoUploader } from './logo-uploader';
import { BannerUploader } from './banner-uploader';
import { BannerManager } from './banner-manager';

type BannerItem = { type: 'image' | 'video'; url: string };

type TenantFull = {
  id: string;
  name: string;
  description: string | null;
  brand_color: string | null;
  shop_bg_color: string | null;
  header_bg_color: string | null;
  og_image_url: string | null;
  logo_url: string | null;
  banners: BannerItem[] | null;
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
      'id, name, description, brand_color, shop_bg_color, header_bg_color, og_image_url, logo_url, banners, contact_info, payment_info, plan, slug, order_prefix, features, status',
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

      {/* 2026-09-05 版面重整:文字/顏色設定最上,圖片素材集中一區,系統資訊最後 */}
      <section style={section}>
        <h2 style={h2}>品牌設定</h2>
        <SettingsForm
          tenantSlug={tenant.slug}
          defaults={{
            name: tenant.name,
            description: tenant.description ?? '',
            brand_color: tenant.brand_color ?? '',
            shop_bg_color: tenant.shop_bg_color ?? '',
            header_bg_color: tenant.header_bg_color ?? '',
            contact_info: tenant.contact_info ?? '',
            payment_info: tenant.payment_info ?? '',
          }}
        />
      </section>

      <section style={section}>
        <h2 style={h2}>🖼 圖片素材</h2>

        <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#444' }}>Logo</h3>
        <LogoUploader tenantSlug={tenant.slug} currentLogoUrl={tenant.logo_url} />

        <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '20px 0' }} />

        <h3 style={{ fontSize: 13, margin: '0 0 6px', color: '#444' }}>
          公開頁 Banner(多圖 / 影片 / YouTube 輪播)
        </h3>
        <p style={{ fontSize: 11, color: '#71717a', margin: '0 0 10px', lineHeight: 1.5 }}>
          建議尺寸 <strong>1200 × 630</strong>(寬:高 ≈ 1.9:1)。影片同比例。
          首格 = 公開頁 hero 開頭。↑↓ 排序、上傳圖 / 影片、貼 YouTube URL。
        </p>
        <BannerManager
          tenantSlug={tenant.slug}
          banners={tenant.banners ?? []}
          legacyOgImageUrl={tenant.og_image_url}
        />

        <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '20px 0' }} />

        <h3 style={{ fontSize: 13, margin: '0 0 6px', color: '#444' }}>連結分享預覽圖</h3>
        <p style={{ fontSize: 11, color: '#71717a', margin: '0 0 10px', lineHeight: 1.5 }}>
          把攤位網址貼到 WhatsApp / LINE / FB / IG 訊息時,對方看到的那張小縮圖。
          建議 <strong>1200 × 630</strong>。社交平台只接 1 張圖(不能影片或輪播)。
        </p>
        <BannerUploader
          tenantSlug={tenant.slug}
          currentBannerUrl={tenant.og_image_url}
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
