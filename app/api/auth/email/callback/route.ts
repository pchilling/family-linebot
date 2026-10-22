// 信箱登入連結回來的地方(Phase 26):/api/auth/email/callback?token_hash=…&type=…&return_to=…
// (連結由 app/[slug]/login/actions.ts 用 Supabase admin generateLink 產生、Resend 寄出)。
// 用 token_hash 向 Supabase Auth 驗證,對回 platform_users,寫我們自己的 stall_session cookie,然後回原頁;
// Supabase 自己的 session 驗完就登出清掉,只留我們的 cookie(後台管理員登入也是用 Supabase Auth,不要混在一起)。
import type { EmailOtpType, User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createSession, resolveOrCreateUser } from '@/lib/member-auth';
import { loginErrorHref, safeReturnTo, slugFromPath } from '@/lib/return-to';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/** token_hash 連結接受的 type(generateLink 回 magiclink;第一次用信箱登入的新帳號回 signup) */
const OTP_TYPES: readonly string[] = ['magiclink', 'email', 'signup'];

/** 從 Supabase 的使用者資料取顯示名稱 / 頭像(信箱登入通常沒有;同信箱以前用 Google 登入過才有) */
function metaStr(user: User, keys: string[]): string | null {
  const m = user.user_metadata ?? {};
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(sp.get('return_to'));
  const slug = (sp.get('slug') ?? '').trim() || slugFromPath(returnTo);
  const fail = (key: string) => loginErrorHref(slug, key, returnTo);

  // Supabase 驗證失敗時會帶 error / error_code 回來(連結過期…)
  const authError = sp.get('error');
  if (authError) {
    console.error('Supabase Auth 回錯誤:', authError, sp.get('error_code'), sp.get('error_description'));
    redirect(fail(sp.get('error_code') === 'otp_expired' ? 'expired' : 'invalid_link'));
  }

  const tokenHash = sp.get('token_hash');
  const type = sp.get('type');
  if (!tokenHash || !type || !OTP_TYPES.includes(type)) redirect(fail('invalid_link'));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (error) {
    console.error('verifyOtp 失敗:', error.code ?? error.status, error.message);
    redirect(fail(error.code === 'otp_expired' ? 'expired' : 'verify_failed'));
  }
  const user = data.user;
  if (!user?.email) redirect(fail('no_email'));

  let uid: string | null = null;
  try {
    uid = await resolveOrCreateUser({
      provider: 'email',
      providerId: user.id,
      email: user.email,
      displayName: metaStr(user, ['full_name', 'name']),
      pictureUrl: metaStr(user, ['avatar_url', 'picture']),
    });
  } catch (e) {
    console.error('對應會員失敗:', e);
  }
  if (!uid) redirect(fail('server'));

  await createSession(uid);

  // 只留我們自己的 cookie:把剛拿到的 Supabase session 登出,順便清掉它寫的 cookie
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) console.warn('清除 Supabase session 失敗(不影響登入):', signOutError.message);

  redirect(returnTo);
}
