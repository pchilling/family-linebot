import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getTenantBySlug, getUserAllowedTenants, hasFeature, supabaseAdmin } from '@/lib/supabase';
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

  const [allowedTenants, ordersPendingResp, lowStockResp] = await Promise.all([
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
  ]);
  const ordersPending = ordersPendingResp.count ?? 0;
  const lowStock = lowStockResp.count ?? 0;

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
      {/* CSS:手機版 sidebar 改為 fixed drawer,加 hamburger 按鈕 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media (max-width: 767px) {
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
  .admin-content { padding: 56px 16px 32px !important; }
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
              ...sectionLabel,
              marginBottom: space['3'],
            }}
          >
            Stall Admin
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
        {children}
      </main>
    </div>
  );
}
