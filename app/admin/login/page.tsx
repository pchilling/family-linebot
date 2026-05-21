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
import { signIn } from '../actions';

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
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMsg = params.error ? friendlyError(params.error) : null;

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
            登入
          </h1>
          <p
            style={{
              margin: `${space['2']}px 0 0`,
              color: colors.textMuted,
              fontSize: fontSize.base,
              lineHeight: 1.5,
            }}
          >
            管理你的攤位。
          </p>
        </div>

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

        <form action={signIn} style={{ display: 'flex', flexDirection: 'column', gap: space['4'] }}>
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
              autoComplete="current-password"
              style={inputStyle}
            />
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
            登入
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
          忘記密碼或要新增帳號,請聯繫 NEO。
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
