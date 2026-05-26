import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic } from '@/lib/supabase';
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

  const brandColor = tenant.brand_color ?? '#1f2937';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        color: '#111827',
      }}
    >
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
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
                {tenant.name}
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
        <div style={{ marginBottom: '0.5rem' }}>
          <a
            href={`/${slug}/order-lookup`}
            style={{ color: '#6b7280', fontSize: '0.8125rem', textDecoration: 'none' }}
          >
            查我的訂單 →
          </a>
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
