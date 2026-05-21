'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { loadProfile, saveProfile, type MemberProfile } from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!;

// Design tokens(inline since LIFF 不共用 admin-theme)
const c = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  borderFocus: '#18181b',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  textDisabled: '#a1a1aa',
  accent: '#18181b',
  accentHover: '#27272a',
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
};

export default function MemberPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
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
        setLinePic(p.pictureUrl ?? '');
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
      const data = await loadProfile(idToken);
      setProfile(data);
      setSavedAt(new Date());
      // Scroll to top to show success banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return (
      <Centered>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${c.border}`, borderTopColor: c.accent, animation: 'spin 0.8s linear infinite' }} />
        <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      </Centered>
    );
  }
  if (status === 'error') {
    return <Centered><p style={{ color: c.danger }}>錯誤:{error}</p></Centered>;
  }

  const isNew = !profile || !profile.full_name;

  return (
    <div style={page}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus { outline: none; border-color: ${c.borderFocus} !important; }
.input::placeholder { color: ${c.textDisabled}; }
@keyframes fadein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
          `,
        }}
      />

      {/* Hero */}
      <header style={hero}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {linePic ? (
            <img
              src={linePic}
              alt={lineName}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `1px solid ${c.border}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: c.border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: c.textMuted,
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {(lineName || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              三合一愛油哇
            </div>
            <h1 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 700, color: c.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              嗨,{lineName} 👋
            </h1>
          </div>
        </div>
      </header>

      {/* Banners */}
      {savedAt && (
        <div style={{ ...banner, background: c.successBg, border: `1px solid ${c.successBorder}`, color: c.success, animation: 'fadein 0.25s ease' }}>
          ✓ 已儲存{' '}
          <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.8 }}>
            {savedAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
      {error && (
        <div style={{ ...banner, background: c.dangerBg, border: `1px solid ${c.dangerBorder}`, color: c.danger, whiteSpace: 'pre-wrap', animation: 'fadein 0.25s ease' }}>
          {error}
        </div>
      )}

      <form action={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 基本資料 */}
        <section style={card}>
          <h2 style={sectionTitle}>基本資料</h2>

          <Field label="真名" required>
            <input
              name="full_name"
              required
              defaultValue={profile?.full_name ?? ''}
              placeholder="您的真實姓名"
              className="input"
              style={input}
            />
          </Field>

          <Field label="電話">
            <input
              name="phone"
              type="tel"
              defaultValue={profile?.phone ?? ''}
              placeholder="0900-000-000"
              className="input"
              style={input}
            />
          </Field>

          <Field label="地址">
            <input
              name="address"
              defaultValue={profile?.address ?? ''}
              placeholder="出貨 / 通訊地址"
              className="input"
              style={input}
            />
          </Field>

          <Field label="生日">
            <input
              name="birthday"
              type="date"
              defaultValue={profile?.birthday ?? ''}
              className="input"
              style={input}
            />
          </Field>
        </section>

        {/* 介紹關係 */}
        <section style={card}>
          <h2 style={sectionTitle}>介紹關係 <span style={{ color: c.textMuted, fontWeight: 400, fontSize: 13 }}>(選填)</span></h2>

          <Field label="ID(會員編號)" hint="如果你有自己的會員編號可以填,方便對帳 / 連結組織關係">
            <input
              name="member_id"
              defaultValue={profile?.member_id ?? ''}
              placeholder="例:1234567"
              className="input"
              style={input}
            />
          </Field>

          <Field label="介紹人 ID" hint="介紹你來的人的 ID。填了就算對方還沒進系統,之後對方加入時自動連起來">
            <input
              name="referrer_member_id"
              defaultValue={profile?.referrer_member_id ?? ''}
              placeholder="介紹人的 ID"
              className="input"
              style={input}
            />
          </Field>
        </section>

        <button
          type="submit"
          disabled={saving}
          style={{
            ...submitBtn,
            background: saving ? c.textDisabled : c.accent,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '儲存中…' : isNew ? '建立會員資料' : '更新資料'}
        </button>

        <p style={footer}>
          資料只用於三合一愛油哇內部聯繫,不會分享第三方。
        </p>
      </form>

      {/* 快速導覽到「我的訂單」 — 既有會員才顯示 */}
      {!isNew && (
        <a
          href="/m/orders"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18,
            padding: '14px 16px',
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            textDecoration: 'none',
            color: c.text,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <span>🧾 查我的訂單</span>
          <span style={{ color: c.textMuted, fontSize: 16 }}>›</span>
        </a>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>
        {label}
        {required && <span style={{ color: c.danger, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 1.5, marginTop: 2 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        ...page,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: '80vh',
      }}
    >
      {children}
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
  maxWidth: 520,
  margin: '0 auto',
  padding: '16px 16px 40px',
  background: c.bg,
  minHeight: '100vh',
  color: c.text,
};

const hero: React.CSSProperties = {
  marginBottom: 18,
};

const card: React.CSSProperties = {
  background: c.card,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
  padding: '18px 16px 22px',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: c.text,
  letterSpacing: '-0.005em',
};

const input: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 16,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
  background: c.card,
  color: c.text,
  fontFamily: 'inherit',
  transition: 'border-color 100ms',
};

const submitBtn: React.CSSProperties = {
  marginTop: 6,
  padding: '14px',
  color: '#fff',
  border: 0,
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: 'inherit',
  transition: 'background 0.15s',
};

const banner: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  marginBottom: 16,
  lineHeight: 1.5,
};

const footer: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: c.textMuted,
  textAlign: 'center',
  lineHeight: 1.6,
};
