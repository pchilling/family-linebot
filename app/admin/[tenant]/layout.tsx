import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantBySlug, getUserAllowedTenants, hasFeature, supabaseAdmin } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/super-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { signOut } from '../actions';
import {
  colors,
  fontFamilySans,
  fontSize,
  fontWeight,
  planBadge,
  planLabel,
  radius,
  sectionLabel,
  sidebarWidth,
  space,
} from '@/lib/admin-theme';
import { NavLinks } from './nav-links';
import { NavProgress } from './nav-progress';
import { MobileToggle, SidebarBackdrop } from './mobile-toggle';
import { UI_CSS } from '@/lib/ui';
import { derivePalette, paletteCssVars } from '@/lib/theme';

// 2026-11-01:後台也用公開商店那套元件(lib/ui.tsx 的 ui-btn / ui-input / ui-badge…),
// 色票設成 zinc(品牌色 #18181b → 中性灰階),整個後台一次注入,各頁直接用 className。
const ADMIN_UI_VARS = paletteCssVars(derivePalette('#18181b', 'white')) as React.CSSProperties;

// 字型在 app/layout.tsx root 統一載入(Phase 8.2),這裡不再各自載

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  // Perf optimization:auth 跟 tenant 互相獨立,可平行
  const [authResp, tenant] = await Promise.all([
    supabase.auth.getUser(),
    getTenantBySlug(slug),
  ]);
  const user = authResp.data.user;

  if (!tenant) notFound();

  // allowed tenants 跟 badges 都不互相依賴(都靠 user 或 tenant.id),可平行
  const inventoryGated = tenant.plan === 'free';
  const hasActivities = hasFeature(tenant, 'activities');
  // 最新消息:enterprise 自動有,其他 plan 需 features.news 白名單
  const hasNews = tenant.plan === 'enterprise' || hasFeature(tenant, 'news');

  const isSuper = isSuperAdmin(user?.email);
  const [allowedTenants, ordersPendingResp, lowStockResp, pendingAppsResp] = await Promise.all([
    getUserAllowedTenants(user?.email),
    // 待付款訂單(status='open')
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'open'),
    // 低庫存 variant — Free 不撈
    inventoryGated
      ? Promise.resolve({ count: null })
      : supabaseAdmin
          .from('product_variants')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('status', 'active')
          .lte('stock', 3),
    // 待審申請 — 只 super admin 撈
    isSuper
      ? supabaseAdmin
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: null }),
  ]);
  const ordersPending = ordersPendingResp.count ?? 0;
  const lowStock = lowStockResp.count ?? 0;
  const pendingApps = pendingAppsResp.count ?? 0;

  // Access check 移到所有 query 完之後(早期 redirect 浪費上面的並行 query,但
  // 在這裡 throw 也只是丟掉幾百 byte,效益不對等。先保持架構簡單)
  if (allowedTenants.length === 0) {
    redirect('/admin/login?error=no_tenant_access');
  }
  const hasAccessToThis = allowedTenants.some((t) => t.slug === slug);
  if (!hasAccessToThis) {
    redirect(`/admin/${allowedTenants[0].slug}`);
  }

  const others = allowedTenants.filter((t) => t.slug !== tenant.slug);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: colors.bgBody,
        fontFamily: fontFamilySans,
        color: colors.textPrimary,
        ...ADMIN_UI_VARS,
      }}
    >
      {/* 2026-10-20:點任何站內連結立刻出現頂部進度條,到站才收 */}
      <NavProgress />
      {/* CSS:共用元件(lib/ui)+ 手機版 sidebar 改 fixed drawer + hamburger;內頁 RWD */}
      <style
        dangerouslySetInnerHTML={{
          __html: UI_CSS + `
/* 2026-11-01:訂單狀態 badge(訂單列表 / 明細 / 總覽共用,配 ui-badge 一起用) */
.ob-open{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
.ob-paid{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.ob-shipped{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.ob-delivered{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
.ob-cancelled{background:#f4f4f5;color:#71717a;border-color:transparent}
.ob-refunded{background:#fef2f2;color:#b91c1c;border-color:#fecaca}

/* 2026-10-20:所有後台頁面不限寬,螢幕多寬用多寬。
   各頁原本各自在 <main> 設 maxWidth(720~1200 不等),寬螢幕兩側留一大片白;
   統一在這裡用 !important 蓋掉,不用逐頁改。哪一頁拉太寬難看再個別處理。 */
.admin-content main { max-width: none !important; }

/* 2026-10-20:任何按鈕/連結按下去當下就有反應(縮一點、變淡),不等伺服器 */
.admin-content a, .admin-content button, .admin-sidebar a {
  transition: transform .08s ease, opacity .08s ease;
}
.admin-content a:active, .admin-content button:active:not(:disabled), .admin-sidebar a:active {
  transform: scale(.97);
  opacity: .75;
}
button:disabled { cursor: progress; }

/* Global:details summary 隱藏默認三角(各 page 自帶 ▶ 視覺) */
.admin-content details summary {
  list-style: none;
}
.admin-content details summary::-webkit-details-marker {
  display: none;
}
.admin-content details[open] summary > span:first-child {
  /* default ▶ marker rotation if it's the first child(via inline style) */
}

@media (max-width: 767px) {
  /* === Sidebar drawer === */
  .admin-sidebar {
    position: fixed !important;
    top: 0;
    left: 0;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
  body.sidebar-open .admin-sidebar { transform: translateX(0); }
  body.sidebar-open .admin-sidebar-backdrop { display: block !important; }
  body.sidebar-open { overflow: hidden; }
  .admin-mobile-hamburger { display: inline-flex !important; }

  /* === Main content padding 緊湊 === */
  /* 2026-10-20:頂部留白 56 → 68,內容第一行才不會貼著左上角的漢堡按鈕(12~52px) */
  .admin-content { padding: 68px 12px 32px !important; }
  .admin-content main { padding: 0 !important; max-width: 100% !important; }

  /* === 表格 → 卡片(2026-11-01 起只套用在還用 <table> 的頁面:商品列表、規格表,要自己掛 .rtable)=== */
  .admin-content table.rtable {
    display: block;
    background: transparent;
    border: 0;
    border-collapse: separate;
    width: 100%;
  }
  .admin-content table.rtable thead {
    display: none;  /* 隱藏標題列 */
  }
  .admin-content table.rtable tbody {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .admin-content table.rtable tr {
    display: block;
    background: #ffffff;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  }
  .admin-content table.rtable td {
    display: block;
    padding: 3px 0;
    border: 0;
    font-size: 13px;
    color: #52525b;
    text-align: left !important;
  }
  .admin-content table.rtable td:first-child {
    font-weight: 600;
    font-size: 15px;
    color: #18181b;
    margin-bottom: 4px;
  }
  .admin-content table.rtable td:last-child {
    font-size: 11px;
    color: #a1a1aa;
    margin-top: 4px;
  }

  /* === 圖縮小避免破版 === */
  .admin-content img {
    max-width: 100%;
    height: auto;
  }

  /* 2026-11-01:以前這裡還有「所有 grid 強制一欄、所有 section padding 14px、
     所有 GET 表單直排、h1 強制 18px」的 !important catch-all;各頁換成新設計系統後
     都自帶 RWD,已拿掉。Dashboard 專屬規則由 dashboard page.tsx 自帶 <style> 處理。 */
}
          `,
        }}
      />
      <MobileToggle />
      <SidebarBackdrop />

      {/* Sidebar */}
      <aside
        className="admin-sidebar"
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: colors.bgCard,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        {/* Top:brand + tenant identity */}
        <div style={{ padding: `${space['6']}px ${space['5']}px ${space['4']}px` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space['2'],
              marginBottom: space['4'],
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-mark.png"
              alt="NEOP"
              width={28}
              height={28}
              style={{ display: 'block' }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: colors.neopBlack,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              NEOP
              <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 2 }}>STALL</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: space['3'], alignItems: 'flex-start' }}>
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={`${tenant.name} logo`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `1px solid ${colors.border}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: colors.bgSubtle,
                  border: `1px solid ${colors.border}`,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.textDisabled,
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
              >
                {tenant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.semibold,
                  letterSpacing: '-0.01em',
                  color: colors.textPrimary,
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {tenant.name}
              </h1>
              <div
                style={{
                  marginTop: space['2'],
                  display: 'flex',
                  alignItems: 'center',
                  gap: space['2'],
                  flexWrap: 'wrap',
                }}
              >
                <span style={planBadge(tenant.plan)}>{planLabel(tenant.plan)}</span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: 'var(--font-geist-mono), monospace',
                  fontSize: fontSize.xs,
                  color: colors.textMuted,
                  letterSpacing: '-0.02em',
                }}
              >
                {tenant.slug} · {tenant.order_prefix}
              </div>
            </div>
          </div>
        </div>

        {/* Tenant switcher */}
        {others.length > 0 && (
          <div
            style={{
              padding: `${space['3']}px ${space['5']}px ${space['4']}px`,
              borderTop: `1px solid ${colors.borderSubtle}`,
              borderBottom: `1px solid ${colors.borderSubtle}`,
            }}
          >
            <div
              style={{
                ...sectionLabel,
                marginBottom: space['2'],
              }}
            >
              切換
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {others.map((t) => (
                <Link
                  key={t.slug}
                  href={`/admin/${t.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space['2'],
                    padding: `${space['2']}px ${space['2']}px`,
                    borderRadius: radius.md,
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    fontSize: fontSize.base,
                    transition: 'background 100ms, color 100ms',
                  }}
                >
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logo_url}
                      alt=""
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `1px solid ${colors.border}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: colors.bgSubtle,
                        border: `1px solid ${colors.border}`,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: colors.textDisabled,
                        fontSize: fontSize.xs,
                        fontWeight: fontWeight.semibold,
                        fontFamily: 'var(--font-geist-mono), monospace',
                      }}
                    >
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                  </span>
                  <span style={planBadge(t.plan)}>{planLabel(t.plan)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Nav links(client component) */}
        <nav style={{ flex: 1, padding: `${space['3']}px ${space['3']}px`, overflowY: 'auto' }}>
          <div
            style={{
              ...sectionLabel,
              padding: `0 ${space['2']}px`,
              marginBottom: space['2'],
            }}
          >
            主選單
          </div>
          <NavLinks
            tenantSlug={tenant.slug}
            tenantId={tenant.id}
            inventoryGated={inventoryGated}
            hasActivities={hasActivities}
            hasNews={hasNews}
            hasLinePay={hasFeature(tenant, 'line_pay')}
            ordersPending={ordersPending}
            lowStock={lowStock}
          />
        </nav>

        {/* Bottom:預覽公開頁 + 登入帳號 */}
        <div
          style={{
            padding: `${space['4']}px ${space['5']}px ${space['5']}px`,
            borderTop: `1px solid ${colors.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: space['3'],
          }}
        >
          {isSuper && (
            <Link
              href="/admin/applications"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space['2'],
                color: colors.textSecondary,
                textDecoration: 'none',
                fontSize: fontSize.base,
                transition: 'color 100ms',
              }}
            >
              <span>申請審核</span>
              {pendingApps > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
                    background: '#dc2626',
                    color: '#fff',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {pendingApps}
                </span>
              )}
            </Link>
          )}

          <a
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: space['1'],
              color: colors.textSecondary,
              textDecoration: 'none',
              fontSize: fontSize.base,
              transition: 'color 100ms',
            }}
          >
            看商店
            <span
              aria-hidden
              style={{
                fontSize: fontSize.sm,
                color: colors.textMuted,
                fontFamily: 'var(--font-geist-mono), monospace',
              }}
            >
              ↗
            </span>
          </a>

          {user && (
            <div
              style={{
                paddingTop: space['3'],
                borderTop: `1px solid ${colors.borderSubtle}`,
                display: 'flex',
                flexDirection: 'column',
                gap: space['1'],
              }}
            >
              <span
                style={{
                  fontSize: fontSize.xs,
                  color: colors.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
                title={user.email ?? ''}
              >
                {user.email}
              </span>
              <form action={signOut} style={{ margin: 0 }}>
                <button
                  type="submit"
                  style={{
                    background: 'none',
                    border: 0,
                    color: colors.textSecondary,
                    cursor: 'pointer',
                    fontSize: fontSize.base,
                    padding: 0,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  登出
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <main
        className="admin-content"
        style={{
          flex: 1,
          minWidth: 0,
          padding: `${space['8']}px ${space['10']}px ${space['12']}px`,
        }}
      >
        {tenant.status === 'pending' && (
          <div
            style={{
              marginBottom: space['6'],
              padding: `${space['4']}px ${space['5']}px`,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 8,
              color: '#78350f',
              fontSize: fontSize.sm,
              lineHeight: 1.6,
            }}
          >
            <strong>申請審核中</strong>
            <br />
            你可以先設定後台(商品 / 活動 / 設定),但<strong>商店還沒對客人開放</strong>。
            審核通過(平台會用你登記的手機聯繫)後,LINE Bot 與商店連結才會正常運作。
          </div>
        )}
        {tenant.status === 'rejected' && (
          <div
            style={{
              marginBottom: space['6'],
              padding: `${space['4']}px ${space['5']}px`,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#991b1b',
              fontSize: fontSize.sm,
              lineHeight: 1.6,
            }}
          >
            <strong>申請未通過</strong>
            <br />
            若需重新申請或了解原因,請聯繫平台管理員。
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
