'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShopProduct } from './actions';

type Props = {
  product: ShopProduct;
  onClose: () => void; // 「返回」按鈕觸發
  onAdd: (productId: string, variantId: string, qty: number) => void;
};

/**
 * LIFF 商品 inline detail view(SPA 內切 full-page,不開 modal)。
 * 父層 /m/shop 在有 detailId 時隱藏 list,渲染此元件。
 *  - 多張圖橫滑(media image,fallback image_url)
 *  - 名稱 + 類別 + 描述
 *  - 多 variant 時顯示 chip 選擇
 *  - 數量 stepper
 *  - 加入購物車 CTA(成功後 onClose 自動回列表)
 */
export function ProductDetailModal({ product, onClose, onAdd }: Props) {
  const variants = product.variants;
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  const inStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 1;
  const hasMulti = variants.length > 1;

  // C#5(2026-09-02):media 圖 + 各規格圖聯集(去重,media 在前),可滑動
  const images = useMemo(() => {
    const arr: string[] = [];
    for (const m of product.media ?? []) {
      if (m.type === 'image' && !arr.includes(m.url)) arr.push(m.url);
    }
    for (const v of variants) {
      if (v.image_url && !arr.includes(v.image_url)) arr.push(v.image_url);
    }
    if (arr.length === 0 && product.image_url) arr.push(product.image_url);
    return arr;
  }, [product.media, product.image_url, variants]);

  function scrollToImg(i: number) {
    setImgIdx(i);
    const el = scrollerRef.current;
    const target = el?.children[i] as HTMLElement | undefined;
    if (el && target) el.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  }

  // 選規格 → 自動滑到該規格綁定的圖
  useEffect(() => {
    if (!selected?.image_url) return;
    const i = images.indexOf(selected.image_url);
    if (i >= 0) scrollToImg(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const price = selected?.price_twd ?? 0;
  const total = price * qty;

  // 進 detail view 時滾到頂
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [product.id]);

  // qty 超過庫存時 clamp
  useEffect(() => {
    if (qty > maxQty) setQty(maxQty || 1);
  }, [qty, maxQty]);

  function handleAdd() {
    if (!selected || !inStock) return;
    onAdd(product.id, selected.id, qty);
    onClose();
  }

  return (
    <section style={{ animation: 'shop-fadein 0.25s ease', paddingBottom: 100 }}>
      {/* ← 返回 + 標題列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="返回商品列表"
          style={{
            width: 36, height: 36, padding: 0,
            background: '#fff', border: '1px solid #e4e4e7',
            borderRadius: 8, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit',
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 13, color: '#71717a' }}>返回</span>
      </div>

      {/* Image carousel — C#5:scroll-snap 手指左右滑 */}
      {images.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <div
              ref={scrollerRef}
              onScroll={() => {
                const el = scrollerRef.current;
                if (!el || el.clientWidth === 0) return;
                const i = Math.round(el.scrollLeft / el.clientWidth);
                setImgIdx(Math.max(0, Math.min(images.length - 1, i)));
              }}
              style={{
                display: 'flex',
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                borderRadius: 10,
                scrollbarWidth: 'none',
              }}
            >
              {images.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt={`${product.name} ${i + 1}`}
                  style={{
                    flexShrink: 0,
                    width: '100%',
                    aspectRatio: '3 / 4',
                    objectFit: 'cover',
                    scrollSnapAlign: 'start',
                    display: 'block',
                    background: '#f4f4f5',
                  }}
                />
              ))}
            </div>
            {images.length > 1 && (
              <div
                style={{
                  position: 'absolute', top: 10, right: 10,
                  padding: '3px 10px', background: 'rgba(0,0,0,0.55)', color: '#fff',
                  borderRadius: 999, fontSize: 12, fontWeight: 600, pointerEvents: 'none',
                }}
              >
                {imgIdx + 1} / {images.length}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`切到第 ${i + 1} 張`}
                  onClick={() => scrollToImg(i)}
                  style={{
                    width: i === imgIdx ? 18 : 7, height: 7, borderRadius: 4, padding: 0,
                    background: i === imgIdx ? '#18181b' : '#d4d4d8',
                    border: 0, cursor: 'pointer',
                    transition: 'width 0.2s, background 0.2s',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '3 / 4',
            background: '#f4f4f5',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a1a1aa',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          無圖
        </div>
      )}

      {/* Name + Category + Description */}
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#18181b', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
        {product.name}
      </h1>
      {product.category && (
        <div style={{ fontSize: 13, color: '#a1a1aa', marginTop: 6 }}>{product.category}</div>
      )}
      {product.description && (
        <p
          style={{
            marginTop: 14, marginBottom: 0,
            fontSize: 14, color: '#52525b', lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}
        >
          {product.description}
        </p>
      )}

      {/* Variant chips(多 variant 才顯示) */}
      {hasMulti && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', marginBottom: 10 }}>規格</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {variants.map((v) => {
              const isOut = v.stock === 0;
              const isActive = selectedId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => !isOut && setSelectedId(v.id)}
                  disabled={isOut}
                  style={{
                    // 放大好按(2026-09-02):至少 44px 高的觸控目標
                    padding: '12px 20px',
                    minHeight: 44,
                    border: `1.5px solid ${isActive ? '#18181b' : '#d4d4d8'}`,
                    background: isActive ? '#18181b' : '#fff',
                    color: isActive ? '#fff' : isOut ? '#a1a1aa' : '#18181b',
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: isOut ? 'not-allowed' : 'pointer',
                    textDecoration: isOut ? 'line-through' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  {v.variant_name}{isOut ? ' (缺貨)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity stepper */}
      {inStock && (
        <div
          style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
          }}
        >
          <span style={{ fontSize: 14, color: '#18181b', fontWeight: 500 }}>數量</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              style={qtyBtnStyle}
            >
              −
            </button>
            {/* 可直接輸入數量(2026-09-02):買大量不用狂點 + */}
            <input
              type="number"
              min={1}
              max={maxQty}
              value={qty}
              inputMode="numeric"
              onChange={(ev) => {
                const v = parseInt(ev.target.value || '1', 10);
                if (!isNaN(v)) setQty(Math.max(1, Math.min(maxQty || 1, v)));
              }}
              style={{
                width: 64,
                textAlign: 'center',
                fontSize: 16,
                fontWeight: 600,
                border: '1px solid #e4e4e7',
                borderRadius: 8,
                padding: '8px 4px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty}
              style={qtyBtnStyle}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Sticky 底部:總價 + 加入購物車 */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e4e4e7',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#71717a' }}>總計</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#b45309', // 價格用暖棕突顯(2026-09-02),不跟一般文字混在一起
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                letterSpacing: '-0.01em',
              }}
            >
              NT$ {total.toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!inStock}
            style={{
              flex: 1.6,
              padding: '14px 20px',
              background: inStock ? '#18181b' : '#e4e4e7',
              color: inStock ? '#fff' : '#a1a1aa',
              border: 0,
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: inStock ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {inStock ? '加入購物車' : '缺貨'}
          </button>
        </div>
      </div>
    </section>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '1px solid #e4e4e7',
  background: '#fff',
  borderRadius: 8,
  fontSize: 18,
  color: '#18181b',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'inherit',
};
