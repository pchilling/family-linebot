'use client';

import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import {
  loadShopData,
  placeOrder,
  saveShopProfile,
  type ShopProduct,
  type ShopMember,
  type CartItem,
} from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_SHOP!;

export default function ShopPage() {
  const [status, setStatus] = useState<
    'loading' | 'need-profile' | 'shop' | 'submitting' | 'done' | 'error'
  >('loading');
  const [error, setError] = useState('');
  const [idToken, setIdToken] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [member, setMember] = useState<ShopMember | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const p = await liff.getProfile();
        setLineName(p.displayName);
        setLinePic(p.pictureUrl ?? '');
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF token');
        setIdToken(tok);
        const data = await loadShopData(tok, p.displayName, p.pictureUrl ?? null);
        setProducts(data.products);
        setMember(data.member);
        // Profile gate:沒填 full_name / phone 不能逛(同 /m/checkin pattern)
        const hasProfile = !!(data.member?.full_name && data.member?.phone);
        setStatus(hasProfile ? 'shop' : 'need-profile');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  async function onSubmitProfile(formData: FormData) {
    setSavingProfile(true);
    setError('');
    formData.set('idToken', idToken);
    try {
      const newMember = await saveShopProfile(formData);
      setMember(newMember);
      setStatus('shop');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, c) => {
        const p = productMap.get(c.product_id);
        return sum + (p?.price_twd ?? 0) * c.qty;
      }, 0),
    [cart, productMap],
  );

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  function addToCart(productId: string) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === productId);
      if (existing) {
        return prev.map((c) =>
          c.product_id === productId ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [...prev, { product_id: productId, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product_id === productId ? { ...c, qty: c.qty + delta } : c,
        )
        .filter((c) => c.qty > 0),
    );
  }

  async function onSubmitOrder(formData: FormData) {
    setError('');
    setStatus('submitting');
    try {
      formData.set('idToken', idToken);
      formData.set('cart', JSON.stringify(cart));
      const { order_no } = await placeOrder(formData);
      setOrderNo(order_no);
      setStatus('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('shop');
    }
  }

  if (status === 'loading') return <Centered>載入中…</Centered>;
  if (status === 'error') return <Centered>錯誤:{error}</Centered>;

  // Profile gate:沒填會員資料的學員看不到商品,先填 mini-form
  if (status === 'need-profile') {
    return (
      <main style={page}>
        <header style={{ ...topBar, textAlign: 'center' }}>
          {linePic && (
            <img
              src={linePic}
              alt=""
              style={{
                width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                border: '1px solid #e4e4e7', margin: '0 auto 10px', display: 'block',
              }}
            />
          )}
          <h1 style={{ fontSize: 22, margin: 0 }}>歡迎 {lineName}!</h1>
          <p style={{ fontSize: 14, color: '#71717a', marginTop: 8 }}>
            第一次來?先填一下基本資料就能開始逛 🌿
          </p>
        </header>

        <form
          action={onSubmitProfile}
          style={{
            background: '#fff',
            border: '1px solid #e4e4e7',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>真實姓名 *</span>
            <input
              name="full_name"
              required
              autoFocus
              defaultValue={member?.full_name ?? ''}
              placeholder="您的真實姓名"
              style={shopInput}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>電話 *</span>
            <input
              name="phone"
              type="tel"
              required
              defaultValue={member?.phone ?? ''}
              placeholder="0900-000-000"
              style={shopInput}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>地址(出貨用,選填)</span>
            <input
              name="address"
              defaultValue={member?.address ?? ''}
              placeholder="出貨 / 通訊地址"
              style={shopInput}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>ID(會員編號,選填)</span>
            <input
              name="member_id"
              placeholder="例:1234567"
              style={shopInput}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>介紹人 ID(選填)</span>
            <input
              name="referrer_member_id"
              placeholder="介紹你來的人的 ID"
              style={shopInput}
            />
          </label>

          <button
            type="submit"
            disabled={savingProfile}
            style={{
              marginTop: 6,
              padding: 14,
              background: savingProfile ? '#a1a1aa' : '#18181b',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: savingProfile ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {savingProfile ? '儲存中…' : '建立會員資料 + 開始逛'}
          </button>

          {error && (
            <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>
          )}
        </form>
      </main>
    );
  }

  if (status === 'done') {
    return (
      <main style={page}>
        <div style={doneBanner}>
          <h1 style={{ fontSize: 22, margin: 0 }}>✓ 訂單已建立</h1>
          <p style={{ marginTop: 12, fontSize: 16 }}>
            訂單編號:<b>{orderNo}</b>
          </p>
          <p style={{ marginTop: 8, color: '#666', fontSize: 14 }}>
            客服會盡快聯繫您確認付款與出貨。
          </p>
        </div>
      </main>
    );
  }

  // shop view(含 cart drawer + checkout form)
  return (
    <main style={page}>
      <header style={topBar}>
        <h1 style={h1}>商品專區</h1>
        <button
          type="button"
          onClick={() => setShowCheckout((v) => !v)}
          style={cartBtn}
          disabled={cart.length === 0}
        >
          🛒 {cartCount > 0 && `(${cartCount})`}
        </button>
      </header>

      {error && <div style={errorBanner}>{error}</div>}

      {!showCheckout && (
        <section style={{ display: 'grid', gap: 12 }}>
          {products.length === 0 && (
            <p style={{ color: '#666', textAlign: 'center', padding: 32 }}>
              商品建置中
            </p>
          )}
          {products.map((p) => (
            <article key={p.id} style={productCard}>
              {p.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{p.name}</h3>
                {p.category && (
                  <span style={categoryTag}>{p.category}</span>
                )}
                {p.description && (
                  <p style={{ margin: '6px 0', fontSize: 12, color: '#666' }}>
                    {p.description}
                  </p>
                )}
                <p style={{ margin: '4px 0', fontWeight: 600 }}>
                  NT$ {p.price_twd.toLocaleString()}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: p.stock > 0 ? '#666' : '#d00' }}>
                  庫存 {p.stock}
                </p>
              </div>
              <button
                type="button"
                onClick={() => addToCart(p.id)}
                style={addBtn}
                disabled={p.stock === 0}
              >
                {p.stock === 0 ? '缺貨' : '+ 購物車'}
              </button>
            </article>
          ))}
        </section>
      )}

      {showCheckout && cart.length > 0 && (
        <section>
          <h2 style={h2}>購物車</h2>
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16 }}>
            {cart.map((c) => {
              const p = productMap.get(c.product_id);
              if (!p) return null;
              return (
                <li key={c.product_id} style={cartItem}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: '#666' }}>
                      NT$ {p.price_twd} × {c.qty} = NT$ {(p.price_twd * c.qty).toLocaleString()}
                    </div>
                  </div>
                  <button type="button" onClick={() => changeQty(c.product_id, -1)} style={qtyBtn}>−</button>
                  <span style={{ minWidth: 24, textAlign: 'center' }}>{c.qty}</span>
                  <button type="button" onClick={() => changeQty(c.product_id, 1)} style={qtyBtn}>+</button>
                </li>
              );
            })}
          </ul>

          <div style={totalBox}>
            <span style={{ fontSize: 14 }}>總計</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>NT$ {cartTotal.toLocaleString()}</span>
          </div>

          <h2 style={h2}>結帳資訊</h2>
          <form action={onSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={label}>
              <span style={labelText}>收件人姓名 *</span>
              <input name="recipient" defaultValue={member?.full_name ?? ''} required style={input} />
            </label>
            <label style={label}>
              <span style={labelText}>電話 *</span>
              <input name="phone" type="tel" defaultValue={member?.phone ?? ''} required style={input} />
            </label>
            <label style={label}>
              <span style={labelText}>地址 *</span>
              <input name="address" defaultValue={member?.address ?? ''} required style={input} />
            </label>
            <button
              type="submit"
              disabled={status === 'submitting'}
              style={{ ...btn, opacity: status === 'submitting' ? 0.5 : 1 }}
            >
              {status === 'submitting' ? '送出中…' : `送出訂單(NT$ ${cartTotal.toLocaleString()})`}
            </button>
            <button
              type="button"
              onClick={() => setShowCheckout(false)}
              style={{ ...btn, background: '#fff', color: '#000', border: '1px solid #ccc' }}
            >
              繼續逛
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ ...page, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <p style={{ color: '#666' }}>{children}</p>
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 480,
  margin: '0 auto',
  padding: 16,
};
const topBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 20,
};
const h1: React.CSSProperties = { fontSize: 22, margin: 0, flex: 1 };
const h2: React.CSSProperties = { fontSize: 16, marginBottom: 12 };
const cartBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#06c755',
  color: '#fff',
  border: 0,
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
};
const productCard: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: 12,
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fff',
  alignItems: 'center',
};
const categoryTag: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  padding: '2px 6px',
  background: '#f0f0f0',
  borderRadius: 3,
  marginTop: 2,
};
const addBtn: React.CSSProperties = {
  padding: '8px 12px',
  background: '#06c755',
  color: '#fff',
  border: 0,
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const cartItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 0',
  borderBottom: '1px solid #f0f0f0',
};
const shopInput: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#18181b',
  fontFamily: 'inherit',
  outline: 'none',
};
const qtyBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid #ccc',
  background: '#fff',
  borderRadius: 4,
  fontSize: 16,
  cursor: 'pointer',
};
const totalBox: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderTop: '2px solid #000',
  borderBottom: '1px solid #ddd',
  marginBottom: 20,
};
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const labelText: React.CSSProperties = {
  fontSize: 13,
  color: '#444',
  marginBottom: 6,
};
const input: React.CSSProperties = {
  padding: 10,
  fontSize: 16,
  border: '1px solid #ccc',
  borderRadius: 6,
  width: '100%',
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  padding: 14,
  background: '#000',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};
const errorBanner: React.CSSProperties = {
  background: '#fee',
  color: '#a00',
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 12,
  fontSize: 13,
};
const doneBanner: React.CSSProperties = {
  textAlign: 'center',
  padding: 32,
  background: '#e6f7ed',
  border: '1px solid #6cc28d',
  borderRadius: 8,
  marginTop: 40,
};
