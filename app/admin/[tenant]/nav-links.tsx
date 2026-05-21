'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  tenantSlug: string;
  inventoryGated: boolean;
};

type LinkDef = {
  key: string;
  label: string;
  href: string;
  gated?: boolean;
};

export function NavLinks({ tenantSlug, inventoryGated }: Props) {
  const pathname = usePathname();

  const links: LinkDef[] = [
    { key: 'dashboard', label: '總覽', href: `/admin/${tenantSlug}` },
    { key: 'products', label: '商品', href: `/admin/${tenantSlug}/products` },
    { key: 'orders', label: '訂單', href: `/admin/${tenantSlug}/orders` },
    { key: 'customers', label: '客戶', href: `/admin/${tenantSlug}/customers` },
    { key: 'inventory', label: '庫存', href: `/admin/${tenantSlug}/inventory`, gated: inventoryGated },
    { key: 'classes', label: '課程', href: `/admin/${tenantSlug}/classes` },
    { key: 'attendances', label: '出席', href: `/admin/${tenantSlug}/attendances` },
    { key: 'settings', label: '設定', href: `/admin/${tenantSlug}/settings` },
  ];

  const dashboardHref = `/admin/${tenantSlug}`;
  const isActive = (href: string) => {
    // 「總覽」只 exact match,避免任何 sub-path 都把它也算 active
    if (href === dashboardHref) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div
      style={{
        padding: '0 24px',
        display: 'flex',
        gap: 4,
        borderTop: '1px solid #ececec',
        fontSize: 13,
        alignItems: 'stretch',
      }}
    >
      {links.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.key}
            href={link.href}
            title={link.gated ? '此功能需 Pro 以上' : undefined}
            style={{
              padding: '10px 12px',
              color: link.gated ? '#bbb' : active ? '#000' : '#555',
              textDecoration: 'none',
              fontWeight: active ? 600 : 400,
              borderBottom: active ? '2px solid #000' : '2px solid transparent',
              marginBottom: -1, // 蓋掉 parent 的 borderTop 視覺,讓 active 線連接
              transition: 'color 0.1s, border-color 0.1s',
            }}
          >
            {link.label}
            {link.gated && ' 🔒'}
          </Link>
        );
      })}
    </div>
  );
}
