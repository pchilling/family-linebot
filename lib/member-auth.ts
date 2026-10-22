import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * 商店會員登入的 session 與會員對應(Phase 26,2026-10-23;做法搬自 neraoil 的 lib/auth.ts)。
 * - 網站自己的 cookie `stall_session`(HttpOnly;內容是 HS256 JWT,用 SESSION_SECRET 簽),
 *   payload 只有 { uid, iat, exp };uid 是 platform_users.id。
 * - 會員指向平台共用的 platform_users(跟 neraoil 同一張表,同一個人兩邊登入是同一個帳號),
 *   登入方式記在 platform_user_auth_methods,重複帳號依 merged_into_user_id 跟到最終那一筆。
 * - LINE / Google 自己接(lib/line-login.ts、lib/google-login.ts);信箱登入用 Supabase Auth 驗連結,驗完就丟掉它的 session。
 */

export type CurrentMember = {
  id: string;
  display_name: string | null;
  picture_url: string | null;
  email: string | null;
  phone: string | null;
  line_user_id: string | null;
};

export type AuthProvider = 'line' | 'email' | 'google';

export const SESSION_COOKIE = 'stall_session';
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
/** SESSION_SECRET 最少幾個字元 */
const SECRET_MIN_LEN = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 跟 merged_into_user_id 最多跟幾層(防止資料打結時無限迴圈) */
const MERGE_HOPS = 3;

// ---------- JWT(HS256,Node 內建 crypto,不裝套件) ----------

type SessionPayload = { uid: string; iat: number; exp: number };

let warnedSecret = false;

/** 取簽章金鑰;沒設或太短回 null(只警告一次,不 throw) */
function getSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= SECRET_MIN_LEN) return s;
  if (!warnedSecret) {
    warnedSecret = true;
    console.warn(`未設定 SESSION_SECRET(或少於 ${SECRET_MIN_LEN} 字元),商店登入功能停用:所有人都視為未登入。`);
  }
  return null;
}

/** 有沒有設好 SESSION_SECRET(登入頁用來決定要不要顯示「暫停登入」) */
export function hasSessionSecret(): boolean {
  return getSecret() !== null;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function hmac(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmac(secret, `${HEADER}.${body}`).toString('base64url');
  return `${HEADER}.${body}.${sig}`;
}

/** 驗簽(timingSafeEqual)+ 檢查到期與 uid 格式;任何不對都回 null */
function verifySession(token: string, secret: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (header !== HEADER) return null;
  const expected = hmac(secret, `${header}.${body}`);
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { uid, iat, exp } = payload as Record<string, unknown>;
  if (typeof uid !== 'string' || !UUID_RE.test(uid)) return null;
  if (typeof iat !== 'number' || typeof exp !== 'number') return null;
  if (exp <= Math.floor(Date.now() / 1000)) return null;
  return { uid, iat, exp };
}

// ---------- cookie ----------

/** 登入:簽一個 30 天的 session 寫進 cookie。只能在 server action 或 route handler 呼叫。 */
export async function createSession(uid: string): Promise<void> {
  const secret = getSecret();
  if (!secret) throw new Error('缺少 SESSION_SECRET,無法建立登入 session。');
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ uid, iat: now, exp: now + SESSION_MAX_AGE }, secret);
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

// ---------- 會員查詢 ----------

type PlatformUserRow = CurrentMember & { merged_into_user_id: string | null; status: string | null };

const USER_SELECT = 'id, display_name, picture_url, email, phone, line_user_id, merged_into_user_id, status';

/** 讀 platform_users 一筆,跟著 merged_into_user_id 走到最終那筆;deleted 或找不到回 null */
async function loadPlatformUser(uid: string): Promise<PlatformUserRow | null> {
  let id = uid;
  for (let hop = 0; hop <= MERGE_HOPS; hop++) {
    const { data, error } = await supabaseAdmin.from('platform_users').select(USER_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as PlatformUserRow;
    if (row.merged_into_user_id && row.merged_into_user_id !== row.id) {
      id = row.merged_into_user_id;
      continue;
    }
    if (row.status === 'deleted') return null;
    return row;
  }
  return null;
}

/**
 * 取得目前登入的會員;還沒登入、cookie 無效、或會員不存在都回 null。
 * 同一次 request 內用 React cache() 去重。資料庫查不到時記錄錯誤並當未登入,不讓整頁 500。
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const secret = getSecret();
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token, secret);
  if (!payload) return null;
  try {
    const row = await loadPlatformUser(payload.uid);
    if (!row) return null;
    return {
      id: row.id,
      display_name: row.display_name,
      picture_url: row.picture_url,
      email: row.email,
      phone: row.phone,
      line_user_id: row.line_user_id,
    };
  } catch (e) {
    console.error('[member-auth] 讀取會員資料失敗,暫時視為未登入:', e);
    return null;
  }
});

// ---------- 登入時對回(或建立)會員 ----------

export type ResolveUserInput = {
  provider: AuthProvider;
  /** 該登入方式的識別碼:email 用 Supabase Auth 的 user.id;line 用 LINE userId;google 用 Google 的 sub */
  providerId: string;
  email?: string | null;
  displayName?: string | null;
  pictureUrl?: string | null;
};

/**
 * 登入成功後把外部身分對回 platform_users.id;找不到就建新會員。
 * 順序:auth_methods(provider + provider_id)→ email 相同視為同一人 → line_user_id(LINE 時)→ 新建。
 * 既有的 platform_users 列只補空的欄位(名字、頭像、email),不覆寫客人改過的東西。
 */
export async function resolveOrCreateUser(input: ResolveUserInput): Promise<string> {
  const sb = supabaseAdmin;
  const email = input.email?.trim().toLowerCase() || null;
  const displayName = input.displayName?.trim() || null;
  const pictureUrl = input.pictureUrl?.trim() || null;

  let uid: string | null = null;

  // 1. 這個登入方式已經綁過
  const { data: method, error: methodErr } = await sb
    .from('platform_user_auth_methods')
    .select('platform_user_id')
    .eq('provider', input.provider)
    .eq('provider_id', input.providerId)
    .maybeSingle();
  if (methodErr) throw methodErr;
  if (method) uid = (method as { platform_user_id: string }).platform_user_id;

  // 2. 同一個 email 視為同一人(不分大小寫;ilike 的 % 與 _ 要跳脫)
  if (!uid && email) {
    const { data: byEmail, error } = await sb
      .from('platform_users')
      .select('id')
      .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (byEmail) uid = (byEmail as { id: string }).id;
  }

  // 3. LINE:既有的 line_user_id(LINE Bot 加好友時建的會員)
  if (!uid && input.provider === 'line') {
    const { data: byLine, error } = await sb
      .from('platform_users')
      .select('id')
      .eq('line_user_id', input.providerId)
      .neq('status', 'deleted')
      .maybeSingle();
    if (error) throw error;
    if (byLine) uid = (byLine as { id: string }).id;
  }

  // 4. 新會員
  if (!uid) {
    const { data: created, error } = await sb
      .from('platform_users')
      .insert({
        email,
        display_name: displayName,
        picture_url: pictureUrl,
        line_user_id: input.provider === 'line' ? input.providerId : null,
        status: 'active',
        primary_auth_provider: input.provider,
        email_verified: input.provider !== 'line' && email !== null,
      })
      .select('id')
      .single();
    if (error) throw error;
    uid = (created as { id: string }).id;
  }

  // 重複帳號:跟到最終那筆
  const finalRow = await loadPlatformUser(uid);
  if (!finalRow) throw new Error('會員資料不存在或已刪除。');
  uid = finalRow.id;

  // 記下這個登入方式(第一次才寫;23505 = 同一瞬間被寫過,忽略)
  if (!method) {
    const { error } = await sb.from('platform_user_auth_methods').insert({
      platform_user_id: uid,
      provider: input.provider,
      provider_id: input.providerId,
      verified: true,
    });
    if (error && error.code !== '23505') throw error;
  }

  // 補空欄位:沒名字、沒頭像、沒 email 的才填,不覆寫
  const patch: Record<string, string> = {};
  if (!finalRow.display_name && displayName) patch.display_name = displayName;
  if (!finalRow.picture_url && pictureUrl) patch.picture_url = pictureUrl;
  if (!finalRow.email && email) patch.email = email;
  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from('platform_users').update(patch).eq('id', uid);
    if (error) console.warn('[member-auth] 補會員欄位失敗(不影響登入):', error.message);
  }

  return uid;
}
