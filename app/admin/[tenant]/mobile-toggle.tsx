'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const TOGGLE_CLASS = 'sidebar-open';

/**
 * 手機版 admin sidebar 開關。透過 toggle body.sidebar-open class 控制 CSS。
 * 路由變更時自動關閉 drawer(避免換頁後 drawer 還開著)。
 */
export function MobileToggle() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.classList.remove(TOGGLE_CLASS);
  }, [pathname]);

  function toggle() {
    document.body.classList.toggle(TOGGLE_CLASS);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="開關側邊選單"
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 200,
        width: 40,
        height: 40,
        padding: 0,
        background: '#ffffff',
        color: '#18181b',
        border: '1px solid #e4e4e7',
        borderRadius: 8,
        fontSize: 18,
        cursor: 'pointer',
        display: 'none', // 預設隱藏,CSS @media 在 mobile 啟用
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        fontFamily: 'inherit',
      }}
      className="admin-mobile-hamburger"
    >
      ☰
    </button>
  );
}

/**
 * 半透明遮罩。點下去關閉 drawer。預設不顯示,sidebar open 時才透過 CSS 顯示。
 */
export function SidebarBackdrop() {
  function close() {
    document.body.classList.remove(TOGGLE_CLASS);
  }
  return (
    <div
      onClick={close}
      aria-hidden
      className="admin-sidebar-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 99,
        display: 'none',
      }}
    />
  );
}
