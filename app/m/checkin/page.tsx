'use client';

import { useEffect, useRef, useState } from 'react';
import liff from '@line/liff';
import { checkinFromQr, saveProfileAndCheckin, type CheckinState } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_CHECKIN ?? process.env.NEXT_PUBLIC_LIFF_ID!;

type ClassInfo = { id: string; name: string; scheduled_at: string };
type Status = 'loading' | 'no-class' | 'pending' | 'need-profile' | 'ok' | 'err';

export default function CheckinPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [idToken, setIdToken] = useState('');
  const [classId, setClassId] = useState('');
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
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
        setLinePic(p.pictureUrl ?? '');
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF ID token');
        setIdToken(tok);

        const cid = new URLSearchParams(window.location.search).get('class_id');
        if (!cid) {
          setStatus('no-class');
          return;
        }
        setClassId(cid);

        setStatus('pending');
        const r = await checkinFromQr(tok, cid, p.displayName, p.pictureUrl ?? null);
        handleResult(r);
      } catch (e: unknown) {
        setStatus('err');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  function handleResult(r: CheckinState) {
    if (r.kind === 'success') {
      setStatus('ok');
      setMessage(r.message);
    } else if (r.kind === 'need_profile') {
      setStatus('need-profile');
      setClassInfo(r.classInfo);
    } else {
      setStatus('err');
      setMessage(r.error);
    }
  }

  async function onSubmitProfile(formData: FormData) {
    setSaving(true);
    setMessage('');
    formData.set('idToken', idToken);
    formData.set('class_id', classId);
    try {
      const r = await saveProfileAndCheckin(formData);
      handleResult(r);
    } catch (e: unknown) {
      setStatus('err');
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={page}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus { outline: none; border-color: #18181b !important; }
@keyframes spin { to { transform: rotate(360deg); } }
          `,
        }}
      />

      <header style={topBar}>
        {linePic && (
          <img
            src={linePic}
            alt=""
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e4e4e7', margin: '0 auto 10px', display: 'block' }}
          />
        )}
        <h1 style={h1}>教室簽到</h1>
        {lineName && <p style={hello}>嗨,{lineName} 👋</p>}
      </header>

      {(status === 'loading' || status === 'pending') && (
        <div style={card}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e4e4e7', borderTopColor: '#18181b', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
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

      {status === 'need-profile' && classInfo && (
        <div style={card}>
          <div style={icon}>👋</div>
          <p style={msgBold}>第一次來!請先填一下基本資料</p>
          <p style={hint}>
            活動:<strong>{classInfo.name}</strong>
          </p>
          <p style={{ ...hint, marginBottom: 16 }}>填完會自動完成簽到 ✓</p>

          <form action={onSubmitProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left', marginTop: 12 }}>
            <label style={fieldLabel}>
              <span style={labelText}>真實姓名 *</span>
              <input name="full_name" required style={input} placeholder="您的真實姓名" autoFocus />
            </label>
            <label style={fieldLabel}>
              <span style={labelText}>電話 *</span>
              <input name="phone" type="tel" required style={input} placeholder="0900-000-000" />
            </label>
            <label style={fieldLabel}>
              <span style={labelText}>ID(會員編號,選填)</span>
              <input name="member_id" style={input} placeholder="例:1234567" />
            </label>
            <label style={fieldLabel}>
              <span style={labelText}>介紹人 ID(選填)</span>
              <input name="referrer_member_id" style={input} placeholder="介紹你來的人的 ID" />
            </label>

            <button
              type="submit"
              disabled={saving}
              style={{
                marginTop: 6,
                padding: 14,
                background: saving ? '#a1a1aa' : '#18181b',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? '簽到中…' : '建立資料 + 簽到'}
            </button>
          </form>

          {message && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#dc2626' }}>{message}</p>
          )}
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
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
  maxWidth: 460,
  margin: '0 auto',
  padding: 20,
  minHeight: '70vh',
};
const topBar: React.CSSProperties = { marginBottom: 24, textAlign: 'center' };
const h1: React.CSSProperties = { fontSize: 22, margin: 0, color: '#18181b' };
const hello: React.CSSProperties = { fontSize: 14, color: '#52525b', marginTop: 6 };
const card: React.CSSProperties = {
  padding: '2.5rem 1.5rem',
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  textAlign: 'center',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
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
  color: '#18181b',
  margin: '0 0 12px',
};
const hint: React.CSSProperties = {
  fontSize: 13,
  color: '#71717a',
  margin: '4px 0 0',
  lineHeight: 1.6,
};
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};
const labelText: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#18181b',
};
const input: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#18181b',
  fontFamily: 'inherit',
  transition: 'border-color 100ms',
};
