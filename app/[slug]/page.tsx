import { notFound } from 'next/navigation';
import { BannerHero } from './banner-hero';
import { ShopListing, type ListingProduct } from './shop-listing';
import { getActiveProducts, getTenantPublic, isSaleActive, supabaseAdmin, type MediaItem } from '@/lib/supabase';
import { IconPackage } from '@/lib/icons';

// Phase 16.2(2026-09-18):同分類內照後台拖曳的手動排序(null = 沒排過,排最後再照筆劃)
function bySortOrder(
  a: { sort_order: number | null; name: string },
  b: { sort_order: number | null; name: string },
): number {
  return (
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name, 'zh-Hant')
  );
}

type Props = {
  params: Promise<{ slug: string }>;
};

// ISR:tenant brand / 商品 列表變動不頻繁,cache 30s。第二位訪客拿 CDN 快取 → 飛快。
// admin 改動會 revalidatePath 推送,不會看到太舊資料。
export const revalidate = 30;

type VariantLite = {
  id: string;
  product_id: string;
  variant_name: string;
  price_twd: number;
  stock: number;
  image_url: string | null;
  sort_order: number | null;
  created_at: string;
};

/**
 * 攤位首頁 = 商品列表(Phase 24,2026-10-23 改版):
 * 篩選、排序、搜尋都在前端的 ShopListing 做,這裡負責把商品、規格、分階、分類順序一次備好。
 */
export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const [allProducts, variantsResp, tiersResp] = await Promise.all([
    getActiveProducts(tenant.id),
    supabaseAdmin
      .from('product_variants')
      .select('id, product_id, variant_name, price_twd, stock, image_url, sort_order, created_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active'),
    supabaseAdmin
      .from('product_price_tiers')
      .select('product_id, min_qty, price_twd')
      .eq('tenant_id', tenant.id)
      .order('min_qty', { ascending: true }),
  ]);

  const variantsByProduct = new Map<string, VariantLite[]>();
  for (const v of ((variantsResp.data as VariantLite[] | null) ?? [])) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }
  // 2026-09-11(回饋 #9):卡片顯示分階提示,每商品取最低門檻那條
  const firstTierByProduct = new Map<string, { min_qty: number; price_twd: number }>();
  for (const t of ((tiersResp.data as { product_id: string; min_qty: number; price_twd: number }[] | null) ?? [])) {
    if (!firstTierByProduct.has(t.product_id)) firstTierByProduct.set(t.product_id, t);
  }

  // C#8(2026-09-02):tenant.category_order 有列的照設定順序,沒列的照筆劃排後面
  const found = [...new Set(allProducts.map((p) => p.category).filter((c): c is string => !!c))];
  const categories = [
    ...tenant.category_order.filter((c) => found.includes(c)),
    ...found.filter((c) => !tenant.category_order.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ];
  if (allProducts.some((p) => !p.category)) categories.push('其他');

  // 「精選排序」:特價優先 → 有角標次之(同文字聚成一群,群序 = 群內最小 sort_order)→ 其餘照分類設定順序分組
  const now = new Date();
  const badgeRank = new Map<string, number>();
  for (const p of allProducts) {
    if (!p.badge) continue;
    const r = p.sort_order ?? Number.MAX_SAFE_INTEGER;
    const cur = badgeRank.get(p.badge);
    if (cur === undefined || r < cur) badgeRank.set(p.badge, r);
  }
  const featured = [...allProducts].sort((a, b) => {
    const pa = isSaleActive(a, now) ? 0 : a.badge ? 1 : 2;
    const pb = isSaleActive(b, now) ? 0 : b.badge ? 1 : 2;
    if (pa !== pb) return pa - pb;
    if (pa === 1) {
      const ga = badgeRank.get(a.badge!) ?? Number.MAX_SAFE_INTEGER;
      const gb = badgeRank.get(b.badge!) ?? Number.MAX_SAFE_INTEGER;
      if (ga !== gb) return ga - gb;
      if (a.badge !== b.badge) return a.badge!.localeCompare(b.badge!, 'zh-Hant');
      return bySortOrder(a, b);
    }
    const ia = a.category ? categories.indexOf(a.category) : categories.length;
    const ib = b.category ? categories.indexOf(b.category) : categories.length;
    if (ia !== ib) return ia - ib;
    return bySortOrder(a, b);
  });
  const rankOf = new Map(featured.map((p, i) => [p.id, i]));

  const listing: ListingProduct[] = allProducts.map((p) => {
    const vs = [...(variantsByProduct.get(p.id) ?? [])].sort(
      (a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER),
    );
    const prices = vs.map((v) => v.price_twd);
    const firstImage = (p.media ?? []).find((m) => m.type === 'image') as (MediaItem & { fit?: 'cover' | 'contain' }) | undefined;
    const tier = firstTierByProduct.get(p.id);
    const single = vs.length === 1 ? vs[0] : null;
    const earliest = vs.reduce((acc, v) => (acc && acc < v.created_at ? acc : v.created_at), '' as string);
    return {
      id: p.id,
      slug: p.slug ?? p.id,
      name: p.name,
      category: p.category ?? '其他',
      image: firstImage?.url ?? p.image_url ?? null,
      fit: firstImage?.fit === 'contain' ? 'contain' : 'cover',
      badge: p.badge,
      badgeColor: p.badge_color,
      saleActive: isSaleActive(p, now),
      salePct: p.sale_discount_pct ?? 0,
      lo: prices.length ? Math.min(...prices) : 0,
      hi: prices.length ? Math.max(...prices) : 0,
      stock: vs.reduce((s, v) => s + (v.stock ?? 0), 0),
      variantCount: vs.length,
      single: single ? { id: single.id, name: single.variant_name, price: single.price_twd, image: single.image_url } : null,
      tierHint: tier ? `${tier.min_qty} 件起 NT$ ${tier.price_twd.toLocaleString()}/件` : null,
      createdAt: earliest || '',
      rank: rankOf.get(p.id) ?? Number.MAX_SAFE_INTEGER,
    };
  });

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
