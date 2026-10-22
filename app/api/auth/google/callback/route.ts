// Google 授權後回來的地方(Phase 26):比對 state → 用 code 換 token → 檢查 id_token(含 nonce)
// → 對回 platform_users(同一個已驗證 email 視為同一人)→ 寫 stall_session cookie → 回原頁。
// 失敗一律回該攤位的 /login?error=google_failed;使用者在 Google 按取消回 google_denied。細節只進 console。
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { GOOGLE_OAUTH_COOKIE, exchangeGoogleCode, googleEnv, verifyGoogleIdToken } from '@/lib/google-login';
import { decodeOAuthState, sameToken } from '@/lib/line-login';
import { createSession, resolveOrCreateUser } from '@/lib/member-auth';
import { loginErrorHref, safeReturnTo, siteOrigin } from '@/lib/return-to';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const store = await cookies();
  const saved = decodeOAuthState(store.get(GOOGLE_OAUTH_COOKIE)?.value);
  // state 是一次性的:不論成功失敗都清掉
  store.delete(GOOGLE_OAUTH_COOKIE);
  const slug = saved?.slug ?? null;
  const returnTo = safeReturnTo(saved?.return_to, slug ? `/${slug}` : '/');
  const fail = (code: 'google_failed' | 'google_denied') => loginErrorHref(slug, code, returnTo);

  const googleError = sp.get('error');
  if (googleError) {
    console.error('Google 授權回錯誤:', googleError, sp.get('error_description'));
    redirect(fail(googleError === 'access_denied' ? 'google_denied' : 'google_failed'));
  }

  const state = sp.get('state');
  const code = sp.get('code');
  if (!saved || !state || !code || !sameToken(saved.state, state)) {
    console.error('Google callback 的 state 對不上或缺參數(cookie 過期、重複開啟或不是從本站發起)。');
    redirect(fail('google_failed'));
  }

  const env = googleEnv();
  if (!env) {
    console.error('Google 登入未設定:缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET。');
    redirect(fail('google_failed'));
  }

  let uid: string | null = null;
  try {
    const idToken = await exchangeGoogleCode(code, env, siteOrigin(request.nextUrl.origin));
    const profile = verifyGoogleIdToken(idToken, env.clientId, saved.nonce);
    uid = await resolveOrCreateUser({
      provider: 'google',
      providerId: profile.sub,
      email: profile.email,
      displayName: profile.name,
      pictureUrl: profile.picture,
    });
  } catch (e) {
    console.error('Google 登入失敗:', e);
  }
  if (!uid) redirect(fail('google_failed'));

  await createSession(uid);
  redirect(returnTo);
}
