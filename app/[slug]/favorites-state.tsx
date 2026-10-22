'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 收藏(2026-10-23):跟購物車一樣存瀏覽器本機(localStorage),每個攤位一份,不用登入。
 * 只存商品 id;名稱、價格、圖都從列表現抓,商品下架就自然不會出現。
 * 代價是換裝置不會同步;之後若加登入,再把這份 id 清單同步上去即可。
 */
const STORAGE_PREFIX = 'stall-fav-';
const CHANGE_EVENT = 'stall:fav-changed';

function storageKey(tenantSlug: string) {
  return STORAGE_PREFIX + tenantSlug;
}

function read(tenantSlug: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(tenantSlug: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(ids));
  // 同 tab 內 storage event 不會 fire,自己 dispatch CustomEvent
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: tenantSlug }));
}

export function useFavorites(tenantSlug: string) {
  // 初始 [] = SSR 與第一次 client render 一致(避免 hydration mismatch)
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read(tenantSlug));

    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === tenantSlug) setIds(read(tenantSlug));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(tenantSlug)) setIds(read(tenantSlug));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [tenantSlug]);

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);

  /** 切換收藏,回傳切換後是否為已收藏 */
  const toggle = useCallback(
    (productId: string) => {
      const current = read(tenantSlug);
      const on = !current.includes(productId);
      write(tenantSlug, on ? [...current, productId] : current.filter((id) => id !== productId));
      return on;
    },
    [tenantSlug],
  );

  return { ids, count: ids.length, has, toggle };
}
