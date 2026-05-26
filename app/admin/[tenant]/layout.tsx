import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
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
  radius,
  sectionLabel,
  sidebarWidth,
  space,
} from '@/lib/admin-theme';
import { NavLinks } from './nav-links';
import { MobileToggle, SidebarBackdrop } from './mobile-toggle';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

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
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: colors.bgBody,
        fontFamily: fontFamilySans,
        color: colors.textPrimary,
      }}
    >
      {/* CSS:手機版 sidebar 改 fixed drawer + hamburger;內頁 RWD */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
  .admin-content { padding: 56px 12px 32px !important; }
  .admin-content main { padding: 0 !important; max-width: 100% !important; }

  /* === Tables → 卡片化(每列變一張卡)=== */
  .admin-content table {
    display: block;
    background: transparent;
    border: 0;
    border-collapse: separate;
    width: 100%;
  }
  .admin-content table thead {
    display: none;  /* 隱藏標題列 */
  }
  .admin-content table tbody {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .admin-content table tr {
    display: block;
    background: #ffffff;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  }
  .admin-content table td {
    display: block;
    padding: 3px 0;
    border: 0;
    font-size: 13px;
    color: #52525b;
    text-align: left !important;
  }
  /* 第一個 cell(通常是 主鍵 / 名字)當卡片標題 */
  .admin-content table td:first-child {
    font-weight: 600;
    font-size: 15px;
    color: #18181b;
    margin-bottom: 4px;
  }
  /* 最後 cell(通常是時間 / 動作)淡化 */
  .admin-content table td:last-child {
    font-size: 11px;
    color: #a1a1aa;
    margin-top: 4px;
  }

  /* === 所有 grid → 1 col(包山包海)=== */
  .admin-content [style*="grid-template-columns"] {
    grid-template-columns: 1fr !important;
  }

  /* === Flex wrap 強化 === */
  .admin-content form[method="GET"] {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .admin-content form[method="GET"] input,
  .admin-content form[method="GET"] select,
  .admin-content form[method="GET"] button {
    flex: 1 1 100% !important;
    width: 100% !important;
  }

  /* === 字級縮小防溢出 === */
  .admin-content h1 { font-size: 18px !important; }
  .admin-content h2 { font-size: 15px !important; }

  /* === Section / card padding 緊湊 === */
  .admin-content section,
  .admin-content article {
    padding: 14px !important;
  }

  /* === Toggle button 群組(scope tabs etc.)= 自動 wrap === */
  .admin-content > div[style*="display: flex"][style*="gap"] {
    flex-wrap: wrap;
  }

  /* === 圖縮小避免破版 === */
  .admin-content img {
    max-width: 100%;
    height: auto;
  }

  /* Filter form 卡片樣式(不 sticky,跟著正常 scroll) */
  .admin-content form[method="GET"] {
    background: #fafafa !important;
    border: 1px solid #e4e4e7 !important;
    border-radius: 10px !important;
    padding: 10px !important;
  }

  /* Dashboard 專屬規則由 dashboard page.tsx 自帶 <style> 處理,避免 catch-all 衝突 */
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
              alt=""
              width={28}
              height={28}
              style={{ display: 'block' }}
            />
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: colors.textPrimary,
                letterSpacing: '-0.01em',
              }}
            >
              NEOP
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
                <span style={planBadge(tenant.plan)}>{tenant.plan}</span>
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
                  <span style={planBadge(t.plan)}>{t.plan}</span>
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
              <span>📋 申請審核</span>
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
            預覽公開頁
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
            <strong>⏳ 申請審核中</strong>
            <br />
            你可以先設定後台(商品 / 活動 / 設定),但**公開頁面尚未對客戶開啟**。
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
            <strong>❌ 申請未通過</strong>
            <br />
            若需重新申請或了解原因,請聯繫平台管理員。
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
