import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { hasEmailEnv } from '@/lib/login-email';
import { getCurrentMember, hasSessionSecret } from '@/lib/member-auth';
import { safeReturnTo } from '@/lib/return-to';
import { getTenantPublic } from '@/lib/supabase';
import { EmailLoginForm } from './email-login-form';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ return_to?: string; error?: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  return { title: tenant ? `登入 - ${tenant.name}` : '登入', robots: { index: false, follow: true } };
}

/** ?error= 對應的說明(各 /api/auth/* 失敗時帶回來) */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: '這個登入連結無效或已經用過,請重新寄一次。',
  expired: '登入連結已過期,請重新寄一次。',
  verify_failed: '登入連結驗證失敗,請重新寄一次。',
  no_email: '這個帳號沒有信箱,無法用信箱登入。',
  line_failed: 'LINE 登入沒有完成,請再試一次。',
  line_denied: '你取消了 LINE 登入。',
  google_failed: 'Google 登入沒有完成,請再試一次。',
  google_denied: '你取消了 Google 登入。',
  server: '登入時發生問題,請稍後再試。',
};

const CSS = `
.lg-wrap{max-width:420px;margin:16px auto 0}
.lg-card{padding:28px 24px;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-surface);display:flex;flex-direction:column;gap:18px}
.lg-brand{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ui-muted)}
.lg-brand img,.lg-brand span.i{width:24px;height:24px;border-radius:6px;object-fit:cover;flex-shrink:0}
.lg-brand span.i{background:var(--ui-accent);color:var(--ui-on-accent);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.lg-card h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.lg-card p.d{margin:0;font-size:14px;line-height:1.7;color:var(--ui-muted)}
.lg-alert{margin:0;padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.6}
.lg-btns{display:flex;flex-direction:column;gap:10px}
.lg-btn{display:flex;align-items:center;justify-content:center;gap:10px;height:48px;border-radius:8px;font-size:15px;font-weight:500;text-decoration:none;box-sizing:border-box;transition:opacity .15s,background .15s}
.lg-btn svg{width:22px;height:22px;flex-shrink:0}
.lg-line{background:#06C755;color:#fff}.lg-line:hover{background:#05a648}
.lg-google{border:1px solid var(--ui-line);background:#fff;color:#18181b}.lg-google:hover{background:var(--ui-line-soft)}
.lg-line.noauto{display:none}
@media (display-mode:standalone){.lg-line.auto{display:none}.lg-line.noauto{display:flex}}
.lg-div{display:flex;align-items:center;gap:12px;color:var(--ui-muted);font-size:12px}
.lg-div::before,.lg-div::after{content:"";flex:1;border-top:1px solid var(--ui-line)}
.lg-fine{margin:0;font-size:12px;line-height:1.7;color:var(--ui-faint)}
`;

/**
 * 攤位登入頁(Phase 26,2026-10-23):LINE / Google(OAuth)→ 信箱寄登入連結。做法參考 neraoil 的 /login。
 * 已登入就直接回 return_to。不登入也能買,所以文案講的是登入的好處,不是門檻。
 */
export default async function LoginPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const returnTo = safeReturnTo(sp.return_to, `/${slug}`);
  const errorKey = typeof sp.error === 'string' ? sp.error : null;
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.server) : null;

  const member = await getCurrentMember();
  if (member) redirect(returnTo);

  const ready = hasSessionSecret();
  // OAuth 入口是 route handler,要整頁跳轉:用原生 <a>,不用 <Link>(Link 會預取,等於提前觸發登入流程)
  const startHref = (provider: 'line' | 'google') =>
    `/api/auth/${provider}/start?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(returnTo)}`;

  return (
    <div className="lg-wrap ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lg-card">
        <div className="lg-brand">
          {tenant.logo_url ? <img src={tenant.logo_url} alt="" /> : <span className="i" aria-hidden>{tenant.name.slice(0, 1)}</span>}
          <span>{tenant.name}</span>
        </div>
        <h1>登入</h1>

        {errorMessage && <p role="alert" className="lg-alert">{errorMessage}</p>}

        {!ready ? (
          <p className="lg-alert">登入功能尚未開通,請稍後再試。不登入也可以直接購買。</p>
        ) : (
          <>
            <p className="d">登入後可以查看訂單、同步收藏,結帳時自動帶入資料。不登入也能購買。</p>

            <div className="lg-btns">
              {/* LINE 兩顆只會顯示一顆:從 iOS 主畫面打開的網頁 App 跳 LINE App 授權後結果回不來,改帶 no_auto=1 在網頁上登入 */}
              <a href={startHref('line')} className="lg-btn lg-line auto">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3C6.9 3 3 6.3 3 10.3c0 3.6 3 6.6 7 7.2.3.1.7.2.8.5.1.3.1.7 0 1l-.1.8c0 .2-.2.9.8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.7C20.6 6.3 16.7 3 12 3z" /></svg>
                用 LINE 繼續
              </a>
              <a href={`${startHref('line')}&no_auto=1`} className="lg-btn lg-line noauto">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3C6.9 3 3 6.3 3 10.3c0 3.6 3 6.6 7 7.2.3.1.7.2.8.5.1.3.1.7 0 1l-.1.8c0 .2-.2.9.8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.7C20.6 6.3 16.7 3 12 3z" /></svg>
                用 LINE 繼續
              </a>
              <a href={startHref('google')} className="lg-btn lg-google">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
                  <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
                  <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2a10 10 0 0 0-8.9 5.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" />
                </svg>
                用 Google 繼續
              </a>
            </div>

            <div className="lg-div">或使用電子郵件</div>

            <EmailLoginForm slug={slug} returnTo={returnTo} enabled={hasEmailEnv()} />

            <p className="lg-fine">登入時只取得顯示名稱、大頭貼與電子郵件,不會存取好友名單或聊天內容。登入即表示同意本店的服務條款與隱私權政策。</p>
          </>
        )}
      </div>
    </div>
  );
}
