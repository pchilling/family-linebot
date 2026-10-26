'use client';

import { useEffect } from 'react';
import { EmailLoginForm } from './login/email-login-form';

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
.lm-scrim{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.5);animation:ui-fade .2s ease backwards}
.lm-wrap{position:fixed;inset:0;z-index:81;display:grid;place-items:center;padding:16px;pointer-events:none}
.lm{pointer-events:auto;position:relative;width:min(420px,100%);box-sizing:border-box;max-height:calc(100vh - 32px);overflow:auto;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.22);padding:28px 28px 24px;display:flex;flex-direction:column;gap:18px;animation:ui-swap .25s cubic-bezier(.22,1,.36,1) backwards}
.lm-x{position:absolute;top:10px;right:10px}
.lm-brand{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ui-muted)}
.lm-brand img,.lm-brand span.i{width:26px;height:26px;border-radius:7px;object-fit:cover;flex-shrink:0;border:1px solid var(--ui-line)}
.lm-brand span.i{background:var(--ui-accent);color:var(--ui-on-accent);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:0}
.lm h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.lm p.d{margin:6px 0 0;font-size:14px;line-height:1.7;color:var(--ui-muted)}
.lm-alert{margin:0;padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.6}
.lm-btns{display:flex;flex-direction:column;gap:10px}
.lm-btn{display:flex;align-items:center;justify-content:center;gap:10px;height:50px;border-radius:8px;font-size:15px;font-weight:500;text-decoration:none;box-sizing:border-box;transition:opacity .15s,background .15s,border-color .15s}
.lm-btn svg{width:22px;height:22px;flex-shrink:0}
.lm-line{background:#06C755;color:#fff;font-weight:600}.lm-line:hover{background:#05a648}
.lm-google{border:1px solid var(--ui-line);background:#fff;color:#18181b}.lm-google:hover{border-color:#a1a1aa;background:#fafafa}
.lm-line.noauto{display:none}
@media (display-mode:standalone){.lm-line.auto{display:none}.lm-line.noauto{display:flex}}
.lm-div{display:flex;align-items:center;gap:12px;color:var(--ui-muted);font-size:12px}
.lm-div::before,.lm-div::after{content:"";flex:1;border-top:1px solid var(--ui-line)}
.lm-fine{margin:0;font-size:12px;line-height:1.7;color:var(--ui-faint)}
@media (max-width:640px){
  .lm-wrap{place-items:end stretch;padding:0}
  .lm{width:100%;max-height:88svh;border-radius:14px 14px 0 0;border-bottom:0;padding:24px 20px calc(20px + env(safe-area-inset-bottom));animation:ui-up .3s cubic-bezier(.22,1,.36,1) backwards}
}
`;

type Props = {
  slug: string;
  tenantName: string;
  logoUrl: string | null;
  /** 登入完成後要回哪一頁(站內路徑) */
  returnTo: string;
  /** ?error= 帶回來的錯誤代碼 */
  error?: string | null;
  /** 有設 SESSION_SECRET 才能登入 */
  ready: boolean;
  /** 有設 RESEND_API_KEY 才顯示信箱登入 */
  emailOn: boolean;
  onClose: () => void;
};

/**
 * 登入視窗(2026-10-24):沒有密碼要填,不值得跳一整頁 — 按頁首「登入」就在原地彈出,
 * LINE / Google 兩顆鈕(信箱登入有開才多一段),登入完回到同一頁。手機版從底部滑上來。
 * Esc、點背景、右上角 X 都會關。
 */
export function LoginModal({ slug, tenantName, logoUrl, returnTo, error, ready, emailOn, onClose }: Props) {
  // 開著的時候鎖住底層捲動
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.server) : null;
  // OAuth 入口是 route handler,要整頁跳轉:用原生 <a>,不用 <Link>(Link 會預取,等於提前觸發登入流程)
  const startHref = (provider: 'line' | 'google') =>
    `/api/auth/${provider}/start?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(returnTo)}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lm-scrim" onClick={onClose} />
      <div className="lm-wrap">
        <div className="lm" role="dialog" aria-modal="true" aria-labelledby="lm-h2">
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon lm-x" onClick={onClose} aria-label="關閉">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <div className="lm-brand">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" />
            ) : (
              <span className="i" aria-hidden>{tenantName.slice(0, 1)}</span>
            )}
            <span>{tenantName}</span>
          </div>
          <div>
            <h2 id="lm-h2">登入</h2>
            <p className="d">查看訂單進度、同步收藏,結帳時自動帶入收件資料。不登入也可以直接購買。</p>
          </div>

          {errorMessage && <p role="alert" className="lm-alert">{errorMessage}</p>}

          {!ready ? (
            <p className="lm-alert">登入功能尚未開通,請稍後再試。</p>
          ) : (
            <>
              <div className="lm-btns">
                {/* LINE 兩顆只會顯示一顆:iOS 主畫面網頁 App 跳 LINE App 授權後結果回不來,改帶 no_auto=1 在網頁上登入 */}
                <a href={startHref('line')} className="lm-btn lm-line auto">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3C6.9 3 3 6.3 3 10.3c0 3.6 3 6.6 7 7.2.3.1.7.2.8.5.1.3.1.7 0 1l-.1.8c0 .2-.2.9.8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.7C20.6 6.3 16.7 3 12 3z" /></svg>
                  用 LINE 繼續
                </a>
                <a href={`${startHref('line')}&no_auto=1`} className="lm-btn lm-line noauto">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3C6.9 3 3 6.3 3 10.3c0 3.6 3 6.6 7 7.2.3.1.7.2.8.5.1.3.1.7 0 1l-.1.8c0 .2-.2.9.8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.7C20.6 6.3 16.7 3 12 3z" /></svg>
                  用 LINE 繼續
                </a>
                <a href={startHref('google')} className="lm-btn lm-google">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" />
                    <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
                    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
                    <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2a10 10 0 0 0-8.9 5.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" />
                  </svg>
                  用 Google 繼續
                </a>
              </div>
              {emailOn && (
                <>
                  <div className="lm-div">或使用電子郵件</div>
                  <EmailLoginForm slug={slug} returnTo={returnTo} enabled />
                </>
              )}
              <p className="lm-fine">登入時只取得顯示名稱、大頭貼與電子郵件,不會存取好友名單或聊天內容。登入即表示同意本店的服務條款與隱私權政策。</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
