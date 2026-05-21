'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  tenantSlug: string;
  tenantId: string;
  inventoryGated: boolean;
  hasActivities: boolean;
  ordersPending: number;
  lowStock: number;
};

type LinkDef = {
  key: string;
  label: string;
  href: string;
  gated?: boolean;
  badge?: number;
};

// Inline tokens(client component 不能 import server-only;這幾個 const 直接寫)
const c = {
  primary: '#18181b',
  secondary: '#52525b',
  muted: '#71717a',
  disabled: '#a1a1aa',
  hover: '#f4f4f5',
  active: '#e4e4e7',
  accent: '#18181b',
};

export function NavLinks({
  tenantSlug,
  tenantId,
  inventoryGated,
  hasActivities,
  ordersPending,
  lowStock,
}: Props) {
  const pathname = usePathname();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Realtime subscribe:有新客戶訊息進來就 +1 badge
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel(`tenant:${tenantId}:messages`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'new_message' }, () => {
        setUnreadMessages((c) => c + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // 進 messages 頁就重置 badge(視為已看過)
  useEffect(() => {
    if (pathname === `/admin/${tenantSlug}/messages`) {
      setUnreadMessages(0);
    }
  }, [pathname, tenantSlug]);

  const links: LinkDef[] = [
    { key: 'dashboard', label: '總覽', href: `/admin/${tenantSlug}` },
    { key: 'products', label: '商品', href: `/admin/${tenantSlug}/products` },
    { key: 'orders', label: '訂單', href: `/admin/${tenantSlug}/orders`, badge: ordersPending },
    { key: 'customers', label: '客戶', href: `/admin/${tenantSlug}/customers` },
    {
      key: 'inventory',
      label: '庫存',
      href: `/admin/${tenantSlug}/inventory`,
      gated: inventoryGated,
      badge: inventoryGated ? 0 : lowStock,
    },
    // 活動 nav 只給 features.activities 開啟的 tenant 看(目前只有 oilswa 三合一)
    ...(hasActivities
      ? [
          { key: 'classes', label: '活動', href: `/admin/${tenantSlug}/classes` },
          { key: 'attendances', label: '出席', href: `/admin/${tenantSlug}/attendances` },
        ]
      : []),
    { key: 'news', label: '最新消息', href: `/admin/${tenantSlug}/news` },
    {
      key: 'messages',
      label: '客戶訊息',
      href: `/admin/${tenantSlug}/messages`,
      badge: unreadMessages,
    },
    { key: 'settings', label: '設定', href: `/admin/${tenantSlug}/settings` },
  ];

  const dashboardHref = `/admin/${tenantSlug}`;
  const isActive = (href: string) => {
    if (href === dashboardHref) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {links.map((link) => {
        const active = isActive(link.href);
        const isGated = !!link.gated;

        return (
          <Link
            key={link.key}
            href={link.href}
            title={isGated ? '此功能需 Pro 以上方案' : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px 7px 14px',
              borderRadius: 6,
              color: isGated ? c.disabled : active ? c.primary : c.secondary,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: active ? 600 : 450,
              background: active ? c.active : 'transparent',
              letterSpacing: '-0.005em',
              transition: 'background 100ms, color 100ms',
            }}
          >
            {/* Active 左邊細條(僅 active 顯示) */}
            {active && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  borderRadius: 1,
                  background: c.accent,
                }}
              />
            )}
            <span>{link.label}</span>
            {/* Badge:gated 顯示 PRO,否則有數字才顯示 */}
            {isGated ? (
              <span
                aria-hidden
                style={{
                  fontSize: 10,
                  color: c.disabled,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
                title="Pro+"
              >
                PRO
              </span>
            ) : (link.badge ?? 0) > 0 ? (
              <span
                aria-label={`${link.badge} 個待處理`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  background: '#dc2626',
                  color: '#ffffff',
                  borderRadius: 9,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-geist-mono), monospace',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {(link.badge ?? 0) > 99 ? '99+' : link.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
