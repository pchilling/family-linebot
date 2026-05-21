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

type Props = {
  variants: Variant[];
  tenantSlug: string;
  productId: string;
  productSlug: string | null;
  productName: string;
  productCategory: string | null;
  productDescription: string | null;
  productImageUrl: string | null;
};

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
}: Props) {
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState<string>(firstInStock?.id ?? '');
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart(tenantSlug);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  // 圖 fallback 邏輯:variant 自己有就用,否則用 product 圖
  const displayImageUrl = selected?.image_url ?? productImageUrl;

  const selectedInStock = (selected?.stock ?? 0) > 0;

  function handleAdd() {
    if (!selected || !selectedInStock) return;
    addItem({
      variantId: selected.id,
      productId,
      productSlug,
      productName,
      variantName: selected.variant_name,
      priceTwd: selected.price_twd,
      qty: 1,
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
                    <span
                      style={{
                        color: variantInStock ? '#10b981' : '#ef4444',
                        fontSize: '0.75rem',
                      }}
                    >
                      {variantInStock ? `剩 ${v.stock} 件` : '售完'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {selected && (
            <>
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  {selected.variant_name}
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  NT$ {selected.price_twd.toLocaleString()}
                </span>
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
          aspectRatio: '4 / 5',
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
        aspectRatio: '4 / 5',
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
