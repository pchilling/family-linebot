import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getAllActiveTenants, getTenantBySlug, hasFeature } from '@/lib/supabase';
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
  const [{ data: { user } }, tenant, allTenants] = await Promise.all([
    supabase.auth.getUser(),
    getTenantBySlug(slug),
    getAllActiveTenants(),
  ]);
  if (!tenant) notFound();

  const others = allTenants.filter((t) => t.slug !== tenant.slug);
  const inventoryGated = tenant.plan === 'free';
  const hasActivities = hasFeature(tenant, 'activities');

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
      {/* Sidebar */}
      <aside
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
          <h1
            style={{
              margin: 0,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.semibold,
              letterSpacing: '-0.01em',
              color: colors.textPrimary,
              lineHeight: 1.3,
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
            <span
              style={{
                fontFamily: 'var(--font-geist-mono), monospace',
                fontSize: fontSize.xs,
                color: colors.textMuted,
                letterSpacing: '-0.02em',
              }}
            >
              {tenant.slug} · {tenant.order_prefix}
            </span>
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
                    justifyContent: 'space-between',
                    padding: `${space['2']}px ${space['2']}px`,
                    borderRadius: radius.md,
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    fontSize: fontSize.base,
                    transition: 'background 100ms, color 100ms',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 140,
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
            inventoryGated={inventoryGated}
            hasActivities={hasActivities}
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
