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
  productImageUrl: string | null;
};

export function VariantSelector({
  variants,
  tenantSlug,
  productId,
  productSlug,
  productName,
  productImageUrl,
}: Props) {
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState<string>(firstInStock?.id ?? '');
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart(tenantSlug);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  if (!selected) return null;

  const selectedInStock = selected.stock > 0;

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
    <div>
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
    </div>
  );
}
