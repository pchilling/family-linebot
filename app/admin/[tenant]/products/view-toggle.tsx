'use client';

/**
 * 商品列表檢視切換(2026-11-09):表格(原本的,預設)/ 卡片(格狀,圖大)。
 * Peter 定的:卡片是「多一種檢視」,表格不能被取代。
 * 選擇存 cookie、伺服器照 cookie 畫,不會先閃表格再換卡片;切換後 refresh 重畫。
 */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export type ProductsView = 'table' | 'cards';
export const PRODUCTS_VIEW_COOKIE = 'admin_products_view';

export function ProductViewToggle({ view }: { view: ProductsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(v: ProductsView) {
    if (v === view) return;
    document.cookie = `${PRODUCTS_VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const btn = (v: ProductsView, label: string) => (
    <button
      type="button"
      onClick={() => pick(v)}
      disabled={pending}
      aria-pressed={view === v}
      className={`ui-btn ui-btn-sm ${view === v ? 'ui-btn-primary' : 'ui-btn-ghost'}`}
      style={{ borderRadius: 0, border: 0, minWidth: 56 }}
    >
      {label}
    </button>
  );

  return (
    <div role="group" aria-label="檢視方式" style={{ display: 'inline-flex', border: '1px solid #e4e4e7', borderRadius: 7, overflow: 'hidden', background: '#fff' }}>
      {btn('table', '表格')}
      {btn('cards', '卡片')}
    </div>
  );
}
