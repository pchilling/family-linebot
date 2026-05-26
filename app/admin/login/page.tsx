import { Geist, Geist_Mono } from 'next/font/google';
import {
  colors,
  fontFamilySans,
  fontSize,
  fontWeight,
  radius,
  sectionLabel,
  space,
} from '@/lib/admin-theme';
import Link from 'next/link';
import { signIn, signInWithGoogle, signUp } from '../actions';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

// 把 error code 翻譯成友善訊息
const ERROR_MESSAGES: Record<string, string> = {
  no_tenant_access:
    '這個帳號目前沒有任何攤位的存取權限。請聯繫管理員開通。',
  invalid_credentials: '帳號或密碼不正確,請重新輸入。',
  signin_failed: '登入失敗,請稍候再試。',
};

function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? decodeURIComponent(code);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string; signup?: string; email?: string }>;
}) {
  const params = await searchParams;
  const errorMsg = params.error ? friendlyError(params.error) : null;
  const tab = params.tab === 'signup' ? 'signup' : 'login';
  const signupSent = params.signup === 'sent';
  const sentEmail = params.email ?? '';

  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space['6'],
        background: colors.bgBody,
        fontFamily: fontFamilySans,
        color: colors.textPrimary,
      }}
    >
      <main
        style={{
          width: '100%',
          maxWidth: 360,
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.xl,
          padding: `${space['10']}px ${space['8']}px`,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Brand mark */}
        <div style={{ marginBottom: space['8'] }}>
          <div
            style={{
              ...sectionLabel,
              marginBottom: space['2'],
            }}
          >
            Stall Admin
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: fontSize['2xl'],
              fontWeight: fontWeight.semibold,
              letterSpacing: '-0.02em',
              color: colors.textPrimary,
            }}
          >
            {tab === 'signup' ? '註冊' : '登入'}
          </h1>
          <p
            style={{
              margin: `${space['2']}px 0 0`,
              color: colors.textMuted,
              fontSize: fontSize.base,
              lineHeight: 1.5,
            }}
          >
            {tab === 'signup' ? '建立新帳號 → 申請開店。' : '管理你的攤位。'}
          </p>
        </div>

        {/* Tab 切換 */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: space['6'],
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <Link
            href="/admin/login"
            style={{
              flex: 1,
              padding: `${space['3']}px 0`,
              textAlign: 'center',
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              color: tab === 'login' ? colors.textPrimary : colors.textMuted,
              borderBottom: tab === 'login' ? `2px solid ${colors.accent}` : '2px solid transparent',
              textDecoration: 'none',
              marginBottom: -1,
            }}
          >
            登入
          </Link>
          <Link
            href="/admin/login?tab=signup"
            style={{
              flex: 1,
              padding: `${space['3']}px 0`,
              textAlign: 'center',
              fontSize: fontSize.sm,
              fontWeight: fontWeight.medium,
              color: tab === 'signup' ? colors.textPrimary : colors.textMuted,
              borderBottom: tab === 'signup' ? `2px solid ${colors.accent}` : '2px solid transparent',
              textDecoration: 'none',
              marginBottom: -1,
            }}
          >
            註冊
          </Link>
        </div>

        {/* 註冊成功 banner */}
        {signupSent && (
          <div
            style={{
              padding: `${space['4']}px`,
              marginBottom: space['5'],
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#16a34a',
              fontSize: fontSize.sm,
              borderRadius: radius.md,
              lineHeight: 1.6,
            }}
          >
            ✓ <strong>確認信已寄到 {sentEmail}</strong>
            <br />
            請點信中連結完成驗證後即可登入。
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: `${space['3']}px ${space['4']}px`,
              marginBottom: space['5'],
              background: colors.dangerBg,
              border: `1px solid ${colors.dangerBorder}`,
              color: colors.dangerText,
              fontSize: fontSize.base,
              borderRadius: radius.md,
              lineHeight: 1.5,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Google OAuth button(Phase A,2026-05-26)*/}
        <form action={signInWithGoogle} style={{ marginBottom: space['5'] }}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: `${space['3']}px ${space['4']}px`,
              background: colors.bgCard,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: fontSize.md,
              fontWeight: fontWeight.medium,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space['2'],
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91A8.78 8.78 0 0 0 17.64 9.2z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26a5.4 5.4 0 0 1-8.09-2.84H.92v2.33A9 9 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.96H.92a9 9 0 0 0 0 8.09l3.04-2.33z" fill="#FBBC05" />
              <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .92 4.96l3.04 2.32A5.4 5.4 0 0 1 9 3.58z" fill="#EA4335" />
            </svg>
            使用 Google 登入
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space['3'],
            marginBottom: space['5'],
            color: colors.textMuted,
            fontSize: fontSize.sm,
          }}
        >
          <div style={{ flex: 1, height: 1, background: colors.borderSubtle }} />
          <span>或用 email</span>
          <div style={{ flex: 1, height: 1, background: colors.borderSubtle }} />
        </div>

        <form action={tab === 'signup' ? signUp : signIn} style={{ display: 'flex', flexDirection: 'column', gap: space['4'] }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: space['2'],
                fontSize: fontSize.base,
                fontWeight: fontWeight.medium,
                color: colors.textSecondary,
              }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: space['2'],
                fontSize: fontSize.base,
                fontWeight: fontWeight.medium,
                color: colors.textSecondary,
              }}
            >
              密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={tab === 'signup' ? 6 : undefined}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              style={inputStyle}
            />
            {tab === 'signup' && (
              <p style={{ marginTop: space['1'], fontSize: fontSize.xs, color: colors.textMuted }}>
                至少 6 字
              </p>
            )}
          </div>

          <button
            type="submit"
            style={{
              marginTop: space['2'],
              width: '100%',
              padding: `${space['3']}px ${space['4']}px`,
              background: colors.accent,
              color: colors.textOnAccent,
              border: 0,
              borderRadius: radius.md,
              fontSize: fontSize.md,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 100ms',
            }}
          >
            {tab === 'signup' ? '註冊並寄出確認信' : '登入'}
          </button>
        </form>

        <p
          style={{
            marginTop: space['8'],
            paddingTop: space['5'],
            borderTop: `1px solid ${colors.borderSubtle}`,
            color: colors.textMuted,
            fontSize: fontSize.sm,
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          {tab === 'signup'
            ? '已有帳號?點上方「登入」 tab。'
            : '忘記密碼請聯繫 NEO。'}
        </p>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${space['3']}px ${space['3']}px`,
  fontSize: fontSize.md,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  color: colors.textPrimary,
  background: colors.bgCard,
  outline: 'none',
};
