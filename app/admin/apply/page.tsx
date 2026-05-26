import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getUserAllowedTenants } from '@/lib/supabase';
import { signOut } from '../actions';
import { submitApplication } from './actions';
import { colors, fontFamilySans, fontSize, fontWeight, radius, space } from '@/lib/admin-theme';

// 注入 :focus / :hover state(inline style 表達不了)
const styleInject = `
.neop-input { transition: border-color 120ms, box-shadow 120ms; }
.neop-input:focus {
  border-color: ${colors.neopGreen};
  outline: 0;
  box-shadow: 0 0 0 3px rgba(5, 200, 120, 0.15);
}
.neop-cta {
  transition: background 120ms, transform 80ms;
}
.neop-cta:hover { background: ${colors.neopGreenHover}; }
.neop-cta:active { transform: scale(0.99); }
.neop-prefix {
  display: flex;
  align-items: stretch;
  border: 1px solid ${colors.border};
  border-radius: ${radius.md}px;
  overflow: hidden;
  transition: border-color 120ms, box-shadow 120ms;
}
.neop-prefix:focus-within {
  border-color: ${colors.neopGreen};
  box-shadow: 0 0 0 3px rgba(5, 200, 120, 0.15);
}
.neop-prefix > span {
  padding: 12px 12px;
  background: ${colors.bgSubtle};
  color: ${colors.textMuted};
  font-family: var(--font-geist-mono), monospace;
  font-size: 14px;
  border-right: 1px solid ${colors.border};
  display: flex;
  align-items: center;
}
.neop-prefix > input {
  flex: 1;
  border: 0;
  outline: 0;
  padding: 12px 12px;
  font-size: 14px;
  font-family: inherit;
  color: ${colors.textPrimary};
  background: transparent;
}
`;

/**
 * /admin/apply — 新人(沒任何 tenant_members)填表開店。
 * 已有 tenant 的人會被 redirect 到自己的 admin。
 */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) redirect('/admin/login');

  const allowed = await getUserAllowedTenants(user.email);
  if (allowed.length > 0) redirect(`/admin/${allowed[0].slug}`);

  const sp = await searchParams;
  const err = sp.error;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bgBody,
        fontFamily: fontFamilySans,
        color: colors.textPrimary,
        padding: `${space['8']}px ${space['4']}px`,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: styleInject }} />
      <main
        style={{
          maxWidth: 540,
          margin: '0 auto',
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.xl,
          padding: `${space['8']}px ${space['6']}px`,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)',
        }}
      >
        <header style={{ marginBottom: space['6'] }}>
          {/* Logo + wordmark — NEOP STALL(NEOP 粗 / STALL 細,同色同字級) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: space['3'], marginBottom: space['5'] }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-mark.png"
              alt="NEOP"
              width={36}
              height={36}
              style={{ display: 'block' }}
            />
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: colors.neopBlack,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              NEOP
              <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>STALL</span>
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, letterSpacing: '-0.02em' }}>
            開一個自己的攤位
          </h1>
          <p style={{ margin: `${space['2']}px 0 0`, color: colors.textMuted, fontSize: fontSize.base, lineHeight: 1.6 }}>
            送出後立即進入後台,可以開始建商品 / 活動。
            <br />
            公開頁面會在審核通過後對客戶開啟。
          </p>
        </header>

        {/* 登入身分 — 純文字 + 登出 button */}
        <div
          style={{
            marginBottom: space['6'],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space['3'],
            fontSize: fontSize.sm,
            color: colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          <span>
            登入身分:<span style={{ color: colors.textPrimary, fontWeight: fontWeight.medium }}>{user.email}</span>
          </span>
          <form action={signOut}>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 0,
                color: colors.textMuted,
                cursor: 'pointer',
                fontSize: fontSize.sm,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              登出
            </button>
          </form>
        </div>

        {err && (
          <div
            style={{
              padding: `${space['3']}px ${space['4']}px`,
              marginBottom: space['5'],
              background: colors.dangerBg,
              border: `1px solid ${colors.dangerBorder}`,
              color: colors.dangerText,
              fontSize: fontSize.sm,
              borderRadius: radius.md,
              lineHeight: 1.5,
            }}
          >
            ⚠️ {decodeURIComponent(err)}
          </div>
        )}

        <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: space['5'] }}>
          <Field label="店名" name="tenant_name" required placeholder="你的店家名稱" />
          <Field
            label="店鋪網址"
            name="tenant_slug"
            required
            placeholder="my-shop"
            prefix="/"
            hint="3-20 字小寫英文 / 數字 / 連字號。客戶會用這個網址逛你的店。"
          />
          <Field
            label="訂單編號前綴"
            name="order_prefix"
            required
            placeholder="SHP"
            hint="例「SHP-202605-0001」。建議用 2-3 個英文字母代表你的店,平台內唯一。"
          />
          <Field
            label="聯絡人姓名"
            name="applicant_name"
            required
            placeholder="例:陳小姐 / Peter Chen"
          />
          <Field
            label="聯絡手機"
            name="applicant_phone"
            required
            type="tel"
            placeholder="09xx xxx xxx"
            hint="僅用於審核時聯繫,不會給第三方。"
          />
          <FieldTextarea
            label="簡介(選填)"
            name="application_notes"
            placeholder="例:我做韓國童裝代購,每月開一團 5-10 款,在 IG @kidsko 經營了 2 年..."
            hint="寫得清楚審核會快很多。"
          />

          <button
            type="submit"
            className="neop-cta"
            style={{
              marginTop: space['3'],
              padding: `${space['3']}px ${space['5']}px`,
              background: colors.neopGreen,
              color: '#fff',
              border: 0,
              borderRadius: radius.md,
              fontSize: fontSize.md,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            送出申請,立刻進後台
          </button>

          <p
            style={{
              margin: 0,
              textAlign: 'center',
              fontSize: fontSize.xs,
              color: colors.textMuted,
              lineHeight: 1.6,
            }}
          >
            審核通常在 24 小時內回覆 · 有問題會用 Email 通知
          </p>
        </form>
      </main>
    </div>
  );
}

// Server action wrapper:接 ApplyError 回傳,fail 時 redirect 帶 ?error
async function handleSubmit(formData: FormData) {
  'use server';
  const result = await submitApplication(formData);
  // 成功會 redirect,所以 result undefined 就略過
  if (result && 'error' in result) {
    redirect(`/admin/apply?error=${encodeURIComponent(result.error)}`);
  }
}

function Field({
  label,
  name,
  required,
  type,
  placeholder,
  hint,
  defaultValue,
  prefix,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
  prefix?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space['2'] }}>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
        {label}
        {required && <span style={{ color: colors.dangerText, marginLeft: 4 }}>*</span>}
      </span>
      {prefix ? (
        <div className="neop-prefix">
          <span>{prefix}</span>
          <input
            name={name}
            type={type ?? 'text'}
            required={required}
            defaultValue={defaultValue}
            placeholder={placeholder}
          />
        </div>
      ) : (
        <input
          className="neop-input"
          name={name}
          type={type ?? 'text'}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          style={{
            padding: `${space['3']}px ${space['3']}px`,
            fontSize: fontSize.md,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            fontFamily: 'inherit',
            color: colors.textPrimary,
            background: colors.bgCard,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
      {hint && (
        <span style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 1.5 }}>{hint}</span>
      )}
    </label>
  );
}

function FieldTextarea({
  label,
  name,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space['2'] }}>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
        {label}
      </span>
      <textarea
        className="neop-input"
        name={name}
        placeholder={placeholder}
        rows={3}
        style={{
          padding: `${space['3']}px ${space['3']}px`,
          fontSize: fontSize.md,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          fontFamily: 'inherit',
          color: colors.textPrimary,
          background: colors.bgCard,
          outline: 'none',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      {hint && (
        <span style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 1.5 }}>{hint}</span>
      )}
    </label>
  );
}
