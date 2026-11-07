'use client';

import { usePathname } from 'next/navigation';

/**
 * 手機版「攤位 / 團購」分頁(Phase 35,2026-11-07)。
 * 只在攤位首頁與團購分頁顯示(商品頁、結帳、訂單頁不顯示),≤1024px 才出現,電腦版用頁首選單。
 * 2026-11-08 Peter:沒有收單中的團就整列分頁都不顯示(預設看不到團購,開團才出現);
 * 直接打 /{slug}/groupbuy 網址還是開得到(上一團的灰卡),只是沒有分頁可以點過去。
 */
export function ShopTabs({ slug, hasOpen }: { slug: string; hasOpen: boolean }) {
  const pathname = usePathname();
  const home = `/${slug}`;
  const gb = `/${slug}/groupbuy`;
  const onHome = pathname === home || pathname === `${home}/`;
  const onGb = pathname === gb || pathname === `${gb}/`;
  if (!hasOpen || (!onHome && !onGb)) return null;

  return (
    <nav className="shop-tabs" aria-label="攤位 / 團購">
      <div className="ui-wrap shop-tabs-in">
        <a href={home} className="shop-tab" data-on={onHome ? 'true' : 'false'} aria-current={onHome ? 'page' : undefined}>攤位</a>
        <a href={gb} className="shop-tab" data-on={onGb ? 'true' : 'false'} aria-current={onGb ? 'page' : undefined}>
          團購
          {hasOpen && <span className="shop-dot" aria-label="收單中" />}
        </a>
      </div>
    </nav>
  );
}
