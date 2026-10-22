'use client';

import { useEffect, useRef, useState } from 'react';

type BannerItem = { type: 'image' | 'video'; url: string };

/**
 * 公開頁 Hero Banner Carousel(Phase 9.8,2026-06-02;2026-10-23 樣式對齊新設計系統):
 * - CSS scroll-snap + touch swipe(無外部 lib)
 * - 影片 YouTube → iframe;自家 mp4 → <video autoplay muted loop>
 * - 點 dots / 左右箭頭切換
 * - 1 張時不顯示 nav
 * - 5 秒自動換頁(只圖片,影片不打斷)
 */
export function BannerHero({
  banners,
  tenantName,
}: {
  banners: BannerItem[];
  tenantName: string;
}) {
  const [idx, setIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollTo(i: number) {
    setIdx(i);
    const el = scrollerRef.current;
    if (!el) return;
    const target = el.children[i] as HTMLElement | undefined;
    if (target) {
      el.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    }
  }

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w === 0) return;
    const i = Math.round(el.scrollLeft / w);
    setIdx(Math.max(0, Math.min(banners.length - 1, i)));
  }

  // 自動播 5 秒(當前格是圖時)
  useEffect(() => {
    if (banners.length <= 1) return;
    const current = banners[idx];
    if (current.type !== 'image') return;
    const timer = setTimeout(() => {
      scrollTo((idx + 1) % banners.length);
    }, 5000);
    return () => clearTimeout(timer);
  }, [idx, banners]);

  const showNav = banners.length > 1;
  const arrow: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid var(--ui-line)',
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(6px)',
    color: 'var(--ui-ink)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    zIndex: 2,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          borderRadius: 8,
          border: '1px solid var(--ui-line)',
          background: 'var(--ui-line-soft)',
          scrollbarWidth: 'none',
        }}
      >
        {banners.map((b, i) => (
          <div
            key={`${b.url}-${i}`}
            style={{
              flexShrink: 0,
              width: '100%',
              aspectRatio: '4 / 3', // 2026-09-11:原 1200/630,依攤主需求改 4:3
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#000',
            }}
          >
            {renderBanner(b, tenantName)}
          </div>
        ))}
      </div>

      {showNav && idx > 0 && (
        <button type="button" onClick={() => scrollTo(idx - 1)} aria-label="上一張" style={{ ...arrow, left: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
        </button>
      )}
      {showNav && idx < banners.length - 1 && (
        <button type="button" onClick={() => scrollTo(idx + 1)} aria-label="下一張" style={{ ...arrow, right: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
        </button>
      )}

      {showNav && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 6,
            zIndex: 2,
          }}
        >
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`第 ${i + 1} 張`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: idx === i ? 'var(--ui-ink)' : 'rgba(255,255,255,0.75)',
                boxShadow: idx === i ? '0 0 0 1px #fff' : '0 0 0 1px rgba(0,0,0,0.15)',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function renderBanner(b: BannerItem, alt: string) {
  if (b.type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={b.url}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    );
  }
  const yt = parseYouTubeId(b.url);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${yt}&controls=0&rel=0`}
        title={alt}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    );
  }
  return (
    <video
      src={b.url}
      autoPlay
      muted
      loop
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
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
