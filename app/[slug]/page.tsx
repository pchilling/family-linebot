import { notFound } from 'next/navigation';
import { getActiveProducts, getTenantPublic } from '@/lib/supabase';

type Props = {
  params: Promise<{ slug: string }>;
};

// ISR:tenant brand / 商品 列表變動不頻繁,cache 30s。第二位訪客拿 CDN 快取 → 飛快。
// admin 改動會 revalidatePath 推送,不會看到太舊資料。
export const revalidate = 30;

export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const products = await getActiveProducts(tenant.id);

  // Hero banner(用 og_image_url,1200×630 — 同時作 OG 分享圖)
  const heroBanner = tenant.og_image_url;

  if (products.length === 0) {
    return (
      <>
        {heroBanner && <HeroBanner src={heroBanner} alt={tenant.name} />}
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
      </>
    );
  }

  return (
    <>
      {heroBanner && <HeroBanner src={heroBanner} alt={tenant.name} />}
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
    </>
  );
}

function HeroBanner({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        width: '100%',
        aspectRatio: '1200 / 630',
        objectFit: 'cover',
        borderRadius: 10,
        display: 'block',
        marginBottom: '2rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    />
  );
}
