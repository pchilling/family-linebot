'use client';

import { useEffect, useRef, useState } from 'react';

type BannerItem = { type: 'image' | 'video'; url: string };

/**
 * 公開頁 Hero Banner Carousel(Phase 9.8,2026-06-02):
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
          borderRadius: 12,
          background: '#000',
          scrollbarWidth: 'none',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04)',
        }}
      >
        {banners.map((b, i) => (
          <div
            key={`${b.url}-${i}`}
            style={{
              flexShrink: 0,
              width: '100%',
              aspectRatio: '1200 / 630',
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
        <button
          type="button"
          onClick={() => scrollTo(idx - 1)}
          aria-label="上一張"
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          ‹
        </button>
      )}
      {showNav && idx < banners.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(idx + 1)}
          aria-label="下一張"
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          ›
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
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 999,
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
                width: idx === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: idx === i ? '#fff' : 'rgba(255,255,255,0.55)',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                transition: 'width 0.2s, background 0.2s',
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
