'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.375rem' }}>查我的訂單</h2>
      <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.6 }}>
        輸入下單時拿到的訂單編號 + 當時填的 Email 或電話。
      </p>

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
            style={inputStyle}
            placeholder="例:CY-202605-0001"
          />
        </div>

        <div style={{ fontSize: '0.8125rem', color: '#9ca3af', textAlign: 'center', margin: '0.5rem 0 -0.5rem' }}>
          下面兩項至少填一項
        </div>

        <div>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input id="email" name="email" type="email" style={inputStyle} placeholder="your@email.com" />
        </div>

        <div>
          <label htmlFor="phone" style={labelStyle}>電話</label>
          <input id="phone" name="phone" type="tel" style={inputStyle} placeholder="0900-000-000" />
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
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
            padding: '0.875rem',
            background: pending ? '#9ca3af' : '#1f2937',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: '1rem',
            fontWeight: 500,
            cursor: pending ? 'not-allowed' : 'pointer',
            marginTop: '0.5rem',
          }}
        >
          {pending ? '查詢中...' : '查訂單'}
        </button>
      </form>

      <p style={{ marginTop: '2rem', textAlign: 'center' }}>
        <a href={`/${slug}`} style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← 回攤位
        </a>
      </p>
    </div>
  );
}
