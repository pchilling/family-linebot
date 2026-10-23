'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { Badge, UI_CSS } from '@/lib/ui';
import { loadMyOrders, type OrderListItem } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!;

type Status = 'loading' | 'ready' | 'error';

function statusLabel(s: string): string {
  return ({ open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款' } as Record<string, string>)[s] ?? s;
}
function statusTone(s: string): { bg: string; bd: string; fg: string } {
  const map: Record<string, { bg: string; bd: string; fg: string }> = {
    open: { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' },
    paid: { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534' },
    shipped: { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8' },
    delivered: { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534' },
    cancelled: { bg: '#f4f4f5', bd: '#e4e4e7', fg: '#52525b' },
    refunded: { bg: '#f4f4f5', bd: '#e4e4e7', fg: '#52525b' },
  };
  return map[s] ?? map.cancelled;
}
function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

// LIFF 沒有攤位 layout 幫忙算配色,這頁先用預設 zinc 配色
const VARS: React.CSSProperties = {
  ['--ui-bg' as string]: '#fafafa',
  ['--ui-surface' as string]: '#ffffff',
  ['--ui-ink' as string]: '#18181b',
  ['--ui-muted' as string]: '#71717a',
  ['--ui-faint' as string]: '#a1a1aa',
  ['--ui-line' as string]: '#e4e4e7',
  ['--ui-line-soft' as string]: '#f4f4f5',
  ['--ui-accent' as string]: '#18181b',
  ['--ui-on-accent' as string]: '#ffffff',
};

const CSS = `
.mo{max-width:520px;margin:0 auto;padding:16px 16px 40px;min-height:100vh;background:var(--ui-bg);color:var(--ui-ink);font-family:Inter,"Noto Sans TC",ui-sans-serif,system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;-webkit-font-smoothing:antialiased}
.mo-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.mo-head img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--ui-line);flex-shrink:0}
.mo-head h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.02em}
.mo-head p{margin:2px 0 0;font-size:13px;color:var(--ui-muted)}
.mo-item{display:block;padding:14px 16px;text-decoration:none;color:inherit}
.mo-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.mo-sum{font-size:13px;color:#52525b;margin:6px 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

/**
 * LIFF 我的訂單(2026-10-23 樣式對齊共用元件):列這個 LINE 帳號在本攤位的訂單,點進去是網頁版訂單頁(帶存取碼)。
 */
export default function MyOrdersPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = '#fafafa';
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

  const shell = (children: React.ReactNode) => (
    <main className="mo" style={VARS}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: UI_CSS + CSS }} />
      {children}
    </main>
  );

  if (status === 'loading') {
    return shell(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: '70vh' }}>
        <span className="ui-spin" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p className="ui-muted" style={{ fontSize: 14, margin: 0 }}>載入訂單中…</p>
      </div>,
    );
  }

  if (status === 'error') {
    return shell(
      <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, lineHeight: 1.6 }}>{error}</div>,
    );
  }

  return shell(
    <>
      <header className="mo-head">
        {linePic && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={linePic} alt="" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>我的訂單</h1>
          <p>{lineName} · <span className="ui-num">{orders.length}</span> 筆</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="ui-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ marginBottom: 12, color: '#d4d4d8' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>還沒有訂單</p>
          <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>到主選單「商品專區」開始逛</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((o) => {
            const tone = statusTone(o.status);
            return (
              <li key={o.id}>
                <a href={tenantSlug ? `/${tenantSlug}/order/${o.order_no}${o.access_key ? `?k=${o.access_key}` : ''}` : '#'} className="ui-card mo-item">
                  <div className="mo-row">
                    <span className="ui-num" style={{ fontSize: 14, fontWeight: 600 }}>{o.order_no}</span>
                    <span className="ui-muted ui-num" style={{ fontSize: 12 }}>{formatTw(o.created_at)}</span>
                  </div>
                  <div className="mo-sum">{o.items_summary}</div>
                  <div className="mo-row" style={{ alignItems: 'center' }}>
                    <Badge style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}>{statusLabel(o.status)}</Badge>
                    <span className="ui-num" style={{ fontSize: 16, fontWeight: 600 }}>NT$ {o.total_twd.toLocaleString('en-US')}</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <p className="ui-muted" style={{ marginTop: 24, textAlign: 'center', fontSize: 12, lineHeight: 1.6 }}>點訂單可看付款資訊與進度</p>
    </>,
  );
}
