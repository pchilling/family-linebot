'use client';

import { useCallback, useEffect, useState } from 'react';

// 購物車存 snapshot(不只 id):下單成功前商品價/名可能變動,
// 用購物時的快照才不會誤導客人 / 訂單金額對不上
export type CartItem = {
  variantId: string;
  productId: string;
  productSlug: string | null;
  productName: string;
  variantName: string;
  priceTwd: number;
  qty: number;
  imageUrl: string | null;
};

const STORAGE_PREFIX = 'stall-cart-';
const CHANGE_EVENT = 'stall:cart-changed';

function storageKey(tenantSlug: string) {
  return STORAGE_PREFIX + tenantSlug;
}

function read(tenantSlug: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function write(tenantSlug: string, items: CartItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(items));
  // 同 tab 內 storage event 不會 fire,自己 dispatch CustomEvent
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: tenantSlug }));
}

export function useCart(tenantSlug: string) {
  // 初始 [] = SSR 與第一次 client render 一致(避免 hydration mismatch)
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(read(tenantSlug));

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === tenantSlug) setItems(read(tenantSlug));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(tenantSlug)) setItems(read(tenantSlug));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [tenantSlug]);

  const addItem = useCallback(
    (item: CartItem) => {
      const current = read(tenantSlug);
      const existing = current.find((i) => i.variantId === item.variantId);
      if (existing) {
        existing.qty += item.qty;
        write(tenantSlug, [...current]);
      } else {
        write(tenantSlug, [...current, item]);
      }
    },
    [tenantSlug],
  );

  const updateQty = useCallback(
    (variantId: string, qty: number) => {
      const current = read(tenantSlug);
      const next =
        qty <= 0
          ? current.filter((i) => i.variantId !== variantId)
          : current.map((i) => (i.variantId === variantId ? { ...i, qty } : i));
      write(tenantSlug, next);
    },
    [tenantSlug],
  );

  const removeItem = useCallback(
    (variantId: string) => {
      const current = read(tenantSlug);
      write(
        tenantSlug,
        current.filter((i) => i.variantId !== variantId),
      );
    },
    [tenantSlug],
  );

  const clear = useCallback(() => {
    write(tenantSlug, []);
  }, [tenantSlug]);

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const totalTwd = items.reduce((sum, i) => sum + i.priceTwd * i.qty, 0);

  return { items, totalQty, totalTwd, addItem, updateQty, removeItem, clear };
}

export function CartLink({ tenantSlug }: { tenantSlug: string }) {
  const { totalQty } = useCart(tenantSlug);
  return (
    <a
      href={`/${tenantSlug}/cart`}
      aria-label={`購物車,${totalQty} 件`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.5rem 0.875rem',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 999,
        color: '#374151',
        textDecoration: 'none',
        fontSize: '0.875rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '1rem' }} aria-hidden>
        🛒
      </span>
      <span>購物車</span>
      {totalQty > 0 && (
        <span
          style={{
            background: '#ef4444',
            color: '#fff',
            borderRadius: 999,
            minWidth: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.6875rem',
            fontWeight: 600,
            padding: '0 0.4rem',
            lineHeight: 1,
          }}
        >
          {totalQty}
        </span>
      )}
    </a>
  );
}
