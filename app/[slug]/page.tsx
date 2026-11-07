import { notFound } from 'next/navigation';
import { BannerHero } from './banner-hero';
import { ShopListing } from './shop-listing';
import { buildListing } from './shop-listing-data';
import { getActiveProducts, getTenantPublic } from '@/lib/supabase';
import { IconPackage } from '@/lib/icons';

type Props = {
  params: Promise<{ slug: string }>;
};

// ISR:tenant brand / 商品 列表變動不頻繁,cache 30s。第二位訪客拿 CDN 快取 → 飛快。
// admin 改動會 revalidatePath 推送,不會看到太舊資料。
export const revalidate = 30;

/**
 * 攤位首頁 = 商品列表(Phase 24,2026-10-23 改版):
 * 篩選、排序、搜尋都在前端的 ShopListing 做,這裡負責把商品、規格、分階、分類順序一次備好。
 * Phase 35(2026-11-07):只列攤位商品(channel='stall');團購商品在 /groupbuy 分頁。
 * 組裝邏輯抽到 shop-listing-data.ts 的 buildListing,跟團購分頁共用。
 */
export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const allProducts = await getActiveProducts(tenant.id, 'stall');
  const { listing, categories } = await buildListing(tenant, allProducts);

  // Hero banner — Phase 9.8 multi-media,fallback 舊 og_image_url
  const banners = tenant.banners.length > 0
    ? tenant.banners
    : tenant.og_image_url
      ? [{ type: 'image' as const, url: tenant.og_image_url }]
      : [];

  return (
    <>
      {banners.length > 0 && (
        <div className="ui-enter" style={{ marginBottom: '2.5rem' }}>
          <BannerHero banners={banners} tenantName={tenant.name} />
        </div>
      )}

      {allProducts.length === 0 ? (
        <div className="ui-card" style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--ui-muted)' }}>
          <div style={{ marginBottom: 16, color: '#d4d4d8' }}><IconPackage size={44} /></div>
          <p style={{ fontSize: '1.125rem', margin: 0, fontWeight: 500, color: 'var(--ui-ink)' }}>攤位準備中</p>
          <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 0', color: 'var(--ui-faint)' }}>商品即將上架,敬請期待</p>
        </div>
      ) : (
        <ShopListing slug={slug} products={listing} categories={categories} />
      )}
    </>
  );
}
