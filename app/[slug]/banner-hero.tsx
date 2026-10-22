'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type BannerItem = { type: 'image' | 'video'; url: string };

/**
 * 公開頁 Hero Banner(Phase 9.8,2026-06-02;2026-10-23 改 coverflow 輪播):
 * - 中間一張正面,兩側各一張斜著往後退(3D rotateY + translateZ),像 iTunes 封面流。
 *   4:3 的圖不裁、不滿版,電腦版不會一整屏都是圖。
 * - 拖曳 / 甩動 / 左右箭頭 / 鍵盤方向鍵 / 點側邊那張 都可切換;環狀循環不複製 DOM。
 * - 影片 YouTube → iframe;自家 mp4 → <video autoplay muted loop>;側邊的影片不吃滑鼠。
 * - 5 秒自動換頁(當前是圖片時),1 張時不顯示 nav。
 * - 位置算法移植自 shadcn 社群的 coverflow-carousel,改成不依賴 Tailwind。
 */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const ROTATE = 44; // 第一張鄰居的傾斜角度
const DEPTH = 0.6; // 第一張鄰居往後退多少(卡片寬的倍數)
const PERSPECTIVE = 3; // 視距(卡片寬的倍數),越小鏡頭越廣
const FALLOFF = 0.56; // 距離的指數,<1 代表越遠變化越緩
const FADE = 0.12; // 每離中心一格少掉的不透明度
const GAP = 0.06; // 卡片間距(卡片寬的倍數)

const CSS = `
.bh{position:relative;--bh-card:clamp(240px,78vw,600px)}
.bh-frame{overflow:hidden;padding:24px 0 44px;outline:none;cursor:grab;touch-action:pan-y;perspective:calc(var(--bh-card) * ${PERSPECTIVE})}
.bh-frame:active{cursor:grabbing}
.bh-frame:focus-visible{border-radius:10px;box-shadow:inset 0 0 0 2px var(--ui-accent)}
.bh-track{position:relative;height:calc(var(--bh-card) * 3 / 4);transform-style:preserve-3d;user-select:none;-webkit-user-select:none}
.bh-card{position:absolute;left:50%;top:0;width:var(--bh-card);aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:#000;border:1px solid var(--ui-line);box-shadow:0 10px 28px rgba(0,0,0,.14);will-change:transform,opacity}
.bh-card img,.bh-card video,.bh-card iframe{width:100%;height:100%;object-fit:cover;display:block;border:0}
.bh-card[data-side="true"]{cursor:pointer}
.bh-card[data-side="true"] iframe,.bh-card[data-side="true"] video{pointer-events:none}
.bh-dots{display:flex;justify-content:center;gap:6px;margin-top:-8px}
.bh-dot{width:8px;height:8px;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--ui-ink);opacity:.25;transition:opacity .2s}
.bh-dot[aria-current="true"]{opacity:1}
@media (max-width:1024px){.bh-frame{padding:12px 0 32px}.bh-card{box-shadow:0 6px 18px rgba(0,0,0,.14)}.bh-dots{margin-top:-4px}}
`;

/** 某張卡離中心 offset 格時的 transform / 透明度;寬度用 CSS 變數算,SSR 第一次就能排對位置 */
function layoutOf(offset: number, count: number, loop: boolean) {
  const distance = Math.abs(offset);
  const ramp = Math.pow(distance, FALLOFF);
  const tilt = Math.min(ROTATE * ramp, 82) * Math.sign(offset);
  // 環狀時卡片會在剛好半圈處瞬移到另一邊,所以到那之前要先淡出
  const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1;
  return {
    transform:
      `translateX(calc(-50% + ${(offset * (1 + GAP)).toFixed(4)} * var(--bh-card))) ` +
      `translateZ(calc(${(-DEPTH * ramp).toFixed(4)} * var(--bh-card))) rotateY(${(-tilt).toFixed(2)}deg)`,
    opacity: String(Math.max(0, 1 - FADE * distance) * edge),
    zIndex: String(100 - Math.round(distance)),
  };
}

function foldOffset(index: number, pos: number, count: number, loop: boolean) {
  let offset = index - pos;
  if (loop) {
    offset = ((offset % count) + count) % count;
    if (offset > count / 2) offset -= count;
  }
  return offset;
}

export function BannerHero({ banners, tenantName }: { banners: BannerItem[]; tenantName: string }) {
  const count = banners.length;
  const loop = count > 1;

  const frameRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(0); // 中心目前落在第幾張(可為小數),唯一的真實狀態
  const targetRef = useRef(0); // 這次滑動要停在哪
  const widthRef = useRef(0); // 卡片實際寬(px),只有拖曳換算要用
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: number; x: number; pos: number; v: number; t: number; moved: boolean } | null>(null);
  const [selected, setSelected] = useState(0);

  const indexAt = useCallback((pos: number) => ((Math.round(pos) % count) + count) % count, [count]);

  // 直接寫 DOM,不走 React state:一秒 60 次 re-render 沒必要
  const paint = useCallback(() => {
    const pos = posRef.current;
    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const l = layoutOf(foldOffset(index, pos, count, loop), count, loop);
      card.style.transform = l.transform;
      card.style.opacity = l.opacity;
      card.style.zIndex = l.zIndex;
    });
  }, [count, loop]);

  const clamp = useCallback((pos: number) => (loop ? pos : Math.max(0, Math.min(count - 1, pos))), [count, loop]);

  const settle = useCallback(
    (target: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      targetRef.current = target;
      setSelected(indexAt(target));
      const step = () => {
        const remaining = target - posRef.current;
        if (Math.abs(remaining) < 0.0004) {
          posRef.current = target;
          paint();
          rafRef.current = null;
          return;
        }
        posRef.current += remaining * 0.16; // 指數緩出
        paint();
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [indexAt, paint],
  );

  const goTo = useCallback(
    (index: number) => {
      // 環狀時走近的那一邊,不要整圈倒回去
      const target = loop ? index + Math.round((targetRef.current - index) / count) * count : index;
      settle(clamp(target));
    },
    [clamp, count, loop, settle],
  );

  const nudge = useCallback((by: number) => settle(clamp(Math.round(targetRef.current) + by)), [clamp, settle]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (count <= 1) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    targetRef.current = posRef.current;
    dragRef.current = { id: e.pointerId, x: e.clientX, pos: posRef.current, v: 0, t: performance.now(), moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const pitch = widthRef.current * (1 + GAP);
    if (!pitch) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    const now = performance.now();
    const previous = posRef.current;
    posRef.current = clamp(drag.pos - dx / pitch);
    drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000; // 每秒幾張,給甩動用
    drag.t = now;
    const index = indexAt(posRef.current);
    if (index !== selected) setSelected(index);
    paint();
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) {
      // 沒拖動 = 點擊:點到側邊那張就切過去
      const target = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
      const idx = target ? Number(target.dataset.index) : NaN;
      if (!Number.isNaN(idx) && idx !== selected) goTo(idx);
      else settle(clamp(Math.round(posRef.current)));
      return;
    }
    const carried = Math.max(-2, Math.min(2, drag.v * 0.18)); // 甩動最多帶兩張
    settle(clamp(Math.round(posRef.current + carried)));
  }

  // 只量卡片寬(拖曳要把 px 換成「幾張」),尺寸變了再量
  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const card = cardRefs.current[0];
      if (!card) return;
      widthRef.current = card.offsetWidth;
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [paint]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // 自動播 5 秒(當前是圖片時);使用者切換後重新計時
  useEffect(() => {
    if (count <= 1) return;
    if (banners[selected]?.type !== 'image') return;
    const timer = setTimeout(() => {
      if (dragRef.current) return;
      nudge(1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [selected, banners, count, nudge]);

  const showNav = count > 1;

  return (
    <div className="bh" role="region" aria-roledescription="carousel" aria-label={`${tenantName} 活動看板`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div
        ref={frameRef}
        className="bh-frame"
        tabIndex={showNav ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(1);
          }
        }}
      >
        <div className="bh-track">
          {banners.map((b, i) => {
            const initial = layoutOf(foldOffset(i, 0, count, loop), count, loop);
            return (
              <div
                key={`${b.url}-${i}`}
                ref={(node) => {
                  cardRefs.current[i] = node;
                }}
                className="bh-card"
                data-index={i}
                data-side={i !== selected ? 'true' : 'false'}
                role="group"
                aria-roledescription="slide"
                aria-label={`第 ${i + 1} 張,共 ${count} 張`}
                style={{ transform: initial.transform, opacity: Number(initial.opacity), zIndex: Number(initial.zIndex) }}
              >
                {renderBanner(b, tenantName)}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2026-10-23:不放左右箭頭,自動跑;要切就拖曳、點側邊那張、點點點、或鍵盤左右 */}
      {showNav && (
        <>
          <div className="bh-dots">
            {banners.map((_, i) => (
              <button key={i} type="button" className="bh-dot" aria-label={`第 ${i + 1} 張`} aria-current={i === selected ? 'true' : undefined} onClick={() => goTo(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function renderBanner(b: BannerItem, alt: string) {
  if (b.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.url} alt={alt} draggable={false} />;
  }
  const yt = parseYouTubeId(b.url);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${yt}&controls=0&rel=0`}
        title={alt}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <video src={b.url} autoPlay muted loop playsInline />;
}

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}
