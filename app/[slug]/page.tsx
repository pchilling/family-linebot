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

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.product-card {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, border-color 0.2s;
}
.product-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: #d4d4d8;
}
.product-card:hover .product-img {
  transform: scale(1.04);
}
.product-img {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.hero-banner {
  animation: hero-fadein 0.5s ease;
}
@keyframes hero-fadein {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
          `,
        }}
      />

      {heroBanner && (
        <div className="hero-banner" style={{ marginBottom: '2.5rem', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroBanner}
            alt={tenant.name}
            style={{
              width: '100%',
              aspectRatio: '1200 / 630',
              objectFit: 'cover',
              borderRadius: 12,
              display: 'block',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04)',
            }}
          />
        </div>
      )}

      {products.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4rem 1.5rem',
            color: '#71717a',
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>📦</div>
          <p style={{ fontSize: '1.125rem', margin: 0, fontWeight: 500, color: '#18181b' }}>
            攤位準備中
          </p>
          <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 0', color: '#a1a1aa' }}>
            商品即將上架,敬請期待
          </p>
        </div>
      ) : (
        <>
          {/* Section title */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#18181b', letterSpacing: '-0.01em' }}>
              所有商品
            </h2>
            <span style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>
              {products.length} 件
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {products.map((p) => (
              <a
                key={p.id}
                href={`/${slug}/p/${p.slug ?? p.id}`}
                className="product-card"
                style={{
                  display: 'block',
                  background: '#ffffff',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid #e4e4e7',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="product-img"
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        background: '#f4f4f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#a1a1aa',
                        fontSize: '0.875rem',
                      }}
                    >
                      無圖
                    </div>
                  )}
                </div>
                <div style={{ padding: '0.875rem 1rem 1.125rem' }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: '0.9375rem',
                      lineHeight: 1.4,
                      color: '#18181b',
                      letterSpacing: '-0.005em',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      minHeight: '2.625rem',
                    }}
                  >
                    {p.name}
                  </div>
                  {p.min_price_twd > 0 && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        color: '#18181b',
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        letterSpacing: '-0.01em',
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
      )}
    </>
  );
}
