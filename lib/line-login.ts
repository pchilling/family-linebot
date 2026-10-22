import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * LINE Login(OAuth 2.0 + OpenID Connect)自己接,不經 Supabase Auth(它沒有 LINE provider)。
 * Phase 26(2026-10-23),搬自 neraoil 的 lib/line-login.ts。
 * 流程:
 *   /api/auth/line/start     產生 state 與 nonce,存進 HttpOnly cookie,導去 LINE 授權頁
 *   /api/auth/line/callback  比對 state → 用 code 換 token → 把 id_token 交給 LINE 的 verify 端點驗(含 nonce)
 *                            → 取 sub(LINE userId)、name、picture、email
 * 用的是 LIFF 那個 LINE Login 頻道(LINE_LOGIN_CHANNEL_ID 沒設就用 LIFF_CHANNEL_ID),
 * 所以網頁登入和 LIFF 拿到的 LINE userId 是同一個,會對回同一個會員。
 * email 要另外向 LINE 申請權限,沒申請時 LINE 不會給,所以 email 一律可能是 null。
 */

export const LINE_OAUTH_COOKIE = 'stall_line_oauth';
/** state cookie 的存活秒數:在授權頁停留超過 10 分鐘就得重來 */
export const OAUTH_MAX_AGE = 10 * 60;

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const SCOPE = 'profile openid email';

export type LineEnv = { channelId: string; channelSecret: string };

/**
 * start 存進 cookie、callback 拿出來比對的內容(Google 登入也共用這個格式)。
 * slug:從哪個攤位的登入頁來的,失敗要導回該攤位的登入頁。
 * retried:這一輪是 LINE 自動登入失敗後、關閉自動登入的重試;callback 看到它就不再重試,避免無限循環。
 */
export type OAuthState = {
  state: string;
  nonce: string;
  return_to: string;
  slug: string;
  retried?: true;
};

/** LINE 驗完 id_token 後給我們的資料(name / picture / email 都可能沒有) */
export type LineProfile = {
  sub: string;
  name: string | null;
  picture: string | null;
  email: string | null;
};

/** 取 channel 設定;沒設回 null(呼叫端導回登入頁顯示錯誤) */
export function lineEnv(): LineEnv | null {
  const channelId = (process.env.LINE_LOGIN_CHANNEL_ID ?? process.env.LIFF_CHANNEL_ID)?.trim();
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET?.trim();
  return channelId && channelSecret ? { channelId, channelSecret } : null;
}

/** 要跟 LINE Developers 設的 Callback URL 一字不差 */
export function lineRedirectUri(origin: string): string {
  return `${origin}/api/auth/line/callback`;
}

/** state / nonce 用:24 bytes 亂數,base64url */
export function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

export function encodeOAuthState(s: OAuthState): string {
  return Buffer.from(JSON.stringify(s)).toString('base64url');
}

/** cookie 內容壞掉或欄位不對就回 null */
export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { state, nonce, return_to, slug, retried } = parsed as Record<string, unknown>;
  if (typeof state !== 'string' || !state) return null;
  if (typeof nonce !== 'string' || !nonce) return null;
  if (typeof slug !== 'string' || !/^[A-Za-z0-9_-]+$/.test(slug)) return null;
  return {
    state,
    nonce,
    slug,
    return_to: typeof return_to === 'string' ? return_to : `/${slug}`,
    ...(retried === true ? { retried: true as const } : {}),
  };
}

/** 比對 state(timingSafeEqual,長度不同直接 false) */
export function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * LINE 授權頁網址;空白用 %20(不用 URLSearchParams 的 +)。
 * disableAutoLogin:加 disable_auto_login=true,不跳 LINE App 自動登入,直接在網頁上登入。
 * 只用在自動登入失敗後的重試(LINE 官方建議)與 iOS 主畫面網頁 App。
 */
export function lineAuthorizeUrl(
  channelId: string,
  state: string,
  nonce: string,
  origin: string,
  { disableAutoLogin = false }: { disableAutoLogin?: boolean } = {},
): string {
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: channelId,
    redirect_uri: lineRedirectUri(origin),
    state,
    scope: SCOPE,
    nonce,
    ...(disableAutoLogin ? { disable_auto_login: 'true' } : {}),
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${AUTHORIZE_URL}?${query}`;
}

type FormResult = { ok: boolean; status: number; body: Record<string, unknown> | null };

async function postForm(url: string, form: Record<string, string>): Promise<FormResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
  });
  let body: Record<string, unknown> | null = null;
  try {
    const json: unknown = await res.json();
    if (typeof json === 'object' && json !== null) body = json as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** LINE 錯誤回應的 error / error_description(只進 console,不外洩給使用者) */
function describeLineError(body: Record<string, unknown> | null): string {
  if (!body) return '沒有 JSON 回應';
  const e = typeof body.error === 'string' ? body.error : 'unknown';
  const d = typeof body.error_description === 'string' ? body.error_description : '';
  return d ? `${e}(${d})` : e;
}

/** 用 authorization code 換 token,只需要 id_token;失敗 throw */
export async function exchangeLineCode(code: string, env: LineEnv, origin: string): Promise<string> {
  const { ok, status, body } = await postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: lineRedirectUri(origin),
    client_id: env.channelId,
    client_secret: env.channelSecret,
  });
  const idToken = body?.id_token;
  if (!ok || typeof idToken !== 'string' || !idToken) {
    throw new Error(`LINE token 端點回 ${status}:${describeLineError(body)}`);
  }
  return idToken;
}

/**
 * 把 id_token 交給 LINE 驗(簽章、iss、aud、exp、nonce 都由 LINE 檢查,不用自己處理 JWKS)。
 * 回傳的 claims:sub、name、picture、email(後三個都可能沒有)。
 */
export async function verifyLineIdToken(idToken: string, channelId: string, nonce: string): Promise<LineProfile> {
  const { ok, status, body } = await postForm(VERIFY_URL, { id_token: idToken, client_id: channelId, nonce });
  if (!ok || !body || typeof body.sub !== 'string' || !body.sub) {
    throw new Error(`LINE verify 端點回 ${status}:${describeLineError(body)}`);
  }
  // LINE 已經比過 nonce;這裡再對一次,防 LINE 端行為改變
  if (typeof body.nonce === 'string' && body.nonce !== nonce) {
    throw new Error('LINE id_token 的 nonce 與 cookie 不符。');
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { sub: body.sub, name: str(body.name), picture: str(body.picture), email: str(body.email) };
}
