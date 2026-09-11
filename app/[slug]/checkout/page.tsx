'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../cart-state';
import { TwAddressFields } from '@/lib/tw-districts';
import { IconChevronLeft } from '@/lib/icons';
import { createOrder, getShippingOptions, type ShippingOption } from './actions';

type Props = {
  params: Promise<{ slug: string }>;
};

export default function CheckoutPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  // 2026-09-11:購物車與結帳併成一頁 — 明細可直接改數量/刪除
  const { items, totalQty, totalTwd, updateQty, removeItem, clear } = useCart(slug);
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
      {/* 2026-09-12:改成跟商品詳情/結帳同款的膠囊返回鍵 */}
      <a
        href={`/${slug}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '9px 16px 9px 12px',
          minHeight: 40,
          boxSizing: 'border-box',
          background: '#fff',
          border: '1px solid #e4e4e7',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          color: '#374151',
          textDecoration: 'none',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <IconChevronLeft size={16} /> 返回
      </a>

      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.375rem' }}>
        購物車 <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '1rem' }}>({totalQty} 件)</span>
      </h2>

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
          商品明細
        </div>
        {items.map((item) => (
          <div
            key={item.variantId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              fontSize: '0.875rem',
              padding: '0.5rem 0',
              borderBottom: '1px solid #f3f4f6',
              color: '#374151',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 2026-09-12:商品名不截斷(可換行),品項(規格)一律顯示 */}
              <div style={{ lineHeight: 1.4 }}>{item.productName}</div>
              {item.variantName && item.variantName !== 'default' && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 1 }}>{item.variantName}</div>
              )}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              <button type="button" onClick={() => updateQty(item.variantId, item.qty - 1)} style={qtyBtn}>−</button>
              <QtyInput qty={item.qty} onCommit={(n) => updateQty(item.variantId, n)} />
              <button type="button" onClick={() => updateQty(item.variantId, item.qty + 1)} style={qtyBtn}>+</button>
            </div>
            <span style={{ width: 76, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>
              NT$ {(item.priceTwd * item.qty).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => removeItem(item.variantId)}
              aria-label={`移除 ${item.productName}`}
              style={{ width: 26, height: 26, border: 0, background: 'none', color: '#c4c4cc', fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
            >
              ×
            </button>
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
                {shipOption ? (shipFee === 0 ? '免運' : `NT$ ${shipFee.toLocaleString()}`) : '請選配送方式'}
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
                          {opt.fee === 0 ? '免運費' : isFree ? '免運' : `NT$ ${opt.fee}`}
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
                          ※ {opt.note}
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
          <label style={labelStyle}>
            寄送地址 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          {/* 2026-09-11(回饋 #8):縣市/區下拉 + 詳細地址,送出仍是單一 address 字串 */}
          <TwAddressFields required inputStyle={inputStyle} />
        </div>
        {/* 2026-09-11:Email 欄位移除(訪客查單用電話即可,訂單通知走 LINE) */}
        <div>
          <label htmlFor="note" style={labelStyle}>
            備註(選填)
          </label>
          {/* 2026-09-11 v2:統編專用欄位移除 — 需要統編直接寫在備註 */}
          <textarea
            id="note"
            name="note"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="如需統編發票或有其他需求,請填寫在這裡"
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
          {submitting ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                  animation: 'co-spin 0.7s linear infinite',
                  display: 'inline-block',
                }}
              />
              處理中,訂單建立中…
            </span>
          ) : (
            `送出訂單 · NT$ ${grandTotal.toLocaleString()}`
          )}
        </button>
        <style dangerouslySetInnerHTML={{ __html: '@keyframes co-spin { to { transform: rotate(360deg); } }' }} />
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

const qtyBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  background: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1rem',
  fontFamily: 'inherit',
};

/**
 * 購物車數量輸入框(2026-09-11 併頁時從 /cart 移入):可直接打字改;
 * 打字過程允許清空,離開欄位時空值/0 恢復原數量(整列刪除用 × 按鈕)。
 */
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null); // null = 顯示外部 qty

  return (
    <input
      inputMode="numeric"
      aria-label="數量"
      value={text ?? String(qty)}
      onFocus={() => setText(String(qty))}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '');
        setText(t);
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }}
      onBlur={() => {
        const n = parseInt(text ?? '', 10);
        if (Number.isFinite(n) && n > 0) onCommit(n);
        setText(null);
      }}
      style={{
        width: 40,
        height: 30,
        textAlign: 'center',
        fontSize: '0.875rem',
        fontWeight: 500,
        border: 'none',
        borderLeft: '1px solid #e5e7eb',
        borderRight: '1px solid #e5e7eb',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        background: '#fff',
      }}
    />
  );
}
