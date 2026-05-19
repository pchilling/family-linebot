import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTenantBySlug } from '@/lib/supabase';

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  return (
    <div>
      <nav
        style={{
          padding: '10px 24px',
          background: '#f8f8f8',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          gap: 14,
          fontSize: 13,
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: '#000' }}>{tenant.name}</span>
        <span style={{ fontSize: 11, color: '#999' }}>
          {tenant.plan} · {tenant.slug}
        </span>
        <span style={{ flex: 1 }} />
        <Link
          href={`/admin/${tenant.slug}/classes`}
          style={{ color: '#555', textDecoration: 'none' }}
        >
          課程
        </Link>
        <Link
          href={`/admin/${tenant.slug}/products`}
          style={{ color: '#555', textDecoration: 'none' }}
        >
          商品
        </Link>
        <Link
          href={`/admin/${tenant.slug}/orders`}
          style={{ color: '#555', textDecoration: 'none' }}
        >
          訂單
        </Link>
        <Link
          href={`/admin/${tenant.slug}/customers`}
          style={{ color: '#555', textDecoration: 'none' }}
        >
          客戶
        </Link>
        <Link
          href={`/admin/${tenant.slug}/inventory`}
          style={{ color: '#555', textDecoration: 'none' }}
        >
          庫存
        </Link>
      </nav>
      {children}
    </div>
  );
}
