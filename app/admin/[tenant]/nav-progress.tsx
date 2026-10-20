'use client';

/**
 * 全站頁面切換進度條(2026-10-20)
 *
 * 點任何站內連結(側欄、分頁、列表的「編輯」…)當下就在頂部出現一條進度條,
 * 頁面真的到了(路徑或參數改變)才收掉 — 讓人知道「有按到,正在跑」。
 * 表單送出的回饋由 SubmitButton 自己負責(轉圈 + 處理中),這裡不管。
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);

  // 路由變了 = 到站,收掉
  useEffect(() => {
    setActive(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // 同頁只換 #錨點 不算切頁
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
      if (timer.current) clearTimeout(timer.current);
      // 保險:萬一導頁失敗或被取消,10 秒後自己收掉
      timer.current = window.setTimeout(() => setActive(false), 10000);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: active ? 1 : 0,
        transition: active ? 'opacity .1s' : 'opacity .3s .15s',
      }}
    >
      <div
        style={{
          height: '100%',
          background: '#18181b',
          // 先衝到 80%,剩下的等真的到站再補滿;到站後整條淡出
          width: active ? '80%' : '100%',
          transition: active ? 'width 5s cubic-bezier(.05,.8,.25,1)' : 'width .15s ease-out',
          boxShadow: '0 0 8px rgba(24,24,27,.35)',
        }}
      />
    </div>
  );
}

export function NavProgress() {
  // useSearchParams 需要 Suspense 邊界
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
