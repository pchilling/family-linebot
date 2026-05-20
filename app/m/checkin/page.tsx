'use client';

import { useEffect, useRef, useState } from 'react';
import liff from '@line/liff';
import { checkin } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_CHECKIN ?? process.env.NEXT_PUBLIC_LIFF_ID!;

type Status = 'loading' | 'no-class' | 'pending' | 'ok' | 'err';

export default function CheckinPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [lineName, setLineName] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // avoid double-run in dev strict mode
    ran.current = true;
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const p = await liff.getProfile();
        setLineName(p.displayName);
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF ID token');

        const classId = new URLSearchParams(window.location.search).get('class_id');
        if (!classId) {
          setStatus('no-class');
          return;
        }

        setStatus('pending');
        const r = await checkin(tok, classId, 'qr');
        if (r.ok) {
          setStatus('ok');
          setMessage(r.message);
        } else {
          setStatus('err');
          setMessage(r.error);
        }
      } catch (e: unknown) {
        setStatus('err');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main style={page}>
      <header style={topBar}>
        <h1 style={h1}>教室簽到</h1>
        {lineName && <p style={hello}>嗨,{lineName} 👋</p>}
      </header>

      {(status === 'loading' || status === 'pending') && (
        <div style={card}>
          <p style={msg}>處理中…</p>
        </div>
      )}

      {status === 'no-class' && (
        <div style={card}>
          <div style={icon}>📱</div>
          <p style={msgBold}>請掃教室 QR Code</p>
          <p style={hint}>到教室現場後對著 QR Code 掃描即可簽到。</p>
          <p style={hint}>找不到 QR Code 或無法掃描,請聯絡現場老師。</p>
        </div>
      )}

      {status === 'ok' && (
        <div style={okCard}>
          <div style={icon}>✓</div>
          <p style={msgBold}>{message}</p>
          <p style={hint}>祝你上課愉快!</p>
        </div>
      )}

      {status === 'err' && (
        <div style={errCard}>
          <div style={icon}>⚠️</div>
          <p style={msgBold}>{message}</p>
          <p style={hint}>請聯絡現場老師協助處理。</p>
        </div>
      )}
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 460,
  margin: '0 auto',
  padding: 20,
  minHeight: '70vh',
};
const topBar: React.CSSProperties = { marginBottom: 24, textAlign: 'center' };
const h1: React.CSSProperties = { fontSize: 22, margin: 0 };
const hello: React.CSSProperties = { fontSize: 14, color: '#666', marginTop: 6 };
const card: React.CSSProperties = {
  padding: '2.5rem 1.5rem',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  textAlign: 'center',
};
const okCard: React.CSSProperties = {
  ...card,
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
};
const errCard: React.CSSProperties = {
  ...card,
  background: '#fef2f2',
  border: '1px solid #fecaca',
};
const icon: React.CSSProperties = { fontSize: 48, marginBottom: 12 };
const msg: React.CSSProperties = { fontSize: 16, color: '#374151', margin: 0 };
const msgBold: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#111827',
  margin: '0 0 12px',
};
const hint: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  margin: '4px 0 0',
  lineHeight: 1.6,
};
