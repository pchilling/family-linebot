import type { ListingProduct } from './shop-listing';
import { isSaleActive, supabaseAdmin, type MediaItem, type ProductPublic, type TenantPublic } from '@/lib/supabase';

/**
 * 商品列表的資料組裝(Phase 35,2026-11-07 從 app/[slug]/page.tsx 抽出來):
 * 攤位首頁與團購分頁都要「商品 + 規格 + 分階 + 評價 → ListingProduct[] 與分類順序」,
 * 抽成一支共用,兩頁的卡片才會長得一樣。邏輯跟抽出前的首頁完全相同。
 * (page.tsx 不能多 export 非頁面的東西,所以放獨立檔)
 */

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

export async function buildListing(
  tenant: TenantPublic,
  allProducts: ProductPublic[],
): Promise<{ listing: ListingProduct[]; categories: string[] }> {
  const [variantsResp, tiersResp, reviewsResp] = await Promise.all([
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
    // Phase 25:評價星等(只算顯示中的),在程式裡彙總,量小不用另開 view
    supabaseAdmin
      .from('product_reviews')
      .select('product_id, rating')
      .eq('tenant_id', tenant.id)
      .eq('status', 'visible'),
  ]);
  const ratingAgg = new Map<string, { sum: number; count: number }>();
  for (const r of ((reviewsResp.data as { product_id: string; rating: number }[] | null) ?? [])) {
    const a = ratingAgg.get(r.product_id) ?? { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    ratingAgg.set(r.product_id, a);
  }

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
    const agg = ratingAgg.get(p.id);
    return {
      rating: agg ? { avg: Math.round((agg.sum / agg.count) * 10) / 10, count: agg.count } : null,
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
      // Phase 35:售完判定交給 ShopListing(trackStock=false 一律當有貨);加入購物車時帶 channel
      trackStock: p.track_stock,
      channel: p.channel,
    };
  });

  return { listing, categories };
}
