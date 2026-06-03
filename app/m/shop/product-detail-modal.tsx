'use client';

import { useEffect, useMemo, useState } from 'react';
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

      {/* Image carousel */}
      {images.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[imgIdx]}
            alt={product.name}
            style={{
              width: '100%',
              aspectRatio: '3 / 4',
              objectFit: 'cover',
              borderRadius: 10,
              display: 'block',
              background: '#f4f4f5',
            }}
          />
          {images.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
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
                    padding: '9px 16px',
                    border: `1px solid ${isActive ? '#18181b' : '#e4e4e7'}`,
                    background: isActive ? '#18181b' : '#fff',
                    color: isActive ? '#fff' : isOut ? '#a1a1aa' : '#18181b',
                    borderRadius: 8,
                    fontSize: 13,
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
            <span style={{ minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>
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
