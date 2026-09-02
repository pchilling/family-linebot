'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../cart-state';
import { createOrder, getShippingOptions, type ShippingOption } from './actions';

type Props = {
  params: Promise<{ slug: string }>;
};

export default function CheckoutPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const { items, totalQty, totalTwd, clear } = useCart(slug);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D#13:攤位運費規則(空陣列 = 不收運費,不顯示配送選項)
  const [shipOptions, setShipOptions] = useState<ShippingOption[]>([]);
  const [shipKey, setShipKey] = useState('');
  useEffect(() => {
    getShippingOptions(slug).then(setShipOptions).catch(() => {});
  }, [slug]);

  const shipOption = shipOptions.find((o) => o.key === shipKey) ?? null;
  const shipFee = shipOption
    ? shipOption.free_over && totalTwd >= shipOption.free_over
      ? 0
      : shipOption.fee
    : 0;
  const grandTotal = totalTwd + shipFee;

  // 已成立 → 顯 loading 直到 router.push 真的跳完(避免閃空車畫面 / 空表單)
  if (redirecting) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#374151' }}>
        <p style={{ fontSize: '1.125rem', margin: 0 }}>訂單已成立,跳轉中...</p>
      </div>
    );
  }

  // 送出中 cart 被 clear() 清空時不要 flash 空車畫面(router.push 還沒導航完)
  if (items.length === 0 && !submitting) {
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

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    formData.append('tenantSlug', slug);
    formData.append('cartItems', JSON.stringify(items));
    const result = await createOrder(formData);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setRedirecting(true); // 馬上切到 loading 畫面,避免接下來 clear() 觸發空車閃屏
    clear();
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
    <div>
      <a
        href={`/${slug}/cart`}
        style={{
          display: 'inline-block',
          marginBottom: '1.5rem',
          color: '#6b7280',
          textDecoration: 'none',
          fontSize: '0.875rem',
        }}
      >
        ← 回購物車
      </a>

      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.375rem' }}>結帳</h2>

      <div
        style={{
          padding: '1rem 1.25rem',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.75rem', color: '#374151' }}>
          訂單摘要({totalQty} 件)
        </div>
        {items.map((item) => (
          <div
            key={item.variantId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              padding: '0.375rem 0',
              color: '#374151',
            }}
          >
            <span style={{ flex: 1, paddingRight: '0.5rem' }}>
              {item.productName}
              <span style={{ color: '#9ca3af' }}> · {item.variantName} × {item.qty}</span>
            </span>
            <span>NT$ {(item.priceTwd * item.qty).toLocaleString()}</span>
          </div>
        ))}
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#374151' }}>
            <span>商品小計</span>
            <span>NT$ {totalTwd.toLocaleString()}</span>
          </div>
          {shipOptions.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#374151' }}>
              <span>運費{shipOption ? `(${shipOption.label})` : ''}</span>
              <span style={{ color: shipOption && shipFee === 0 ? '#15803d' : undefined }}>
                {shipOption ? (shipFee === 0 ? '免運 🎉' : `NT$ ${shipFee.toLocaleString()}`) : '請選配送方式'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>合計</span>
            <span style={{ color: '#b45309' }}>NT$ {grandTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* D#13:配送方式(攤位有設運費規則才顯示) */}
        {shipOptions.length > 0 && (
          <div>
            <span style={labelStyle}>
              配送方式 <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {shipOptions.map((opt) => {
                const isFree = !!opt.free_over && totalTwd >= opt.free_over;
                const isActive = shipKey === opt.key;
                return (
                  <label
                    key={opt.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.625rem',
                      padding: '0.75rem 0.875rem',
                      border: `1.5px solid ${isActive ? '#1f2937' : '#e5e7eb'}`,
                      borderRadius: 8,
                      background: isActive ? '#f9fafb' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="shipping_method"
                      value={opt.key}
                      required
                      checked={isActive}
                      onChange={() => setShipKey(opt.key)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>
                        <span>{opt.label}</span>
                        <span style={{ color: isFree || opt.fee === 0 ? '#15803d' : '#1f2937' }}>
                          {opt.fee === 0 ? '免運費' : isFree ? '免運 🎉' : `NT$ ${opt.fee}`}
                        </span>
                      </span>
                      {opt.free_over ? (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: isFree ? '#15803d' : '#6b7280', marginTop: 3 }}>
                          {isFree
                            ? `已滿 NT$ ${opt.free_over.toLocaleString()},免運`
                            : `滿 NT$ ${opt.free_over.toLocaleString()} 免運(還差 NT$ ${(opt.free_over - totalTwd).toLocaleString()})`}
                        </span>
                      ) : null}
                      {opt.note && (
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#b45309', marginTop: 3, lineHeight: 1.5 }}>
                          ⚠️ {opt.note}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="recipient" style={labelStyle}>
            收件人姓名 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input id="recipient" name="recipient" type="text" required style={inputStyle} />
        </div>
        <div>
          <label htmlFor="phone" style={labelStyle}>
            聯絡電話 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input id="phone" name="phone" type="tel" required style={inputStyle} />
        </div>
        <div>
          <label htmlFor="address" style={labelStyle}>
            寄送地址 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input id="address" name="address" type="text" required style={inputStyle} />
        </div>
        <div>
          <label htmlFor="guestEmail" style={labelStyle}>
            Email(選填,用來收訂單確認)
          </label>
          <input id="guestEmail" name="guestEmail" type="email" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="note" style={labelStyle}>
            備註(選填)
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
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
          disabled={submitting}
          style={{
            padding: '0.875rem',
            background: submitting ? '#9ca3af' : '#1f2937',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: '1rem',
            fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            marginTop: '0.5rem',
          }}
        >
          {submitting ? '送出中...' : '送出訂單'}
        </button>
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.75rem',
          }}
        >
          下單後賣家會私訊匯款方式
        </p>
      </form>
    </div>
  );
}
