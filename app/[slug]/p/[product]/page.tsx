import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug, getTenantPublic } from '@/lib/supabase';
import { VariantSelector } from './variant-selector';

type Props = {
  params: Promise<{ slug: string; product: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, product } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) return { title: '商品不存在' };
  const item = await getProductBySlug(tenant.id, product);
  if (!item) return { title: '商品不存在' };
  return {
    title: `${item.name} - ${tenant.name}`,
    description: item.description ?? item.name,
    openGraph: item.image_url
      ? { title: item.name, images: [{ url: item.image_url }] }
      : { title: item.name },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, product } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const item = await getProductBySlug(tenant.id, product);
  if (!item) notFound();

  // schema.org Product JSON-LD(Google rich result)— 沒 active variant 時不放 offers
  const activeVariants = item.variants;
  const prices = activeVariants.map((v) => v.price_twd);
  const anyInStock = activeVariants.some((v) => v.stock > 0);
  const structuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    brand: { '@type': 'Brand', name: tenant.name },
  };
  if (item.description) structuredData.description = item.description;
  if (item.image_url) structuredData.image = item.image_url;
  if (activeVariants.length === 1) {
    structuredData.offers = {
      '@type': 'Offer',
      priceCurrency: 'TWD',
      price: prices[0],
      availability: anyInStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    };
  } else if (activeVariants.length > 1) {
    structuredData.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'TWD',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: activeVariants.length,
      availability: anyInStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    };
  }

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <a
        href={`/${slug}`}
        style={{
          display: 'inline-block',
          marginBottom: '1.5rem',
          color: '#6b7280',
          textDecoration: 'none',
          fontSize: '0.875rem',
        }}
      >
        ← 回攤位
      </a>
      <article
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '2.5rem',
          alignItems: 'start',
        }}
      >
        <div>
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              style={{ width: '100%', borderRadius: 8, display: 'block' }}
            />
          ) : (
            <div
              style={{
                aspectRatio: '1',
                background: '#f3f4f6',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
              }}
            >
              無圖
            </div>
          )}
        </div>
        <div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', lineHeight: 1.3 }}>
            {item.name}
          </h2>
          {item.category && (
            <div
              style={{
                color: '#9ca3af',
                fontSize: '0.8125rem',
                marginBottom: '1rem',
              }}
            >
              {item.category}
            </div>
          )}
          {item.description && (
            <p
              style={{
                color: '#374151',
                lineHeight: 1.6,
                marginBottom: '1.5rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {item.description}
            </p>
          )}
          {item.variants.length > 0 ? (
            <VariantSelector
              variants={item.variants}
              tenantSlug={slug}
              productId={item.id}
              productSlug={item.slug}
              productName={item.name}
              productImageUrl={item.image_url}
            />
          ) : (
            <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
              無可選規格
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
