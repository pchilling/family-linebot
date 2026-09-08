'use client';

import { useRef, useState } from 'react';
import { saveCategoryOrder } from '../../actions';

/**
 * 分類顯示順序(2026-09-08 樂觀版):
 * 按 ↑↓ 畫面立刻換位,存檔在背景進行(連按也 OK,依序送出、最後一次為準)。
 * 原本走 form action + redirect 重算整頁,iPad/慢網路體感像卡死。
 */
export function CategoryOrderManager({
  tenantId,
  tenantSlug,
  initial,
}: {
  tenantId: string;
  tenantSlug: string;
  initial: string[];
}) {
  const [order, setOrder] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // 連按時序列化存檔,避免舊順序蓋新順序
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next); // 立即反應
    setState('saving');
    queueRef.current = queueRef.current
      .then(() => saveCategoryOrder(tenantId, tenantSlug, next))
      .then((r) => setState((r as { ok: boolean }).ok ? 'saved' : 'error'))
      .catch(() => setState('error'));
  }

  const arrowBtn = (disabled: boolean): React.CSSProperties => ({
    width: 44,
    height: 44,
    padding: 0,
    background: disabled ? '#fafafa' : '#fff',
    border: `1.5px solid ${disabled ? '#f4f4f5' : '#71717a'}`,
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    fontFamily: 'inherit',
    fontSize: 20,
    fontWeight: 700,
    color: '#18181b',
    touchAction: 'manipulation',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 12, color: '#71717a', margin: '10px 0 4px' }}>
        商城(LINE 商品專區 + 公開頁)的分類 chip 順序與「全部」的分組順序照這裡排。
        目前:<strong>{order.join(' → ')}</strong>
      </p>
      {order.map((cat, i) => (
        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fafafa', borderRadius: 6 }}>
          <span style={{ fontSize: 12, color: '#71717a', fontFamily: 'ui-monospace, monospace', width: 18 }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{cat}</span>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={arrowBtn(i === 0)} aria-label={`${cat} 往上`}>↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} style={arrowBtn(i === order.length - 1)} aria-label={`${cat} 往下`}>↓</button>
        </div>
      ))}
      <div style={{ fontSize: 12, minHeight: 18, color: state === 'error' ? '#dc2626' : '#16a34a' }}>
        {state === 'saving' && <span style={{ color: '#71717a' }}>儲存中…</span>}
        {state === 'saved' && '✓ 已儲存'}
        {state === 'error' && '⚠️ 儲存失敗,請重新整理後再試'}
      </div>
    </div>
  );
}
