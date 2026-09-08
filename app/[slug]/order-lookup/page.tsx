'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconReceipt } from '@/lib/icons';
import { lookupOrder } from './actions';

type Props = {
  params: Promise<{ slug: string }>;
};

export default function OrderLookupPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.append('tenantSlug', slug);
    const result = await lookupOrder(formData);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(`/${slug}/order/${result.orderNo}`);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: '0.9375rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.375rem',
  };

  return (
    <div style={{ maxWidth: 460, margin: '2rem auto 0' }}>
      {/* 2026-09-08 改版:白卡 + icon 磚,對齊訂單頁的設計語言 */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 14,
          padding: '1.75rem 1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#eff6ff',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconReceipt size={22} />
          </span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>查我的訂單</h2>
            <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: '0.8125rem' }}>
              訂單編號在下單完成頁與通知訊息裡
            </p>
          </div>
        </div>

        <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="order_no" style={labelStyle}>
              訂單編號 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="order_no"
              name="order_no"
              type="text"
              required
              style={{
                ...inputStyle,
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                letterSpacing: '0.05em',
                padding: '0.75rem',
              }}
              placeholder="OW-202609-0001"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0.25rem 0' }}>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
              以下擇一填寫,核對身分用
            </span>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <div>
            <label htmlFor="phone" style={labelStyle}>電話</label>
            <input id="phone" name="phone" type="tel" style={inputStyle} placeholder="0900-000-000" />
          </div>

          <div>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input id="email" name="email" type="email" style={inputStyle} placeholder="your@email.com" />
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              minHeight: 48,
              padding: '0.75rem',
              background: pending ? '#9ca3af' : '#111827',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: pending ? 'not-allowed' : 'pointer',
              marginTop: '0.25rem',
            }}
          >
            {pending ? '查詢中…' : '查詢訂單'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <a href={`/${slug}`} style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← 回攤位
        </a>
      </p>
    </div>
  );
}
