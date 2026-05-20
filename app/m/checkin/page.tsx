'use client';

import { useEffect, useRef, useState } from 'react';
import liff from '@line/liff';
import { checkin, loadTodayClasses, type ClassListItem } from './actions';

// 簽到專用 LIFF。沒設就 fallback 用 member 的(會跑去 /m/member,要改 endpoint URL)
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_CHECKIN ?? process.env.NEXT_PUBLIC_LIFF_ID!;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function CheckinPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [idToken, setIdToken] = useState('');
  const [classes, setClasses] = useState<ClassListItem[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // QR code 帶進來的 class_id(URL ?class_id=xxx)— 自動簽到
  const autoCheckedRef = useRef(false);

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
        const list = await loadTodayClasses(tok);
        setClasses(list);
        setStatus('ready');

        // QR 流程:URL 帶 class_id 且還沒簽過 → 自動簽
        const params = new URLSearchParams(window.location.search);
        const preClassId = params.get('class_id');
        if (preClassId && !autoCheckedRef.current) {
          autoCheckedRef.current = true;
          const match = list.find((c) => c.id === preClassId);
          if (match && !match.already_checked_in) {
            await doCheckin(tok, preClassId, 'qr');
          } else if (match && match.already_checked_in) {
            setFlash({ type: 'ok', msg: `已簽過「${match.name}」` });
          } else if (preClassId) {
            setFlash({ type: 'err', msg: '此 QR 對應的課程不在今日課表' });
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doCheckin(tok: string, classId: string, method: 'liff' | 'qr' = 'liff') {
    setPendingId(classId);
    setFlash(null);
    try {
      const r = await checkin(tok, classId, method);
      if (r.ok) {
        setFlash({ type: 'ok', msg: r.message });
        // refresh 列表 mark 已簽
        const list = await loadTodayClasses(tok);
        setClasses(list);
      } else {
        setFlash({ type: 'err', msg: r.error });
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
        <h1 style={h1}>教室簽到</h1>
        <p style={hello}>嗨,{lineName} 👋</p>
      </header>

      {flash && (
        <div style={flash.type === 'ok' ? okBanner : errBanner}>{flash.msg}</div>
      )}

      {classes.length === 0 && (
        <div style={empty}>今日無課程</div>
      )}

      <div style={list}>
        {classes.map((c) => (
          <div key={c.id} style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardName}>{c.name}</div>
                <div style={cardMeta}>
                  {formatTime(c.scheduled_at)}
                  {c.region_name && <> · {c.region_name}</>}
                  {c.instructor && <> · {c.instructor}</>}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={c.already_checked_in || pendingId === c.id}
              onClick={() => doCheckin(idToken, c.id, 'liff')}
              style={{
                ...btn,
                background: c.already_checked_in ? '#bbf7d0' : '#06c755',
                color: c.already_checked_in ? '#166534' : '#fff',
                cursor: c.already_checked_in ? 'default' : 'pointer',
              }}
            >
              {c.already_checked_in
                ? '✓ 已簽到'
                : pendingId === c.id
                  ? '簽到中…'
                  : '簽到'}
            </button>
          </div>
        ))}
      </div>

      <p style={footer}>
        本月課程詳情看 Rich Menu「📅 本月課程」。
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        ...page,
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
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
  gap: 12,
};
const cardHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
};
const cardName: React.CSSProperties = { fontSize: 16, fontWeight: 600 };
const cardMeta: React.CSSProperties = { fontSize: 13, color: '#666', marginTop: 4 };
const btn: React.CSSProperties = {
  padding: '12px 16px',
  border: 0,
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
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
