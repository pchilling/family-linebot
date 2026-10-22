/**
 * Google 登入(OAuth 2.0 + OpenID Connect)自己接,不經 Supabase Auth。
 * Phase 26(2026-10-23),搬自 neraoil 的 lib/google-login.ts。
 *
 * 為什麼不用 Supabase 的 Google provider:那一套的回呼網址在 supabase.co,Google 登入畫面只能顯示那串網址;
 * 自己的 client 回呼到 stall.neop.tw,畫面顯示我們的網域。
 *
 * 流程(跟 lib/line-login.ts 同一套,state cookie 也共用同一個格式):
 *   /api/auth/google/start     產生 state 與 nonce,存進 HttpOnly cookie,導去 Google 授權頁
 *   /api/auth/google/callback  比對 state → 用 code 換 token → 檢查 id_token 的 claims(含 nonce)
 *                              → 取 sub(Google 帳號 id)、email(Google 驗證過才用)、name、picture
 *
 * id_token 不另外驗簽章:它是我們帶著 client secret、經 TLS 直接向 Google token 端點換來的,
 * OpenID Connect Core 3.1.3.7 允許這種情況以 TLS 驗證發行者取代簽章檢查;claims(iss、aud、exp、nonce)照樣逐一檢查。
 */

export const GOOGLE_OAUTH_COOKIE = 'stall_google_oauth';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'openid email profile';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
/** 伺服器時鐘誤差容許秒數 */
const CLOCK_SKEW = 60;

export type GoogleEnv = { clientId: string; clientSecret: string };

/** Google 驗完之後給我們的資料 */
export type GoogleProfile = {
  sub: string;
  /** 只有 Google 標示 email_verified 才有值,否則 null(沒驗證過的 email 不拿來比對會員) */
  email: string | null;
  name: string | null;
  picture: string | null;
};

/** 取 client 設定;沒設回 null */
export function googleEnv(): GoogleEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** 要跟 Google Cloud「已授權的重新導向 URI」一字不差 */
export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Google 授權頁網址;prompt=select_account 讓有好幾個 Google 帳號的人可以選 */
export function googleAuthorizeUrl(clientId: string, state: string, nonce: string, origin: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: googleRedirectUri(origin),
    scope: SCOPE,
    state,
    nonce,
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Google 錯誤回應的 error / error_description(只進 console,不外洩給使用者) */
function describeGoogleError(body: Record<string, unknown> | null): string {
  if (!body) return '沒有 JSON 回應';
  const e = typeof body.error === 'string' ? body.error : 'unknown';
  const d = typeof body.error_description === 'string' ? body.error_description : '';
  return d ? `${e}(${d})` : e;
}

/** 用 authorization code 換 token,只需要 id_token;失敗 throw */
export async function exchangeGoogleCode(code: string, env: GoogleEnv, origin: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: googleRedirectUri(origin),
      client_id: env.clientId,
      client_secret: env.clientSecret,
    }).toString(),
    cache: 'no-store',
  });
  let body: Record<string, unknown> | null = null;
  const json: unknown = await res.json().catch(() => null);
  if (typeof json === 'object' && json !== null) body = json as Record<string, unknown>;
  const idToken = body?.id_token;
  if (!res.ok || typeof idToken !== 'string' || !idToken) {
    throw new Error(`Google token 端點回 ${res.status}:${describeGoogleError(body)}`);
  }
  return idToken;
}

/** JWT 的 payload(第二段)解成物件;格式不對 throw */
function jwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Google id_token 格式不對。');
  const json: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (typeof json !== 'object' || json === null) throw new Error('Google id_token payload 不是物件。');
  return json as Record<string, unknown>;
}

/** 檢查 id_token 的 claims(iss、aud、exp、nonce、sub),回傳會員資料;任何一項不對 throw */
export function verifyGoogleIdToken(idToken: string, clientId: string, nonce: string): GoogleProfile {
  const c = jwtPayload(idToken);
  const now = Math.floor(Date.now() / 1000);
  if (typeof c.iss !== 'string' || !ISSUERS.has(c.iss)) throw new Error(`Google id_token 的 iss 不對:${String(c.iss)}`);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) throw new Error('Google id_token 的 aud 不是本站的 client。');
  if (typeof c.exp !== 'number' || c.exp + CLOCK_SKEW < now) throw new Error('Google id_token 已過期。');
  if (c.nonce !== nonce) throw new Error('Google id_token 的 nonce 與 cookie 不符。');
  if (typeof c.sub !== 'string' || !c.sub) throw new Error('Google id_token 沒有 sub。');
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const verified = c.email_verified === true || c.email_verified === 'true';
  return { sub: c.sub, email: verified ? str(c.email) : null, name: str(c.name), picture: str(c.picture) };
}
