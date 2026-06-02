'use client';

import { useState } from 'react';
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

type Props = {
  variants: Variant[];
  tenantSlug: string;
  productId: string;
  productSlug: string | null;
  productName: string;
  productCategory: string | null;
  productDescription: string | null;
  productImageUrl: string | null;
  tiers?: TierLite[]; // 已 min_qty asc 排序
};

function pickTierPrice(tiers: TierLite[], qty: number, base: number): number {
  let pick = base;
  for (const t of tiers) {
    if (qty >= t.min_qty) pick = t.price_twd;
    else break;
  }
  return pick;
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
  tiers = [],
}: Props) {
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState<string>(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart(tenantSlug);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  // 圖 fallback 邏輯:variant 自己有就用,否則用 product 圖
  const displayImageUrl = selected?.image_url ?? productImageUrl;

  const selectedInStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 0;

  // 即時算 tier 單價
  const basePrice = selected?.price_twd ?? 0;
  const effectivePrice = pickTierPrice(tiers, qty, basePrice);
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
      imageUrl: selected.image_url ?? productImageUrl,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <ProductImage src={displayImageUrl} alt={productName} />

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
              {/* Tier pills 可點(量大優惠)— Phase 9.5 / Option A */}
              {tiers.length > 0 && (
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
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: savedPerUnit > 0 ? '#15803d' : '#1f2937' }}>
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
