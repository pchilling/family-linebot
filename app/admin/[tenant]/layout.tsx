import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllActiveTenants, getTenantBySlug } from '@/lib/supabase';
import { NavLinks } from './nav-links';

function planColor(p: string): { bg: string; fg: string } {
  return ({
    free: { bg: '#f3f4f6', fg: '#6b7280' },
    pro: { bg: '#dbeafe', fg: '#1d4ed8' },
    enterprise: { bg: '#ede9fe', fg: '#6d28d9' },
  } as Record<string, { bg: string; fg: string }>)[p] ?? { bg: '#f3f4f6', fg: '#6b7280' };
}

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const [tenant, allTenants] = await Promise.all([
    getTenantBySlug(slug),
    getAllActiveTenants(),
  ]);
  if (!tenant) notFound();

  const others = allTenants.filter((t) => t.slug !== tenant.slug);
  const planTone = planColor(tenant.plan);
  const inventoryGated = tenant.plan === 'free';

  return (
    <div>
      <nav
        style={{
          background: '#f8f8f8',
          borderBottom: '1px solid #e5e5e5',
        }}
      >
        {/* Row 1: tenant 身份 + 切換 + 預覽公開頁 */}
        <div
          style={{
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600, color: '#000' }}>{tenant.name}</span>
          <span
            style={{
              padding: '2px 8px',
              background: planTone.bg,
              color: planTone.fg,
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {tenant.plan}
          </span>
          <span style={{ color: '#999', fontSize: 11 }}>
            {tenant.slug} · {tenant.order_prefix}
          </span>

          {others.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: '#999' }}>切到</span>
              {others.map((t, i) => (
                <span key={t.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span style={{ color: '#ddd' }}>·</span>}
                  <Link
                    href={`/admin/${t.slug}/products`}
                    style={{
                      color: '#555',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {t.name}
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        background: planColor(t.plan).bg,
                        color: planColor(t.plan).fg,
                        borderRadius: 2,
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.plan}
                    </span>
                  </Link>
                </span>
              ))}
            </span>
          )}

          <span style={{ flex: 1 }} />

          <a
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0070f3', textDecoration: 'none', fontSize: 12 }}
          >
            預覽公開頁 ↗
          </a>
        </div>

        {/* Row 2: 功能 nav(active 狀態靠 client component 判斷 pathname) */}
        <NavLinks tenantSlug={tenant.slug} inventoryGated={inventoryGated} />
      </nav>
      {children}
    </div>
  );
}
