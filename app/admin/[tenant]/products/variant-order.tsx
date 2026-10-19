'use client';

/**
 * 變體順序調整(2026-10-20)
 *
 * 原本上移/下移是 server action + redirect,等於每按一下都要把整個商品頁
 * (59 個商品、82 個變體)重新產生再傳回來,按下去要等好幾秒。
 * 改成:點了先在畫面上換位置(即時),存檔在背景送出。
 *
 * 變體卡本身仍由 server render(表單、上傳元件都在裡面),
 * 這裡只負責外框、順序列與上下鈕,用 children 陣列重排。
 */
import { useState, useTransition } from 'react';
import { saveVariantOrder } from '../../actions';

type Item = { id: string; saved: boolean };

export function VariantOrderList({
  tenantSlug,
  productId,
  items,
  children,
}: {
  tenantSlug: string;
  productId: string;
  items: Item[];
  children: React.ReactNode;
}) {
  const cards = Array.isArray(children) ? children : [children];
  // order 存的是 items/cards 的索引,換位置只動這個陣列
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function move(pos: number, dir: -1 | 1) {
    const to = pos + dir;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[pos], next[to]] = [next[to], next[pos]];
    setOrder(next);
    setFailed(false);
    startTransition(async () => {
      const res = await saveVariantOrder(tenantSlug, productId, next.map((i) => items[i].id));
      if (!res.ok) {
        setFailed(true);
        setOrder(order); // 存檔失敗就把畫面轉回去,不要讓人以為存好了
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {order.map((idx, pos) => {
        const it = items[idx];
        return (
          <div
            key={it.id}
            id={`variant-${it.id}`}
            style={{
              padding: 12,
              background: it.saved ? '#f0fdf4' : '#fafafa',
              border: `1px solid ${it.saved ? '#bbf7d0' : '#f4f4f5'}`,
              borderRadius: 6,
            }}
          >
            {items.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                  顯示順序 第 {pos + 1} 個{pos === 0 ? '(客人預設看到這個)' : ''}
                </span>
                <button type="button" onClick={() => move(pos, -1)} disabled={pos === 0} title="往上移一格" style={btn(pos === 0)}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(pos, 1)}
                  disabled={pos === order.length - 1}
                  title="往下移一格"
                  style={btn(pos === order.length - 1)}
                >
                  ↓
                </button>
                {pending && <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>儲存中…</span>}
                {failed && <span style={{ fontSize: 10.5, color: '#dc2626' }}>儲存失敗,請重試</span>}
              </div>
            )}
            {cards[idx]}
          </div>
        );
      })}
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 24,
    border: '1px solid #e4e4e7',
    borderRadius: 4,
    background: '#fff',
    color: disabled ? '#d4d4d8' : '#52525b',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    lineHeight: 1,
    fontFamily: 'inherit',
  };
}
