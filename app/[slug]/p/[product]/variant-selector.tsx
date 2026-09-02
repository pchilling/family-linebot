'use client';

import { useEffect, useState, useRef } from 'react';
import { useCart } from '../../cart-state';

// 本地 type 避免 client component 從 server-only module(supabaseAdmin)拉 runtime
type Variant = {
  id: string;
  sku: string;
  variant_name: string;
  attributes: Record<string, unknown> | null;
  price_twd: number;
  stock: number;
  image_url: string | null;
  status: string;
};

type TierLite = { min_qty: number; price_twd: number };
type MediaItem = { type: 'image' | 'video'; url: string };
type SaleInfo = { discountPct: number; startAt: string; endAt: string };

type Props = {
  variants: Variant[];
  tenantSlug: string;
  productId: string;
  productSlug: string | null;
  productName: string;
  productCategory: string | null;
  productDescription: string | null;
  productImageUrl: string | null;
  productMedia?: MediaItem[];
  tiers?: TierLite[]; // 已 min_qty asc 排序
  sale?: SaleInfo | null; // Phase 9.9:限時優惠
};

function pickTierPrice(tiers: TierLite[], qty: number, base: number): number {
  let pick = base;
  for (const t of tiers) {
    if (qty >= t.min_qty) pick = t.price_twd;
    else break;
  }
  return pick;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '已結束';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days} 天 ${hrs} 小時 ${mins} 分`;
  if (hrs > 0) return `${hrs} 小時 ${mins} 分 ${secs} 秒`;
  return `${mins} 分 ${secs} 秒`;
}

/**
 * 商品詳情完整 client gallery:
 *   單欄佈局(行動裝置友善):
 *     1. 圖(會跟著 variant 換 — 用 variant.image_url 或 fallback product.image_url)
 *     2. 商品名 / 類別 / 描述
 *     3. 變體選擇器(radio)
 *     4. 價格 summary
 *     5. 加入購物車 CTA
 */
export function VariantSelector({
  variants,
  tenantSlug,
  productId,
  productSlug,
  productName,
  productCategory,
  productDescription,
  productImageUrl,
  productMedia = [],
  tiers = [],
  sale = null,
}: Props) {
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState<string>(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart(tenantSlug);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  // 圖 fallback 邏輯:
  // - 有 productMedia → 用 carousel
  // - 沒 media → variant.image_url > product.image_url
  const displayImageUrl = selected?.image_url ?? productImageUrl;
  const useMediaCarousel = productMedia.length > 0;

  const selectedInStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 0;

  // Phase 9.9:sale 倒數 + 是否生效
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sale) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sale]);
  const saleStart = sale ? new Date(sale.startAt).getTime() : 0;
  const saleEnd = sale ? new Date(sale.endAt).getTime() : 0;
  const saleActive = !!sale && now >= saleStart && now < saleEnd;
  const saleCountdown = saleActive ? formatCountdown(saleEnd - now) : null;

  // 算單價:sale 生效 → 用 % off 比例縮;否則 tier
  const basePrice = selected?.price_twd ?? 0;
  const saleUnitPrice = saleActive
    ? Math.round((basePrice * (100 - sale!.discountPct)) / 100)
    : basePrice;
  const effectivePrice = saleActive ? saleUnitPrice : pickTierPrice(tiers, qty, basePrice);
  const savedPerUnit = basePrice - effectivePrice;
  const totalPrice = effectivePrice * qty;

  function adjustQty(delta: number) {
    setQty((q) => Math.max(1, Math.min(maxQty || 1, q + delta)));
  }

  function handleAdd() {
    if (!selected || !selectedInStock) return;
    addItem({
      variantId: selected.id,
      productId,
      productSlug,
      productName,
      variantName: selected.variant_name,
      priceTwd: effectivePrice,
      qty,
      imageUrl:
        selected.image_url ??
        productMedia.find((m) => m.type === 'image')?.url ??
        productImageUrl,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {useMediaCarousel ? (
        <MediaCarousel media={productMedia} alt={productName} />
      ) : (
        <ProductImage src={displayImageUrl} alt={productName} />
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.375rem', fontSize: '1.5rem', lineHeight: 1.3 }}>
          {productName}
        </h2>
        {productCategory && (
          <div
            style={{
              color: '#9ca3af',
              fontSize: '0.8125rem',
              marginBottom: '0.875rem',
            }}
          >
            {productCategory}
          </div>
        )}
        {productDescription && (
          <p
            style={{
              color: '#374151',
              lineHeight: 1.65,
              marginBottom: '1.5rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {productDescription}
          </p>
        )}
      </div>

      {variants.length === 0 ? (
        <div
          style={{
            color: '#9ca3af',
            fontStyle: 'italic',
            padding: '1rem 0',
          }}
        >
          無可選規格
        </div>
      ) : (
        <>
          <div
            style={{
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            選擇規格
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              marginBottom: '1.5rem',
            }}
          >
            {variants.map((v) => {
              const isSelected = v.id === selectedId;
              const variantInStock = v.stock > 0;
              return (
                <label
                  key={v.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    border: `1px solid ${isSelected ? '#1f2937' : '#e5e7eb'}`,
                    borderRadius: 6,
                    cursor: variantInStock ? 'pointer' : 'not-allowed',
                    opacity: variantInStock ? 1 : 0.55,
                    background: isSelected ? '#f9fafb' : '#fff',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="radio"
                      name="variant"
                      value={v.id}
                      checked={isSelected}
                      onChange={() => variantInStock && setSelectedId(v.id)}
                      disabled={!variantInStock}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontWeight: 500 }}>{v.variant_name}</span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span>NT$ {v.price_twd.toLocaleString()}</span>
                    {!variantInStock && (
                      <span
                        style={{
                          color: '#ef4444',
                          fontSize: '0.75rem',
                        }}
                      >
                        售完
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {selected && (
            <>
              {/* Phase 9.9:Sale banner + 倒數 */}
              {saleActive && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.875rem 1rem',
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>
                      {/* 2026-09-03:改台灣「折」講法 */}
                      🔥 限時{(() => { const k = 100 - sale!.discountPct; return `${k % 10 === 0 ? k / 10 : k}折`; })()}(全規格)
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: '#9ca3af',
                        textDecoration: 'line-through',
                      }}
                    >
                      原價 NT$ {basePrice.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>
                      NT$ {saleUnitPrice.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#991b1b' }}>
                    ⏰ 剩餘 <strong>{saleCountdown}</strong>
                  </div>
                </div>
              )}

              {/* Tier pills 可點(量大優惠)— sale 生效時暫停 */}
              {!saleActive && tiers.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: '#15803d',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    ⚡ 一次買多更便宜
                    {(() => {
                      // 找下一個還沒達到的 tier,提示「再買 N 件省更多」
                      const next = tiers.find((t) => qty < t.min_qty);
                      if (!next) return null;
                      const diff = next.min_qty - qty;
                      return (
                        <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.75rem' }}>
                          · 再買 {diff} 件 → NT$ {next.price_twd.toLocaleString()}/件
                        </span>
                      );
                    })()}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      paddingBottom: 4,
                    }}
                  >
                    {tiers.map((t) => {
                      const isActive = qty >= t.min_qty && (effectivePrice === t.price_twd);
                      const saving = basePrice - t.price_twd;
                      return (
                        <button
                          key={t.min_qty}
                          type="button"
                          onClick={() => setQty(Math.min(t.min_qty, maxQty || t.min_qty))}
                          style={{
                            flexShrink: 0,
                            minWidth: 100,
                            padding: '10px 14px',
                            background: isActive ? '#05C878' : '#fff',
                            color: isActive ? '#fff' : '#15803d',
                            border: `1.5px solid ${isActive ? '#05C878' : '#bbf7d0'}`,
                            borderRadius: 10,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                            transition: 'background 0.15s, border-color 0.15s',
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            {t.min_qty}+ 件
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-geist-mono), monospace' }}>
                            NT$ {t.price_twd.toLocaleString()}
                          </span>
                          {saving > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: isActive ? 'rgba(255,255,255,0.85)' : '#16a34a',
                              }}
                            >
                              {isActive ? '✓ 已套用' : `省 NT$ ${saving.toLocaleString()}/件`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Qty 選擇 */}
              <div
                style={{
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
                  數量
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustQty(-1)}
                    disabled={qty <= 1}
                    style={{
                      padding: '8px 14px',
                      background: '#fff',
                      border: 0,
                      cursor: qty <= 1 ? 'not-allowed' : 'pointer',
                      color: qty <= 1 ? '#d1d5db' : '#374151',
                      fontSize: 18,
                      fontFamily: 'inherit',
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxQty || 1}
                    value={qty}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '1', 10);
                      if (!isNaN(v)) setQty(Math.max(1, Math.min(maxQty || 1, v)));
                    }}
                    style={{
                      width: 60,
                      textAlign: 'center',
                      border: 0,
                      borderLeft: '1px solid #e5e7eb',
                      borderRight: '1px solid #e5e7eb',
                      padding: '8px 4px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => adjustQty(1)}
                    disabled={qty >= maxQty}
                    style={{
                      padding: '8px 14px',
                      background: '#fff',
                      border: 0,
                      cursor: qty >= maxQty ? 'not-allowed' : 'pointer',
                      color: qty >= maxQty ? '#d1d5db' : '#374151',
                      fontSize: 18,
                      fontFamily: 'inherit',
                    }}
                  >
                    ＋
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {selected.variant_name} × {qty}
                  </span>
                  {/* 價格用暖棕突顯(2026-09-02);有折扣時維持綠色強調省錢 */}
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: savedPerUnit > 0 ? '#15803d' : '#b45309' }}>
                    NT$ {totalPrice.toLocaleString()}
                  </span>
                </div>
                {savedPerUnit > 0 && (
                  <div style={{ fontSize: 12, color: '#16a34a' }}>
                    單價 NT$ {effectivePrice.toLocaleString()}({savedPerUnit > 0 ? `較原價省 NT$ ${savedPerUnit.toLocaleString()} / 件` : ''})
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedInStock}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: justAdded ? '#10b981' : selectedInStock ? '#1f2937' : '#e5e7eb',
                  color: selectedInStock ? '#fff' : '#6b7280',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '1rem',
                  fontWeight: 500,
                  cursor: selectedInStock ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                {justAdded
                  ? '✓ 已加入購物車'
                  : selectedInStock
                    ? '加入購物車'
                    : '此規格已售完'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Phase 9.6/9.7:multi-media carousel
 * - CSS scroll-snap + touch swipe(無外部 lib)
 * - 影片:YouTube URL embed iframe / Supabase MP4 用 <video>
 * - 下方圓點 + 點點切換
 */
function MediaCarousel({ media, alt }: { media: MediaItem[]; alt: string }) {
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
    setIdx(Math.max(0, Math.min(media.length - 1, i)));
  }

  const showArrows = media.length > 1;

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
          background: '#000',
          scrollbarWidth: 'none',
        }}
      >
        {media.map((m, i) => (
          <div
            key={`${m.url}-${i}`}
            style={{
              flexShrink: 0,
              width: '100%',
              aspectRatio: '3 / 4',
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#000',
            }}
          >
            {renderMediaItem(m, alt)}
          </div>
        ))}
      </div>

      {/* 箭頭(避免影片吃 swipe)*/}
      {showArrows && idx > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(idx - 1)}
          aria-label="上一張"
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            zIndex: 2,
          }}
        >
          ‹
        </button>
      )}
      {showArrows && idx < media.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(idx + 1)}
          aria-label="下一張"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            zIndex: 2,
          }}
        >
          ›
        </button>
      )}

      {/* 右上角計數(1/3 之類)*/}
      {showArrows && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            backdropFilter: 'blur(4px)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {idx + 1} / {media.length}
        </div>
      )}

      {/* Dots */}
      {media.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginTop: 10,
          }}
        >
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`第 ${i + 1} 張`}
              style={{
                width: idx === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: idx === i ? '#1f2937' : '#d1d5db',
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

function renderMediaItem(m: MediaItem, alt: string) {
  if (m.type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={m.url}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    );
  }
  // video
  const yt = parseYouTubeId(m.url);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?autoplay=0&mute=1&playsinline=1&rel=0`}
        title={alt}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    );
  }
  return (
    <video
      src={m.url}
      controls
      muted
      loop
      playsInline
      autoPlay
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

function parseYouTubeId(url: string): string | null {
  // youtu.be/xxx / youtube.com/watch?v=xxx / youtube.com/shorts/xxx / youtube.com/embed/xxx
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

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          aspectRatio: '3 / 4',
          objectFit: 'cover',
          borderRadius: 8,
          display: 'block',
          transition: 'opacity 0.2s',
        }}
      />
    );
  }
  return (
    <div
      style={{
        aspectRatio: '3 / 4',
        background: '#f3f4f6',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
      }}
    >
      無圖
    </div>
  );
}
