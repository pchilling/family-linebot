import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { bgStyleFromLegacy, derivePalette, paletteCssVars } from '@/lib/theme';
import { UI_CSS } from '@/lib/ui';
import { hasEmailEnv } from '@/lib/login-email';
import { hasSessionSecret } from '@/lib/member-auth';
import { AccountMenu } from './account-menu';
import { CartLink } from './cart-state';

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
  const { data: extraRow } = await supabaseAdmin
    .from('tenants')
    .select('contact_info')
    .eq('slug', slug)
    .maybeSingle();
  const contactInfo = (extraRow as { contact_info: string | null } | null)?.contact_info ?? null;

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
.shop-nav{display:flex;gap:20px;font-size:14px;font-weight:500}
.shop-nav a{text-decoration:none;color:var(--ui-muted)}.shop-nav a:hover{color:var(--ui-ink)}
.shop-main{width:100%;padding-top:24px;padding-bottom:64px}
.shop-foot{border-top:1px solid var(--ui-line);padding:28px 0;font-size:12px;color:var(--ui-muted);background:var(--ui-header)}
.shop-foot a{color:var(--ui-muted);text-decoration:none}.shop-foot a:hover{color:var(--ui-ink)}
@media (max-width:1024px){.shop-nav{display:none}.shop-main{padding-top:16px;padding-bottom:48px}}
          `,
        }}
      />

      <header className="shop-hdr">
        <div className="ui-wrap shop-hdr-in">
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
          <nav className="shop-nav" aria-label="主選單">
            <a href={`/${slug}`}>商品</a>
            <a href={`/${slug}/order-lookup`}>查訂單</a>
          </nav>
          {/* Phase 26:購物車 icon + 帳號(未登入「登入」/ 登入後頭像選單) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <CartLink tenantSlug={slug} />
            <AccountMenu slug={slug} tenantName={tenant.name} logoUrl={tenant.logo_url} ready={hasSessionSecret()} emailOn={hasEmailEnv()} />
          </div>
        </div>
      </header>

      <main className="ui-wrap shop-main">{children}</main>

      <footer className="shop-foot">
        <div className="ui-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
