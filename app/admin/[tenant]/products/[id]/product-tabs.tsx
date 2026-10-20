'use client';

/**
 * 商品編輯頁分頁(2026-10-20)
 * 原本分頁是 ?tab= 連結,每點一次都要等伺服器重新產生整頁,看起來像沒反應。
 * 改成純前端切換:四個分頁一開始就都在頁上,點了當下就換,
 * 同時把 ?tab= 寫進網址(重新整理 / 存完 redirect 回來都會停在同一分頁)。
 * 沒顯示的分頁用 hidden 藏起來而不是拆掉,規格表格打到一半切去別頁再切回來不會消失。
 */
import { useState } from 'react';

export const TABS = [
  { key: 'variants', label: '規格與庫存' },
  { key: 'basic', label: '基本資料' },
  { key: 'media', label: '圖片與分享' },
  { key: 'sale', label: '促銷' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

export function ProductTabs({
  initial,
  panels,
}: {
  initial: TabKey;
  panels: Record<TabKey, React.ReactNode>;
}) {
  const [tab, setTab] = useState<TabKey>(initial);

  function go(k: TabKey) {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', k);
    url.searchParams.delete('saved');
    url.searchParams.delete('err');
    window.history.replaceState(null, '', url);
  }

  return (
    <>
      <nav
        aria-label="編輯分頁"
        style={{ display: 'flex', gap: 18, borderBottom: '1px solid #e4e4e7', marginBottom: 18, overflowX: 'auto', whiteSpace: 'nowrap' }}
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              aria-current={on ? 'page' : undefined}
              style={{
                padding: '10px 4px',
                marginBottom: -1,
                border: 0,
                borderBottom: `2px solid ${on ? '#18181b' : 'transparent'}`,
                background: 'none',
                fontSize: 13.5,
                fontWeight: on ? 700 : 500,
                color: on ? '#18181b' : '#52525b',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {TABS.map((t) => (
        <div key={t.key} hidden={t.key !== tab}>
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
