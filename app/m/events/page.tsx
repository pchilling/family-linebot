'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import {
  cancelReservation,
  loadEvents,
  reserveSpot,
  type EventListItem,
} from './actions';

const LIFF_ID =
  process.env.NEXT_PUBLIC_LIFF_ID_EVENTS ?? process.env.NEXT_PUBLIC_LIFF_ID!;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
  const time = d.toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} ${time}`;
}

export default function EventsPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [idToken, setIdToken] = useState('');
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const p = await liff.getProfile();
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF ID token');
        setLineName(p.displayName);
        setIdToken(tok);
        const list = await loadEvents(tok);
        setEvents(list);
        setStatus('ready');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  async function refresh(tok: string) {
    const list = await loadEvents(tok);
    setEvents(list);
  }

  async function handleReserve(classId: string) {
    setPendingId(classId);
    setFlash(null);
    try {
      const r = await reserveSpot(idToken, classId);
      if (r.ok) {
        if (r.status === 'confirmed') {
          setFlash({ type: 'ok', msg: '✓ 報名成功' });
        } else {
          setFlash({ type: 'ok', msg: `已加入候補 #${r.position}` });
        }
        await refresh(idToken);
      } else {
        setFlash({ type: 'err', msg: r.error });
      }
    } catch (e: unknown) {
      setFlash({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setPendingId(null);
    }
  }

  async function handleCancel(classId: string) {
    if (!confirm('確定取消報名?')) return;
    setPendingId(classId);
    setFlash(null);
    try {
      const r = await cancelReservation(idToken, classId);
      if (r.ok) {
        setFlash({ type: 'ok', msg: '已取消報名' });
        await refresh(idToken);
      } else {
        setFlash({ type: 'err', msg: r.error ?? '取消失敗' });
      }
    } catch (e: unknown) {
      setFlash({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setPendingId(null);
    }
  }

  if (status === 'loading') {
    return <Centered>載入中…</Centered>;
  }
  if (status === 'error') {
    return <Centered>錯誤:{error}</Centered>;
  }

  return (
    <main style={page}>
      <header style={topBar}>
        <h1 style={h1}>活動報名</h1>
        <p style={hello}>嗨,{lineName} 👋</p>
      </header>

      {flash && (
        <div style={flash.type === 'ok' ? okBanner : errBanner}>{flash.msg}</div>
      )}

      {events.length === 0 && <div style={empty}>近期沒有可報名的活動</div>}

      <div style={list}>
        {events.map((e) => {
          const cap = e.capacity ?? null;
          const remaining = cap !== null ? Math.max(0, cap - e.confirmed_count) : null;
          const isFull = cap !== null && remaining === 0;
          const isPending = pendingId === e.id;

          let btn: React.ReactNode;
          if (e.my_status === 'confirmed') {
            btn = (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleCancel(e.id)}
                style={{ ...btnGhost, ...(isPending ? btnPending : {}) }}
              >
                {isPending ? '處理中…' : '✓ 已報名 (點此取消)'}
              </button>
            );
          } else if (e.my_status === 'waitlist') {
            btn = (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleCancel(e.id)}
                style={{ ...btnGhost, ...(isPending ? btnPending : {}) }}
              >
                {isPending ? '處理中…' : `⏳ 候補中 #${e.my_position} (點此取消)`}
              </button>
            );
          } else {
            // null or cancelled
            btn = (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleReserve(e.id)}
                style={{
                  ...(isFull ? btnWaitlist : btnPrimary),
                  ...(isPending ? btnPending : {}),
                }}
              >
                {isPending ? '處理中…' : isFull ? `候補(已 ${e.waitlist_count} 人)` : '我要報名'}
              </button>
            );
          }

          return (
            <div key={e.id} style={card}>
              <div style={cardTime}>{formatDateTime(e.scheduled_at)}</div>
              <div style={cardName}>{e.name}</div>
              <div style={cardMeta}>
                {e.region_name && <span>{e.region_name}</span>}
                {e.instructor && <span> · {e.instructor}</span>}
                {e.is_paid && <span> · 收費 NT$ {e.price_twd ?? '-'}</span>}
              </div>
              <div style={cardCap}>
                容量 {cap ?? '不限'}
                {cap !== null && (
                  <>
                    {' · 已報 '}
                    <strong style={{ color: isFull ? '#d00' : '#0a7038' }}>
                      {e.confirmed_count}
                    </strong>
                    {e.waitlist_count > 0 && (
                      <span style={{ color: '#9a7400' }}> · 候補 {e.waitlist_count} 人</span>
                    )}
                  </>
                )}
              </div>
              {btn}
            </div>
          );
        })}
      </div>

      <p style={footer}>
        報名後想取消請點上方按鈕。若課程已滿,你會被加到候補名單。
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        ...page,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
      }}
    >
      <p style={{ color: '#666' }}>{children}</p>
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 480,
  margin: '0 auto',
  padding: 20,
};
const topBar: React.CSSProperties = { marginBottom: 20 };
const h1: React.CSSProperties = { fontSize: 22, margin: 0 };
const hello: React.CSSProperties = { fontSize: 14, color: '#666', marginTop: 4 };
const list: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const card: React.CSSProperties = {
  padding: 16,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const cardTime: React.CSSProperties = { fontSize: 12, color: '#888', fontWeight: 500 };
const cardName: React.CSSProperties = { fontSize: 17, fontWeight: 600, lineHeight: 1.3 };
const cardMeta: React.CSSProperties = { fontSize: 13, color: '#666' };
const cardCap: React.CSSProperties = { fontSize: 13, color: '#444', marginTop: 4, marginBottom: 8 };
const btnPrimary: React.CSSProperties = {
  padding: '12px 16px',
  background: '#06c755',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnWaitlist: React.CSSProperties = {
  ...btnPrimary,
  background: '#f59e0b',
};
const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: '#0a7038',
  border: '1px solid #bbf7d0',
};
const btnPending: React.CSSProperties = {
  opacity: 0.6,
  cursor: 'not-allowed',
};
const empty: React.CSSProperties = {
  padding: '3rem 1rem',
  textAlign: 'center',
  color: '#9ca3af',
};
const footer: React.CSSProperties = {
  marginTop: 24,
  fontSize: 12,
  color: '#999',
  textAlign: 'center',
  lineHeight: 1.6,
};
const okBanner: React.CSSProperties = {
  background: '#dcfce7',
  color: '#15803d',
  padding: '10px 14px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 14,
  fontWeight: 500,
};
const errBanner: React.CSSProperties = {
  background: '#fef2f2',
  color: '#991b1b',
  padding: '10px 14px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 14,
};
