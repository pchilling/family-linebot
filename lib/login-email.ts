/**
 * 商店登入信(Phase 26,2026-10-23),用 Resend 寄,做法搬自 neraoil 的 lib/email.ts。
 * 為什麼不用 Supabase 寄:Supabase 的寄件人與範本是整個專案共用的,預設寄信量每小時只有幾封,
 * Gmail 也容易當垃圾信。改由 Resend 寄,寄件人用 LOGIN_EMAIL_FROM(網域要在 Resend 驗證過)。
 * 需要 env RESEND_API_KEY;沒設時登入頁會說「目前無法寄信」,LINE / Google 照常可用。
 */

const RESEND_URL = 'https://api.resend.com/emails';

/** 寄件人;要用 Resend 驗證過的網域 */
function emailFrom(): string {
  return process.env.LOGIN_EMAIL_FROM?.trim() || 'NEOP STALL <login@stall.neop.tw>';
}

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/** 有沒有設定寄信金鑰 */
export function hasEmailEnv(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** 寄一封信;Resend 回錯誤就 throw(呼叫端決定怎麼告訴使用者) */
export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error('缺少 RESEND_API_KEY,無法寄信。');
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: emailFrom(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend 回 ${res.status}:${body.slice(0, 300)}`);
  }
}

/** HTML 跳脫 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 登入信:表格排版、樣式全 inline(各家信箱對 CSS 支援很不一致),寬 480,不放圖片(新網域放圖容易被當垃圾信)。
 * 主題與標題帶攤位名稱,客人才知道是哪家店寄的。
 */
export function loginEmail({ link, tenantName }: { link: string; tenantName: string }): Omit<OutgoingEmail, 'to'> {
  const url = esc(link);
  const name = esc(tenantName);
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登入 ${name}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:36px 32px;font-family:'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif;color:#18181b;">
<tr><td align="center" style="text-align:center;">
<p style="margin:0;font-size:13px;letter-spacing:.08em;color:#71717a;">${name}</p>
<h1 style="margin:16px 0 8px;font-size:24px;line-height:1.4;font-weight:600;color:#18181b;">登入 ${name}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.8;color:#18181b;">點下方按鈕即可登入,不需要密碼。</p>
<a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:16px;line-height:1;padding:15px 32px;border-radius:8px;">登入</a>
<p style="margin:28px 0 0;font-size:14px;line-height:1.8;color:#71717a;">這個連結只能用一次。如果不是你本人操作,忽略這封信就好,帳號不會有任何變動。</p>
<p style="margin:16px 0 0;font-size:14px;line-height:1.8;color:#71717a;">按鈕無法使用的話,把下面的網址貼到瀏覽器:<br><a href="${url}" style="color:#18181b;word-break:break-all;">${url}</a></p>
</td></tr>
</table>
<p style="margin:20px 0 0;font-family:'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif;font-size:12px;color:#a1a1aa;">${name} · 由 NEOP STALL 提供</p>
</td></tr>
</table>
</body></html>`;
  const text = [
    `登入 ${tenantName}`,
    '',
    '開啟以下連結即可登入,不需要密碼:',
    link,
    '',
    '這個連結只能用一次。如果不是你本人操作,忽略這封信就好,帳號不會有任何變動。',
    '',
    `${tenantName} · 由 NEOP STALL 提供`,
  ].join('\n');
  return { subject: `登入 ${tenantName}`, html, text };
}
