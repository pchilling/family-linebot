'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { loadProfile, saveProfile, type MemberProfile } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!;

export default function MemberPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [idToken, setIdToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

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
        const data = await loadProfile(tok);
        setProfile(data);
        setStatus('ready');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError('');
    setSavedAt(null);
    try {
      formData.set('idToken', idToken);
      await saveProfile(formData);
      // reload
      const data = await loadProfile(idToken);
      setProfile(data);
      setSavedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return <Centered>載入中…</Centered>;
  }
  if (status === 'error') {
    return <Centered>錯誤:{error}</Centered>;
  }

  const isNew = !profile || !profile.full_name;

  return (
    <main style={page}>
      <header style={topBar}>
        <h1 style={h1}>會員專區</h1>
        <p style={hello}>嗨,{lineName} 👋</p>
      </header>

      {savedAt && (
        <div style={savedBanner}>
          已儲存 ✓ {savedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {error && (
        <div style={errorBanner}>
          錯誤:{error}
        </div>
      )}

      <form action={onSubmit} style={form}>
        <label style={label}>
          <span style={labelText}>姓名 *</span>
          <input
            name="full_name"
            required
            defaultValue={profile?.full_name ?? ''}
            style={input}
            placeholder="您的真實姓名"
          />
        </label>

        <label style={label}>
          <span style={labelText}>電話</span>
          <input
            name="phone"
            type="tel"
            defaultValue={profile?.phone ?? ''}
            style={input}
            placeholder="0900-000-000"
          />
        </label>

        <label style={label}>
          <span style={labelText}>地址</span>
          <input
            name="address"
            defaultValue={profile?.address ?? ''}
            style={input}
            placeholder="出貨 / 通訊地址"
          />
        </label>

        <label style={label}>
          <span style={labelText}>生日</span>
          <input
            name="birthday"
            type="date"
            defaultValue={profile?.birthday ?? ''}
            style={input}
          />
        </label>

        <label style={label}>
          <span style={labelText}>ID(會員編號,若有的話)</span>
          <input
            name="member_id"
            defaultValue={profile?.member_id ?? ''}
            style={input}
            placeholder="例:1234567"
          />
        </label>

        <label style={label}>
          <span style={labelText}>介紹人 ID</span>
          <input
            name="referrer_member_id"
            defaultValue={profile?.referrer_member_id ?? ''}
            style={input}
            placeholder="介紹你來的人的 ID(填了之後可以記錄)"
          />
        </label>

        <button type="submit" disabled={saving} style={{ ...btn, opacity: saving ? 0.5 : 1 }}>
          {saving ? '儲存中…' : isNew ? '建立會員資料' : '更新資料'}
        </button>
      </form>

      <p style={footer}>資料只用於三合一愛油哇內部聯繫,不會分享第三方。</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ ...page, justifyContent: 'center', alignItems: 'center', display: 'flex', minHeight: '70vh' }}>
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
const topBar: React.CSSProperties = { marginBottom: 24 };
const h1: React.CSSProperties = { fontSize: 22, margin: 0 };
const hello: React.CSSProperties = { fontSize: 14, color: '#666', marginTop: 4 };
const form: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', marginBottom: 6 };
const input: React.CSSProperties = {
  padding: 10,
  fontSize: 16,
  border: '1px solid #ccc',
  borderRadius: 6,
  width: '100%',
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  background: '#06c755',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};
const footer: React.CSSProperties = {
  marginTop: 32,
  fontSize: 12,
  color: '#999',
  textAlign: 'center',
};
const savedBanner: React.CSSProperties = {
  background: '#e6f7ed',
  color: '#0a7038',
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 13,
};
const errorBanner: React.CSSProperties = {
  background: '#fee',
  color: '#a00',
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 13,
  whiteSpace: 'pre-wrap',
};
