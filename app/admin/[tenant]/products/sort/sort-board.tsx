'use client';

import { useEffect, useRef, useState } from 'react';
import { saveProductOrder } from '../../../actions';

export type SortItem = {
  id: string;
  name: string;
  image: string | null;
  price: number;
};
export type SortGroup = { category: string; items: SortItem[] };

/**
 * 商品拖曳排序板(Phase 16.2,2026-09-18):
 * 預覽格照商城卡片樣式;按住卡片拖到位置放開 → 立即存該分類的順序。
 * - 滑鼠:按下即提起
 * - 觸控(iPad/手機):長按 220ms 提起(期間可正常捲動頁面;提起後擋捲動)
 * - 只能在同分類內移動;樂觀更新 + 佇列存檔(同 category-order 手感)
 */
export function SortBoard({
  tenantSlug,
  initialGroups,
}: {
  tenantSlug: string;
  initialGroups: SortGroup[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [dragging, setDragging] = useState<{ gi: number; id: string } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; item: SortItem } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const dragRef = useRef<{ gi: number; id: string } | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const savedTimer = useRef<number | null>(null);

  function clearPressTimer() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  function startDrag(gi: number, item: SortItem, x: number, y: number, w: number) {
    dragRef.current = { gi, id: item.id };
    setDragging({ gi, id: item.id });
    setGhost({ x, y, w, item });
    document.body.style.userSelect = 'none';
  }

  function moveDrag(x: number, y: number) {
    const d = dragRef.current;
    if (!d) return;
    setGhost((g) => (g ? { ...g, x, y } : g));
    // pointer 落在同組哪張卡上 → 把拖曳中的卡移到那個位置
    const items = groupsRef.current[d.gi].items;
    for (const target of items) {
      if (target.id === d.id) continue;
      const el = cardRefs.current.get(target.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        setGroups((prev) => {
          const next = prev.map((g) => ({ ...g, items: [...g.items] }));
          const arr = next[d.gi].items;
          const from = arr.findIndex((it) => it.id === d.id);
          const to = arr.findIndex((it) => it.id === target.id);
          if (from < 0 || to < 0 || from === to) return prev;
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return next;
        });
        break;
      }
    }
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setGhost(null);
    document.body.style.userSelect = '';
    clearPressTimer();
    if (!d) return;

    // 存這個分類目前的順序(佇列化:連續拖曳依序寫入,最後一次為準)
    const ids = groupsRef.current[d.gi].items.map((it) => it.id);
    setSaveState('saving');
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    queueRef.current = queueRef.current.then(async () => {
      try {
        const r = await saveProductOrder(tenantSlug, ids);
        setSaveState(r.ok ? 'saved' : 'error');
      } catch {
        setSaveState('error');
      }
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2000);
    });
  }

  // 拖曳中掛全域監聽(移動 / 放開 / 擋觸控捲動)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => moveDrag(e.clientX, e.clientY);
    const onUp = () => endDrag();
    const onTouchMove = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div>
      {/* 儲存狀態(固定右上,不佔版面) */}
      {saveState !== 'idle' && (
        <div
          style={{
            position: 'fixed',
            top: 14,
            right: 14,
            zIndex: 60,
            padding: '6px 14px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: saveState === 'error' ? '#fef2f2' : '#fff',
            border: `1px solid ${saveState === 'error' ? '#fecaca' : '#e4e4e7'}`,
            color: saveState === 'error' ? '#dc2626' : saveState === 'saved' ? '#16a34a' : '#71717a',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {saveState === 'saving' ? '儲存中…' : saveState === 'saved' ? '✓ 已儲存' : '儲存失敗,請再拖一次'}
        </div>
      )}

      {groups.map((g, gi) => (
        <section key={g.category} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', margin: '0 0 10px' }}>
            {g.category}
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#a1a1aa' }}>{g.items.length} 件</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 10 }}>
            {g.items.map((item) => {
              const isDrag = dragging?.id === item.id;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(item.id, el);
                    else cardRefs.current.delete(item.id);
                  }}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    const w = (e.currentTarget as HTMLDivElement).getBoundingClientRect().width;
                    const x = e.clientX;
                    const y = e.clientY;
                    if (e.pointerType === 'touch') {
                      pressStart.current = { x, y };
                      pressTimer.current = window.setTimeout(() => {
                        pressTimer.current = null;
                        startDrag(gi, item, x, y, w);
                      }, 220);
                    } else {
                      e.preventDefault();
                      startDrag(gi, item, x, y, w);
                    }
                  }}
                  onPointerMove={(e) => {
                    // 長按前移動超過 8px = 使用者在捲動,取消提起
                    if (pressTimer.current !== null && pressStart.current) {
                      const dx = e.clientX - pressStart.current.x;
                      const dy = e.clientY - pressStart.current.y;
                      if (dx * dx + dy * dy > 64) clearPressTimer();
                    }
                  }}
                  onPointerUp={clearPressTimer}
                  style={{
                    background: '#fff',
                    border: isDrag ? '1.5px dashed #a1a1aa' : '1px solid #e4e4e7',
                    borderRadius: 10,
                    overflow: 'hidden',
                    cursor: 'grab',
                    opacity: isDrag ? 0.35 : 1,
                    touchAction: 'pan-y',
                  }}
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      draggable={false}
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', fontSize: 11 }}>
                      無圖
                    </div>
                  )}
                  <div style={{ padding: '6px 8px 8px' }}>
                    <div style={{ fontSize: 12, lineHeight: 1.3, height: '2.6em', overflow: 'hidden', color: '#18181b' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#18181b', marginTop: 2 }}>
                      NT$ {item.price.toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* 跟著手指/滑鼠走的幽靈卡 */}
      {ghost && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: ghost.x - ghost.w / 2,
            top: ghost.y - 30,
            width: ghost.w,
            zIndex: 100,
            pointerEvents: 'none',
            background: '#fff',
            border: '1px solid #d4d4d8',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
            transform: 'rotate(2deg) scale(1.04)',
            opacity: 0.95,
          }}
        >
          {ghost.item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ghost.item.image} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f4f4f5' }} />
          )}
          <div style={{ padding: '6px 8px', fontSize: 12, lineHeight: 1.3, maxHeight: '2.6em', overflow: 'hidden' }}>
            {ghost.item.name}
          </div>
        </div>
      )}
    </div>
  );
}
