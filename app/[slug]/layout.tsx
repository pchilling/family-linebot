import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { bgStyleFromLegacy, derivePalette, paletteCssVars } from '@/lib/theme';
import { UI_CSS } from '@/lib/ui';
import { hasEmailEnv } from '@/lib/login-email';
import { hasSessionSecret } from '@/lib/member-auth';
import { getGroupBuyState } from '@/lib/groupbuy';
import { AccountMenu } from './account-menu';
import { CartLink } from './cart-state';
import { ShopTabs } from './shop-tabs';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) return { title: '攤位不存在' };
  return {
    title: tenant.name,
    description: tenant.description ?? `${tenant.name} 線上攤位`,
    openGraph: tenant.og_image_url
      ? { title: tenant.name, images: [{ url: tenant.og_image_url }] }
      : { title: tenant.name },
  };
}

/**
 * 公開商店的外框(Phase 24,2026-10-23 改版):
 * 店家只選一個品牌色(tenants.brand_color),整站顏色由 lib/theme.ts 算出來放成 CSS 變數,
 * 共用元件(lib/ui.tsx)與各頁一律吃變數。底色風格過渡期先從舊的 shop_bg_color 推
 * (黃色系 → 奶油,其餘純白),等後台設定做好改讀 bg_style。
 */
export default async function TenantLayout({ children, params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  // 2026-09-11(回饋 #13):footer 顯示攤位對外聯絡資訊(getTenantPublic 沒帶,另撈)
  // Phase 30(2026-11-01):頁首店名旁顯示店家評價(只算顯示中的),量小在程式裡算平均
  // Phase 35(2026-11-07):有沒有開團 → 選單 / 分頁「團購」旁的綠點(不讀 cookie,layout 維持可快取)
  const [{ data: extraRow }, { data: storeReviews }, groupBuy] = await Promise.all([
    supabaseAdmin.from('tenants').select('contact_info, disclaimer').eq('slug', slug).maybeSingle(),
    supabaseAdmin.from('tenant_reviews').select('rating').eq('tenant_id', tenant.id).eq('status', 'visible'),
    getGroupBuyState(tenant.id),
  ]);
  const hasOpenGroupBuy = !!groupBuy.current;
  const extra = (extraRow as { contact_info: string | null; disclaimer: string | null } | null) ?? null;
  const contactInfo = extra?.contact_info ?? null;
  // Phase 32:商店聲明(攤主說明跟所賣品牌的關係),空白不顯示
  const disclaimer = extra?.disclaimer?.trim() || null;
  const ratingList = ((storeReviews as { rating: number }[] | null) ?? []).map((r) => r.rating);
  const storeRating = ratingList.length
    ? { avg: Math.round((ratingList.reduce((s, r) => s + r, 0) / ratingList.length) * 10) / 10, count: ratingList.length }
    : null;

  const palette = derivePalette(tenant.brand_color, bgStyleFromLegacy(tenant.shop_bg_color));
  const vars = paletteCssVars(palette) as React.CSSProperties;

  return (
    <div
      style={{
        ...vars,
        minHeight: '100vh',
        background: 'var(--ui-bg)',
        color: 'var(--ui-ink)',
        fontFamily: 'Inter, "Noto Sans TC", ui-sans-serif, system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: UI_CSS }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
.shop-hdr{position:sticky;top:0;z-index:20;height:56px;border-bottom:1px solid var(--ui-line);background:var(--ui-header)}
.shop-hdr-in{height:100%;display:flex;align-items:center;justify-content:space-between;gap:24px}
.shop-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ui-ink);font-weight:600;font-size:15px;letter-spacing:-.01em;min-width:0}
.shop-brand span.n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shop-brand-wrap{display:flex;align-items:center;gap:10px;min-width:0}
.shop-rating{display:inline-flex;align-items:center;gap:3px;font-size:12.5px;color:var(--ui-muted);white-space:nowrap;flex-shrink:0}
.shop-rating b{color:var(--ui-ink);font-weight:600;font-variant-numeric:tabular-nums}
@media (max-width:420px){.shop-rating{display:none}}
.shop-nav{display:flex;gap:20px;font-size:14px;font-weight:500}
.shop-nav a{text-decoration:none;color:var(--ui-muted);display:inline-flex;align-items:center;gap:6px}.shop-nav a:hover{color:var(--ui-ink)}
.shop-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#16a34a;flex-shrink:0}
.shop-tabs{display:none;border-bottom:1px solid var(--ui-line);background:var(--ui-header)}
.shop-tabs-in{display:flex}
.shop-tab{flex:1;height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:500;color:var(--ui-muted);text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-1px}
.shop-tab[data-on="true"]{color:var(--ui-ink);font-weight:600;border-bottom-color:var(--ui-accent)}
.shop-main{width:100%;padding-top:24px;padding-bottom:64px}
.shop-foot{border-top:1px solid var(--ui-line);padding:28px 0;font-size:12px;color:var(--ui-muted);background:var(--ui-header)}
.shop-foot a{color:var(--ui-muted);text-decoration:none}.shop-foot a:hover{color:var(--ui-ink)}
@media (max-width:1024px){.shop-nav{display:none}.shop-tabs{display:block}.shop-main{padding-top:16px;padding-bottom:48px}}
          `,
        }}
      />

      <header className="shop-hdr">
        <div className="ui-wrap shop-hdr-in">
          <div className="shop-brand-wrap">
            <a href={`/${slug}`} className="shop-brand">
              {tenant.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--ui-line)', flexShrink: 0 }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--ui-accent)', color: 'var(--ui-on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                >
                  {tenant.name.slice(0, 1)}
                </span>
              )}
              <span className="n">{tenant.name}</span>
            </a>
            {/* Phase 30:店家評價平均星數(客人出貨後給的) */}
            {storeRating && (
              <span className="shop-rating" title={`${storeRating.count} 位客人評價這家店`} aria-label={`店家評價 ${storeRating.avg.toFixed(1)} 顆星,共 ${storeRating.count} 則`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" aria-hidden><path d="M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8z" /></svg>
                <b>{storeRating.avg.toFixed(1)}</b>
                <span>({storeRating.count})</span>
              </span>
            )}
          </div>
          {/* Phase 35:電腦版選單「攤位 · 團購 · 查訂單」;有開團時團購旁一個綠點 */}
          <nav className="shop-nav" aria-label="主選單">
            <a href={`/${slug}`}>攤位</a>
            <a href={`/${slug}/groupbuy`}>團購{hasOpenGroupBuy && <span className="shop-dot" aria-label="收單中" />}</a>
            <a href={`/${slug}/order-lookup`}>查訂單</a>
          </nav>
          {/* Phase 26:購物車 icon + 帳號(未登入「登入」/ 登入後頭像選單) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <CartLink tenantSlug={slug} />
            <AccountMenu slug={slug} tenantName={tenant.name} logoUrl={tenant.logo_url} ready={hasSessionSecret()} emailOn={hasEmailEnv()} />
          </div>
        </div>
      </header>

      {/* Phase 35:手機版「攤位 / 團購」分頁(只在這兩頁顯示,元件自己判斷) */}
      <ShopTabs slug={slug} hasOpen={hasOpenGroupBuy} />

      <main className="ui-wrap shop-main">{children}</main>

      <footer className="shop-foot">
        <div className="ui-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Phase 32:商店聲明 */}
          {disclaimer && (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 12.5 }}>{disclaimer}</p>
          )}
          {/* 2026-09-11(回饋 #13):對外聯絡資訊 */}
          {contactInfo && (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }}>{contactInfo}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>© {new Date().getFullYear()} {tenant.name}</span>
            {/* 法規連結(2026-09-08:查訂單併入此列;2026-10-22:政策頁改成攤位自己的) */}
            <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href={`/${slug}/order-lookup`}>查訂單</a>
              <a href={`/${slug}/policy/terms`}>服務條款</a>
              <a href={`/${slug}/policy/privacy`}>隱私權</a>
              <a href={`/${slug}/policy/refund`}>退款</a>
              <a href={`/${slug}/policy/shipping`}>寄送</a>
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ui-faint)' }}>
            Made with <strong style={{ color: 'var(--ui-muted)', letterSpacing: '0.08em' }}>NEOP STALL</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
