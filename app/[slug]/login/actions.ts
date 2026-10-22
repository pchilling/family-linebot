'use server';

// 登入頁的 server action(Phase 26):寄信箱登入連結。登出在 app/api/auth/signout/route.ts。
// 連結由 Supabase Auth 產生(admin generateLink,Supabase 不寄信),信由網站自己透過 Resend 寄(lib/login-email.ts)。
// 連結直接回 /api/auth/email/callback?token_hash=…,不經過 supabase.co。寄信次數用 login_emails 表自己擋。
import type { AuthError } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { hasEmailEnv, loginEmail, sendEmail } from '@/lib/login-email';
import { safeReturnTo, siteOrigin } from '@/lib/return-to';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';

export type MagicLinkState = { ok: true; email: string } | { ok: false; message: string } | null;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX = 254;

/** 寄送上限:同一個信箱 60 秒內只寄一封、一小時最多 5 封;同一個 IP 一小時最多 10 封 */
const LIMITS = { emailGapSec: 60, emailPerHour: 5, ipPerHour: 10 } as const;
const HOUR_MS = 60 * 60 * 1000;

const CANNOT_SEND = '目前無法寄信,請稍後再試,或改用 LINE、Google 登入。';

function describeAuthError(error: AuthError): string {
  const code = error.code ?? '';
  if (code === 'over_email_send_rate_limit' || error.status === 429) return '寄信次數已達上限,請稍後再試。';
  if (code === 'email_address_invalid' || code === 'validation_failed') return '電子郵件格式不正確。';
  if (code === 'email_provider_disabled' || code === 'signup_disabled' || code === 'otp_disabled') return '目前暫停用信箱登入,請稍後再試。';
  return `寄送失敗(${error.message})。`;
}

/** 來源 IP(Vercel 會帶 x-real-ip / x-forwarded-for;本機可能沒有,就只擋信箱) */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-real-ip')?.trim() || h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

/** 這次 request 的網站 origin(連結要回到同一個網域) */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : null;
}

/** 超過寄送上限就回一句給使用者看的話;可以寄回 null。查詢失敗 throw。 */
async function limitMessage(email: string, ip: string | null): Promise<string | null> {
  const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
  const byEmail = await supabaseAdmin
    .from('login_emails')
    .select('sent_at')
    .eq('email', email)
    .gte('sent_at', hourAgo)
    .order('sent_at', { ascending: false });
  if (byEmail.error) throw byEmail.error;
  const sent = (byEmail.data ?? []) as { sent_at: string }[];
  if (sent[0] && Date.now() - new Date(sent[0].sent_at).getTime() < LIMITS.emailGapSec * 1000) {
    return '登入連結已寄出,請查看收件匣與垃圾郵件。要重寄的話,一分鐘後再試。';
  }
  if (sent.length >= LIMITS.emailPerHour) return '這個信箱短時間內寄了太多次,請一小時後再試,或改用 LINE、Google 登入。';
  if (ip) {
    const byIp = await supabaseAdmin.from('login_emails').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('sent_at', hourAgo);
    if (byIp.error) throw byIp.error;
    if ((byIp.count ?? 0) >= LIMITS.ipPerHour) return '短時間內寄了太多封登入信,請一小時後再試,或改用 LINE、Google 登入。';
  }
  return null;
}

/** 寄登入連結到信箱。用 useActionState 呼叫,所以第一個參數是上一次的狀態。 */
export async function sendMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const slug = String(formData.get('slug') ?? '').trim();
  const returnTo = safeReturnTo(formData.get('return_to'), slug ? `/${slug}` : '/');

  if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX) return { ok: false, message: '請輸入可收信的電子郵件地址。' };
  if (!hasEmailEnv()) {
    console.error('信箱登入未設定:缺少 RESEND_API_KEY。');
    return { ok: false, message: CANNOT_SEND };
  }
  const tenant = slug ? await getTenantPublic(slug) : null;
  if (!tenant) return { ok: false, message: CANNOT_SEND };

  // 1. 次數上限;先記一筆再寄(記不進去就不寄,免得上限失效)
  const ip = await clientIp();
  try {
    const blocked = await limitMessage(email, ip);
    if (blocked) return { ok: false, message: blocked };
  } catch (e) {
    console.error('查詢登入信寄送紀錄失敗:', e);
    return { ok: false, message: CANNOT_SEND };
  }
  const { error: logError } = await supabaseAdmin.from('login_emails').insert({ email, ip });
  if (logError) {
    console.error('登入信寄送紀錄寫入失敗,這次不寄:', logError);
    return { ok: false, message: CANNOT_SEND };
  }

  // 2. Supabase 產生登入代碼(不寄信);新信箱會順便建立 Supabase 使用者,回來的 type 會是 signup
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = data?.properties?.hashed_token;
  const type = data?.properties?.verification_type;
  if (error || !hashed || !type) {
    if (error) console.error('generateLink 失敗:', error.code ?? error.status, error.message);
    else console.error('generateLink 沒有回傳 hashed_token。');
    return { ok: false, message: error ? describeAuthError(error) : CANNOT_SEND };
  }

  // 3. 網站自己寄信;連結直接回本站
  const origin = siteOrigin(await requestOrigin());
  const link =
    `${origin}/api/auth/email/callback?token_hash=${encodeURIComponent(hashed)}` +
    `&type=${encodeURIComponent(type)}&slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(returnTo)}`;
  try {
    await sendEmail({ to: email, ...loginEmail({ link, tenantName: tenant.name }) });
  } catch (e) {
    console.error('登入信寄送失敗:', e);
    return { ok: false, message: CANNOT_SEND };
  }
  return { ok: true, email };
}
