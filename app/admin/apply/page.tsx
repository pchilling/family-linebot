import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getUserAllowedTenants } from '@/lib/supabase';
import { submitApplication } from './actions';
import { colors, fontFamilySans, fontSize, fontWeight, radius, space } from '@/lib/admin-theme';

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
  const defaultName: string =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email.split('@')[0];

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
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textMuted,
              fontWeight: fontWeight.semibold,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: space['2'],
            }}
          >
            NEO Stall · 申請開店
          </div>
          <h1 style={{ margin: 0, fontSize: fontSize['2xl'], fontWeight: fontWeight.semibold, letterSpacing: '-0.02em' }}>
            開一個自己的攤位
          </h1>
          <p style={{ margin: `${space['2']}px 0 0`, color: colors.textMuted, fontSize: fontSize.base, lineHeight: 1.5 }}>
            填表送出後可以**立刻進後台設定**(商品 / 活動 / 設定)。
            <br />
            審核通過後公開頁面(LIFF / 公開商店)才會對客戶開啟。
          </p>
        </header>

        <div
          style={{
            marginBottom: space['6'],
            padding: `${space['3']}px ${space['4']}px`,
            background: colors.bgBody,
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.md,
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          登入身分:<strong style={{ color: colors.textPrimary }}>{user.email}</strong>
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
            label="網址識別 (slug)"
            name="tenant_slug"
            required
            placeholder="my-shop"
            hint="3-20 字小寫英文 / 數字 / 連字號。URL 會長 /admin/my-shop。"
          />
          <Field
            label="訂單編號前綴"
            name="order_prefix"
            required
            placeholder="SHP"
            hint="2-5 個大寫英文。訂單編號會用這個開頭,平台內唯一。"
          />
          <Field label="聯絡人姓名" name="applicant_name" required defaultValue={defaultName} />
          <Field
            label="聯絡手機"
            name="applicant_phone"
            required
            type="tel"
            placeholder="09xx xxx xxx"
            hint="審核時平台會用這支電話跟你聯繫。"
          />
          <FieldTextarea
            label="簡介(選填)"
            name="application_notes"
            placeholder="兩三句話介紹你的業務,有助於審核更快通過。"
          />

          <button
            type="submit"
            style={{
              marginTop: space['3'],
              padding: `${space['3']}px ${space['5']}px`,
              background: colors.accent,
              color: colors.textOnAccent,
              border: 0,
              borderRadius: radius.md,
              fontSize: fontSize.md,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
            }}
          >
            送出申請,立刻進後台
          </button>
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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space['2'] }}>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
        {label}
        {required && <span style={{ color: colors.dangerText, marginLeft: 4 }}>*</span>}
      </span>
      <input
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
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: space['2'] }}>
      <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
        {label}
      </span>
      <textarea
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
    </label>
  );
}
