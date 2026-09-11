import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { CartLink } from './cart-state';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) return { title: '攤位不存在' };
  return {
    title: tenant.name,
    description: tenant.description ?? `${tenant.name} 線上攤位`,
    openGraph: tenant.og_image_url
      ? { title: tenant.name, images: [{ url: tenant.og_image_url }] }
      : { title: tenant.name },
  };
}

export default async function TenantLayout({ children, params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  // 2026-09-11(回饋 #13):footer 顯示攤位對外聯絡資訊(getTenantPublic 沒帶,另撈)
  const { data: extraRow } = await supabaseAdmin
    .from('tenants')
    .select('contact_info')
    .eq('slug', slug)
    .maybeSingle();
  const contactInfo = (extraRow as { contact_info: string | null } | null)?.contact_info ?? null;

  const brandColor = tenant.brand_color ?? '#1f2937';

  return (
    <div
      style={{
        minHeight: '100vh',
        // C#7(2026-09-02):攤位自訂商城底色,沒設維持淺灰
        background: tenant.shop_bg_color ?? '#fafafa',
        color: '#111827',
      }}
    >
      {/* 2026-09-11(reactbits 改版):hero 文字進場動畫 keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes hero-char { from { opacity: 0; transform: translateY(8px); filter: blur(6px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
@keyframes hero-fade { from { opacity: 0; filter: blur(4px); } to { opacity: 1; filter: blur(0); } }
          `,
        }}
      />
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          // Phase 15.1(2026-09-05):頂部列底色可自訂,沒設維持白色
          background: tenant.header_bg_color ?? '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <a
              href={`/${slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                color: brandColor,
                textDecoration: 'none',
                minWidth: 0,
              }}
            >
              {tenant.logo_url && (
                <img
                  src={tenant.logo_url}
                  alt=""
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    flexShrink: 0,
                  }}
                />
              )}
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  color: brandColor,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {/* 2026-09-11(reactbits Split Text 改版):店名逐字浮現(只在整頁載入時播一次) */}
                {tenant.name.split('').map((ch, i) => (
                  <span
                    key={`${ch}-${i}`}
                    style={{
                      display: 'inline-block',
                      whiteSpace: 'pre',
                      animation: 'hero-char 0.45s ease both',
                      animationDelay: `${i * 45}ms`,
                    }}
                  >
                    {ch}
                  </span>
                ))}
              </h1>
            </a>
            <CartLink tenantSlug={slug} />
          </div>
          {tenant.description && (
            <p
              style={{
                margin: '0.375rem 0 0',
                color: '#6b7280',
                fontSize: '0.875rem',
                lineHeight: 1.4,
                animation: 'hero-fade 0.6s ease 0.35s both',
              }}
            >
              {tenant.description}
            </p>
          )}
        </div>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
      <footer
        style={{
          padding: '2rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
          background: '#ffffff',
          marginTop: '4rem',
        }}
      >
        {/* 2026-09-11(回饋 #13):對外聯絡資訊 */}
        {contactInfo && (
          <div
            style={{
              marginBottom: '1rem',
              color: '#6b7280',
              fontSize: '0.8125rem',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
            }}
          >
            {contactInfo}
          </div>
        )}
        {/* 法規連結(2026-09-08:查訂單併入此列,不再獨立一行 — 留給弄丟連結的網頁訪客) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.875rem',
            marginBottom: '0.75rem',
            fontSize: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <a href={`/${slug}/order-lookup`} style={{ color: '#9ca3af', textDecoration: 'none' }}>查訂單</a>
          <a href="/policy/terms" style={{ color: '#9ca3af', textDecoration: 'none' }}>服務條款</a>
          <a href="/policy/privacy" style={{ color: '#9ca3af', textDecoration: 'none' }}>隱私權</a>
          <a href="/policy/refund" style={{ color: '#9ca3af', textDecoration: 'none' }}>退款</a>
          <a href="/policy/shipping" style={{ color: '#9ca3af', textDecoration: 'none' }}>寄送</a>
        </div>
        <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>
          © {new Date().getFullYear()} {tenant.name}
        </div>
        <div
          style={{
            marginTop: '0.5rem',
            color: '#9ca3af',
            fontSize: '0.75rem',
            opacity: 0.75,
          }}
        >
          Made with <strong style={{ color: '#6b7280', letterSpacing: '0.08em' }}>NEOP STALL</strong>
        </div>
      </footer>
    </div>
  );
}
