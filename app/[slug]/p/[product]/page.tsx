import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug, getTenantPublic } from '@/lib/supabase';
import { VariantSelector } from './variant-selector';

type Props = {
  params: Promise<{ slug: string; product: string }>;
};

// ISR:商品 / variant 改動不頻繁,cache 60s
export const revalidate = 60;

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
      {/* 整個 product detail 在 VariantSelector 內(client),含圖 / 名 / 描述 / 選擇器 / cart。
          單欄佈局(行動裝置友善),變體切換時圖會同步換。
          server page 只負責 SEO(JSON-LD 已在上面) + 回攤位 link。 */}
      <VariantSelector
        variants={item.variants}
        tenantSlug={slug}
        productId={item.id}
        productSlug={item.slug}
        productName={item.name}
        productCategory={item.category}
        productDescription={item.description}
        productImageUrl={item.image_url}
      />
    </div>
  );
}
