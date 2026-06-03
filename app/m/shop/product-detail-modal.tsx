'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ShopProduct } from './actions';

type Props = {
  product: ShopProduct;
  onClose: () => void;
  onAdd: (productId: string, variantId: string, qty: number) => void;
};

/**
 * LIFF 商品 inline detail panel(slide-up modal)。
 *  - 多張圖橫滑(media image,fallback image_url)
 *  - 名稱 + 描述
 *  - 多 variant 時顯示 chip 選擇
 *  - 數量 stepper
 *  - 加入購物車 CTA(成功後關閉 modal)
 */
export function ProductDetailModal({ product, onClose, onAdd }: Props) {
  const variants = product.variants;
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  const inStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 1;
  const hasMulti = variants.length > 1;

  // 圖:media image 優先,fallback image_url
  const images = useMemo(() => {
    const arr: string[] = [];
    for (const m of product.media ?? []) {
      if (m.type === 'image') arr.push(m.url);
    }
    if (arr.length === 0 && product.image_url) arr.push(product.image_url);
    return arr;
  }, [product.media, product.image_url]);

  const price = selected?.price_twd ?? 0;
  const total = price * qty;

  // Esc 關閉 + 鎖背景滾動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes detail-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes detail-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
          `,
        }}
      />
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          animation: 'detail-fade-in 0.2s ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 480,
            background: '#fff',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: 16,
            animation: 'detail-slide-up 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* drag handle + close */}
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <div
              style={{
                width: 36, height: 4, borderRadius: 2,
                background: '#d4d4d8', margin: '0 auto',
              }}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉"
              style={{
                position: 'absolute', top: -4, right: 0,
                width: 32, height: 32,
                background: 'transparent', border: 0,
                fontSize: 20, color: '#52525b', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>

          {/* Image carousel */}
          {images.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[imgIdx]}
                alt={product.name}
                style={{
                  width: '100%',
                  aspectRatio: '3 / 4',
                  objectFit: 'cover',
                  borderRadius: 8,
                  display: 'block',
                  background: '#f4f4f5',
                }}
              />
              {images.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`切到第 ${i + 1} 張`}
                      onClick={() => setImgIdx(i)}
                      style={{
                        width: 7, height: 7, borderRadius: '50%', padding: 0,
                        background: i === imgIdx ? '#18181b' : '#d4d4d8',
                        border: 0, cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Name + Category + Description */}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#18181b', lineHeight: 1.3 }}>
            {product.name}
          </h2>
          {product.category && (
            <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>{product.category}</div>
          )}
          {product.description && (
            <p
              style={{
                marginTop: 12, marginBottom: 0,
                fontSize: 13, color: '#52525b', lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {product.description}
            </p>
          )}

          {/* Variant chips(多 variant 才顯示) */}
          {hasMulti && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#52525b', marginBottom: 8 }}>規格</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                        padding: '7px 14px',
                        border: `1px solid ${isActive ? '#18181b' : '#e4e4e7'}`,
                        background: isActive ? '#18181b' : '#fff',
                        color: isActive ? '#fff' : isOut ? '#a1a1aa' : '#18181b',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
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
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 13, color: '#52525b' }}>數量</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  style={qtyBtnStyle}
                >
                  −
                </button>
                <span style={{ minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: 500 }}>
                  {qty}
                </span>
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

          {/* Footer:總價 + 加入購物車 */}
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingTop: 14,
              borderTop: '1px solid #f4f4f5',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#71717a' }}>總計</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#18181b',
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
                padding: '13px 18px',
                background: inStock ? '#18181b' : '#e4e4e7',
                color: inStock ? '#fff' : '#a1a1aa',
                border: 0,
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: inStock ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {inStock ? '加入購物車' : '缺貨'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid #e4e4e7',
  background: '#fff',
  borderRadius: 8,
  fontSize: 16,
  color: '#18181b',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'inherit',
};
