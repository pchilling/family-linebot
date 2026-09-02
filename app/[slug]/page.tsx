import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BannerHero } from './banner-hero';
import { getActiveProducts, getTenantPublic, isSaleActive, applySaleDiscount } from '@/lib/supabase';

// % off → 台灣「折」講法(10% off → 9折;15% off → 85折)
function pctToZhe(pct: number): string {
  const keep = 100 - pct;
  return `${keep % 10 === 0 ? keep / 10 : keep}折`;
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ f?: string }>;
};

// ISR:tenant brand / 商品 列表變動不頻繁,cache 30s。第二位訪客拿 CDN 快取 → 飛快。
// admin 改動會 revalidatePath 推送,不會看到太舊資料。
export const revalidate = 30;

export default async function TenantHomePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { f } = await searchParams;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const allProducts = await getActiveProducts(tenant.id);

  // chip filter:全部 / 最新 / 各 category
  // C#8(2026-09-02):tenant.category_order 有列的照設定順序,沒列的照筆劃排後面
  const found = [...new Set(allProducts.map((p) => p.category).filter((c): c is string => !!c))];
  const categories = [
    ...tenant.category_order.filter((c) => found.includes(c)),
    ...found.filter((c) => !tenant.category_order.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ];
  const isCategory = !!f && categories.includes(f);
  const now = new Date();
  const hasSale = allProducts.some((p) => isSaleActive(p, now));

  let products = [...allProducts];
  if (f === 'latest') {
    // server query 已經 created_at desc,保留
  } else if (f === 'sale') {
    // 2026-09-03:「特價中」chip — 只列限時優惠生效中的商品
    products = allProducts.filter((p) => isSaleActive(p, now));
  } else if (isCategory) {
    products = allProducts
      .filter((p) => p.category === f)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  } else {
    // 全部 預設(2026-09-03):特價優先 → 有角標次之 → 其餘照分類設定順序分組
    products.sort((a, b) => {
      const pa = isSaleActive(a, now) ? 0 : a.badge ? 1 : 2;
      const pb = isSaleActive(b, now) ? 0 : b.badge ? 1 : 2;
      if (pa !== pb) return pa - pb;
      const ia = a.category ? categories.indexOf(a.category) : categories.length;
      const ib = b.category ? categories.indexOf(b.category) : categories.length;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
  }

  const activeKey = f === 'latest' || f === 'sale' || isCategory ? f : '';
  const titleLabel = f === 'latest' ? '最新商品' : f === 'sale' ? '🔥 特價中' : isCategory ? f : '所有商品';
  const chips: { key: string; label: string; href: string }[] = [
    { key: '', label: '全部', href: `/${slug}` },
    { key: 'latest', label: '最新', href: `/${slug}?f=latest` },
    ...(hasSale ? [{ key: 'sale', label: '🔥 特價中', href: `/${slug}?f=sale` }] : []),
    ...categories.map((c) => ({ key: c, label: c, href: `/${slug}?f=${encodeURIComponent(c)}` })),
  ];

  // Hero banner — Phase 9.8 multi-media,fallback 舊 og_image_url
  const banners = tenant.banners.length > 0
    ? tenant.banners
    : tenant.og_image_url
      ? [{ type: 'image' as const, url: tenant.og_image_url }]
      : [];

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

      {banners.length > 0 && (
        <div className="hero-banner" style={{ marginBottom: '2.5rem' }}>
          <BannerHero banners={banners} tenantName={tenant.name} />
        </div>
      )}

      {allProducts.length === 0 ? (
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
          {/* Chip filter row(橫滑) */}
          {chips.length > 1 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                marginBottom: '1.25rem',
                paddingBottom: 4,
                scrollbarWidth: 'none',
              }}
            >
              {chips.map((c) => {
                const isActive = activeKey === c.key;
                return (
                  <Link
                    key={c.key || 'all'}
                    href={c.href}
                    style={{
                      padding: '6px 14px',
                      background: isActive ? '#18181b' : '#ffffff',
                      color: isActive ? '#ffffff' : '#52525b',
                      border: `1px solid ${isActive ? '#18181b' : '#e4e4e7'}`,
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Section title */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#18181b', letterSpacing: '-0.01em' }}>
              {titleLabel}
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
                <div style={{ overflow: 'hidden', position: 'relative' }}>
                  {/* C#9(2026-09-02):自訂角標(HOT / 9折…)。有 sale badge 時排它下面 */}
                  {p.badge && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        padding: '4px 10px',
                        background: '#b45309',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.03em',
                        zIndex: 1,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      {p.badge}
                    </div>
                  )}
                  {/* Phase 9.9 v2:sale badge 顯示 % off 在縮圖左上 */}
                  {isSaleActive(p, now) && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        padding: '4px 10px',
                        background: '#dc2626',
                        color: '#fff',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        zIndex: 1,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      {/* 2026-09-03:改台灣「折」講法 */}
                      🔥 {pctToZhe(p.sale_discount_pct!)}
                    </div>
                  )}
                  {(() => {
                    // Phase 9.6:列表縮圖優先用 media 第一張 image,fallback image_url
                    const firstImage = (p.media ?? []).find((m) => m.type === 'image');
                    const thumb = firstImage?.url ?? p.image_url;
                    return thumb;
                  })() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url ?? ''}
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
                    isSaleActive(p, now) ? (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            color: '#dc2626',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          NT$ {applySaleDiscount(p.min_price_twd, p.sale_discount_pct!).toLocaleString()}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#a1a1aa', textDecoration: 'line-through' }}>
                          {p.min_price_twd.toLocaleString()}
                        </span>
                      </div>
                    ) : (
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
                    )
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
