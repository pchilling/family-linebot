'use client';

import { use } from 'react';
import { useCart } from '../cart-state';

type Props = {
  params: Promise<{ slug: string }>;
};

export default function CartPage({ params }: Props) {
  const { slug } = use(params);
  const { items, totalQty, totalTwd, updateQty, removeItem } = useCart(slug);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#6b7280' }}>
        <p style={{ fontSize: '1.125rem', margin: 0 }}>購物車是空的</p>
        <a
          href={`/${slug}`}
          style={{
            display: 'inline-block',
            marginTop: '1.5rem',
            padding: '0.75rem 1.5rem',
            background: '#1f2937',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: '0.9375rem',
          }}
        >
          繼續購物
        </a>
      </div>
    );
  }

  return (
    <div>
      <a
        href={`/${slug}`}
        style={{
          display: 'inline-block',
          marginBottom: '1.5rem',
          color: '#6b7280',
          textDecoration: 'none',
          fontSize: '0.875rem',
        }}
      >
        ← 繼續購物
      </a>

      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.375rem' }}>
        購物車 <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '1rem' }}>({totalQty} 件)</span>
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((item) => (
          <div
            key={item.variantId}
            style={{
              display: 'flex',
              gap: '0.875rem',
              padding: '1rem',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                flex: '0 0 80px',
                width: 80,
                height: 80,
                borderRadius: 6,
                overflow: 'hidden',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                fontSize: '0.75rem',
              }}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.productName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>無圖</span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                {item.productSlug ? (
                  <a
                    href={`/${slug}/p/${item.productSlug}`}
                    style={{
                      fontWeight: 500,
                      color: '#111827',
                      textDecoration: 'none',
                      lineHeight: 1.4,
                    }}
                  >
                    {item.productName}
                  </a>
                ) : (
                  <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{item.productName}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(item.variantId)}
                  aria-label="移除"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '1rem',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{item.variantName}</div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: '0.375rem',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => updateQty(item.variantId, item.qty - 1)}
                    style={{
                      width: 32,
                      height: 32,
                      background: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    −
                  </button>
                  <span
                    style={{
                      minWidth: 32,
                      textAlign: 'center',
                      fontSize: '0.9375rem',
                      fontWeight: 500,
                    }}
                  >
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(item.variantId, item.qty + 1)}
                    style={{
                      width: 32,
                      height: 32,
                      background: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontWeight: 600 }}>
                  NT$ {(item.priceTwd * item.qty).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1rem',
          }}
        >
          <span style={{ color: '#6b7280' }}>小計</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            NT$ {totalTwd.toLocaleString()}
          </span>
        </div>
        <a
          href={`/${slug}/checkout`}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '0.875rem',
            background: '#1f2937',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: '1rem',
            fontWeight: 500,
          }}
        >
          前往結帳
        </a>
        <p
          style={{
            margin: '0.75rem 0 0',
            color: '#9ca3af',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          下單後賣家會私訊匯款方式
        </p>
      </div>
    </div>
  );
}
