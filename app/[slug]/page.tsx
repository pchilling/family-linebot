import { notFound } from 'next/navigation';
import { getActiveProducts, getTenantPublic } from '@/lib/supabase';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const products = await getActiveProducts(tenant.id);

  if (products.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '5rem 1.5rem',
          color: '#6b7280',
        }}
      >
        <p style={{ fontSize: '1.125rem', margin: 0 }}>攤位準備中</p>
        <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 0', color: '#9ca3af' }}>
          商品即將上架,敬請期待
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {products.map((p) => (
        <a
          key={p.id}
          href={p.slug ? `/${slug}/p/${p.slug}` : '#'}
          style={{
            display: 'block',
            background: '#ffffff',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
        >
          {p.image_url ? (
            <img
              src={p.image_url}
              alt={p.name}
              style={{
                width: '100%',
                aspectRatio: '4 / 5',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '4 / 5',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: '0.875rem',
              }}
            >
              無圖
            </div>
          )}
          <div style={{ padding: '0.875rem 1rem 1rem' }}>
            <div style={{ fontWeight: 500, lineHeight: 1.4 }}>{p.name}</div>
            {p.min_price_twd > 0 && (
              <div
                style={{
                  marginTop: '0.375rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                NT$ {p.min_price_twd.toLocaleString()}
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
