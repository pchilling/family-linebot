'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { loadMyOrders, type OrderListItem } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!;

type Status = 'loading' | 'ready' | 'error';

function statusLabel(s: string): string {
  return ({ open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款' } as Record<string, string>)[s] ?? s;
}
function statusColor(s: string): string {
  return ({ open: '#f59e0b', paid: '#0070f3', shipped: '#06c755', delivered: '#16a34a', cancelled: '#a1a1aa', refunded: '#dc2626' } as Record<string, string>)[s] ?? '#71717a';
}
function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MyOrdersPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');

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

        const data = await loadMyOrders(tok);
        setTenantSlug(data.tenantSlug);
        setOrders(data.orders);
        setStatus('ready');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  if (status === 'loading') {
    return (
      <main style={page}>
        <div style={centered}>
          <div style={spinner} />
          <p style={{ color: '#71717a', fontSize: 14 }}>載入訂單中…</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: spinKeyframes }} />
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main style={page}>
        <div style={centered}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ color: '#dc2626', fontSize: 14 }}>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      {/* Hero */}
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {linePic && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={linePic}
              alt=""
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e4e4e7', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              我的訂單
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#18181b' }}>
              {lineName} 的訂單 ({orders.length})
            </h1>
          </div>
        </div>
      </header>

      {orders.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500, color: '#18181b' }}>
            還沒有訂單
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#71717a', lineHeight: 1.6 }}>
            到主選單「🛍 商品專區」開始逛
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((o) => (
            <li key={o.id}>
              <a
                href={tenantSlug ? `/${tenantSlug}/order/${o.order_no}` : '#'}
                style={{
                  display: 'block',
                  padding: '14px 16px',
                  background: '#fff',
                  border: '1px solid #e4e4e7',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: '#18181b',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#18181b',
                  }}>
                    {o.order_no}
                  </span>
                  <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                    {formatTw(o.created_at)}
                  </span>
                </div>

                <div style={{
                  fontSize: 13,
                  color: '#52525b',
                  marginBottom: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {o.items_summary}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      background: statusColor(o.status) + '22',
                      color: statusColor(o.status),
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {statusLabel(o.status)}
                  </span>
                  <span style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#18181b',
                  }}>
                    NT$ {o.total_twd.toLocaleString()}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: '#a1a1aa', lineHeight: 1.6 }}>
        點訂單可看詳細匯款資訊
      </p>
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
  maxWidth: 520,
  margin: '0 auto',
  padding: '16px 14px 40px',
  background: '#fafafa',
  minHeight: '100vh',
  color: '#18181b',
};
const centered: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  minHeight: '70vh',
};
const spinner: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '3px solid #e4e4e7',
  borderTopColor: '#18181b',
  animation: 'spin 0.8s linear infinite',
};
const spinKeyframes = '@keyframes spin { to { transform: rotate(360deg); } }';
