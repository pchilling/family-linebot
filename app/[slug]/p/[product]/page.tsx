import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug, getProductTiers, getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { Stars } from '@/lib/ui';
import { getGiftRulesPublic, getShippingOptions, isEcpayAvailable, isLinePayAvailable } from '../../checkout/actions';
import { VariantSelector } from './variant-selector';

type ReviewRow = { rating: number; comment: string | null; display_name: string | null; created_at: string };

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

const money = (n: number) => n.toLocaleString('en-US');

const PAGE_CSS = `
.pdp-crumb{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ui-muted);padding:0 0 20px;flex-wrap:wrap}
.pdp-crumb a{color:var(--ui-muted);text-decoration:none}.pdp-crumb a:hover{color:var(--ui-ink)}
.pdp-crumb .sep{color:#d4d4d8}
.pdp-crumb .cur{color:var(--ui-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60vw}
.pdp-desc{margin-top:56px;max-width:720px}
.pdp-desc h2{font-size:16px;font-weight:600;margin:0 0 12px;letter-spacing:-.01em}
.pdp-desc p{margin:0;font-size:14px;line-height:1.8;color:#3f3f46;white-space:pre-wrap}
@media (max-width:1024px){.pdp-desc{margin-top:36px}.pdp-bottom{padding-bottom:72px}}
`;

/**
 * 商品詳情頁(2026-10-23 改版,照 Phase 24 原型):麵包屑 → 左圖右文(client) → 商品說明 → 評價。
 * 配送 / 付款 / 滿額贈三行小字照攤位設定算好傳給 client。
 */
export default async function ProductDetailPage({ params }: Props) {
  const { slug, product } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const item = await getProductBySlug(tenant.id, product);
  if (!item) notFound();
  const [tiers, reviewsResp, shipOptions, giftCfg, ecpayOn, linePayOn] = await Promise.all([
    getProductTiers(item.id),
    // Phase 25:顯示中的評價,新到舊,最多 50 則
    supabaseAdmin
      .from('product_reviews')
      .select('rating, comment, display_name, created_at')
      .eq('product_id', item.id)
      .eq('status', 'visible')
      .order('created_at', { ascending: false })
      .limit(50),
    getShippingOptions(slug).catch(() => []),
    getGiftRulesPublic(slug).catch(() => ({ mode: 'stack' as const, rules: [] })),
    isEcpayAvailable(slug).catch(() => false),
    isLinePayAvailable(slug).catch(() => false),
  ]);
  const reviews = ((reviewsResp.data as ReviewRow[] | null) ?? []);
  const reviewCount = reviews.length;
  const reviewAvg = reviewCount ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10 : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));

  // 右欄三行小字
  const delivery = shipOptions.find((o) => o.key !== 'pickup' && o.free_over) ?? shipOptions.find((o) => o.key !== 'pickup');
  const hasPickup = shipOptions.some((o) => o.key === 'pickup');
  const shippingNote = delivery
    ? `${delivery.free_over ? `${delivery.label}滿 NT$ ${money(delivery.free_over)} 免運` : `${delivery.label} NT$ ${money(delivery.fee)}`}${hasPickup ? ',也可門市自取' : ''}`
    : hasPickup
      ? '門市自取'
      : null;
  const payParts = [ecpayOn ? '信用卡' : null, linePayOn ? 'LINE Pay' : null].filter(Boolean);
  const paymentNote = payParts.length > 0 ? `${payParts.join('、')} 線上付款,或匯款至店家帳戶` : '匯款至店家帳戶';
  const lowestGift = [...giftCfg.rules].sort((a, b) => a.threshold_twd - b.threshold_twd)[0];
  const giftNote = lowestGift ? `單筆滿 NT$ ${money(lowestGift.threshold_twd)} 送 ${lowestGift.product_name}${lowestGift.qty > 1 ? ` ×${lowestGift.qty}` : ''}` : null;

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
  if (reviewCount > 0) {
    structuredData.aggregateRating = { '@type': 'AggregateRating', ratingValue: reviewAvg, reviewCount, bestRating: 5, worstRating: 1 };
  }
  if (activeVariants.length === 1) {
    structuredData.offers = {
      '@type': 'Offer',
      priceCurrency: 'TWD',
      price: prices[0],
      availability: anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    };
  } else if (activeVariants.length > 1) {
    structuredData.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'TWD',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: activeVariants.length,
      availability: anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    };
  }

  return (
    <div className="pdp-bottom ui-enter">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <nav className="pdp-crumb" aria-label="路徑">
        <a href={`/${slug}`}>商品</a>
        {item.category && (
          <>
            <span className="sep">/</span>
            <a href={`/${slug}?cat=${encodeURIComponent(item.category)}`}>{item.category}</a>
          </>
        )}
        <span className="sep">/</span>
        <span className="cur">{item.name}</span>
      </nav>

      <VariantSelector
        variants={item.variants}
        tenantSlug={slug}
        productId={item.id}
        productSlug={item.slug}
        productName={item.name}
        productCategory={item.category}
        productImageUrl={item.image_url}
        productMedia={item.media}
        tiers={tiers.map((t) => ({ min_qty: t.min_qty, price_twd: t.price_twd }))}
        sale={
          item.sale_discount_pct !== null && item.sale_start_at && item.sale_end_at
            ? { discountPct: item.sale_discount_pct, startAt: item.sale_start_at, endAt: item.sale_end_at }
            : null
        }
        rating={reviewCount > 0 ? { avg: reviewAvg, count: reviewCount } : null}
        notes={{ shipping: shippingNote, payment: paymentNote, gift: giftNote }}
      />

      {item.description && (
        <section className="pdp-desc" aria-labelledby="desc-h">
          <h2 id="desc-h">商品說明</h2>
          <p>{item.description}</p>
        </section>
      )}

      {/* Phase 25(2026-10-23):商品評價 — 只放客人真的給的,沒有就老實說沒有 */}
      <section id="reviews" aria-labelledby="reviews-h" style={{ marginTop: '3rem', maxWidth: 720, scrollMarginTop: 80 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h2 id="reviews-h" style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>商品評價</h2>
          {reviewCount > 0 && <span className="ui-muted ui-num" style={{ fontSize: 13 }}>{reviewCount} 則</span>}
        </div>
        {reviewCount === 0 ? (
          <div className="ui-card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ui-muted)', fontSize: 14, lineHeight: 1.7 }}>
            還沒有評價。買過的客人會在收到商品後收到評價邀請,第一則評價就會出現在這裡。
          </div>
        ) : (
          <>
            <div className="ui-card" style={{ padding: '1.25rem', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 96 }}>
                <span className="ui-num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, letterSpacing: '-.02em' }}>{reviewAvg.toFixed(1)}</span>
                <Stars value={reviewAvg} size={16} />
                <span className="ui-muted ui-num" style={{ fontSize: 12 }}>{reviewCount} 則評價</span>
              </div>
              <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dist.map((d) => (
                  <div key={d.n} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 32px', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ui-muted)' }}>
                    <span className="ui-num">{d.n} 星</span>
                    <span style={{ height: 8, borderRadius: 999, background: 'var(--ui-line-soft)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(d.count / reviewCount) * 100}%`, background: '#f59e0b', borderRadius: 999 }} />
                    </span>
                    <span className="ui-num" style={{ textAlign: 'right' }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              {reviews.map((r, i) => (
                <li key={i} style={{ padding: '14px 0', borderTop: i === 0 ? 0 : '1px solid var(--ui-line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <Stars value={r.rating} size={13} />
                    <span style={{ fontWeight: 500 }}>{r.display_name || '匿名'}</span>
                    <span className="ui-muted ui-num">{new Date(r.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' })}</span>
                  </div>
                  {r.comment && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#3f3f46', whiteSpace: 'pre-wrap' }}>{r.comment}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
