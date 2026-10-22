// Google 登入第一步(Phase 26):產生 state 與 nonce 存進 HttpOnly cookie,把使用者送去 Google 授權頁(本站自己的 OAuth client)。
// ?slug= 哪個攤位的登入頁來的;?return_to= 登入完成後要回哪一頁(都存在 cookie 裡,Google 只會把 state 帶回來)。
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { GOOGLE_OAUTH_COOKIE, googleAuthorizeUrl, googleEnv } from '@/lib/google-login';
import { OAUTH_MAX_AGE, encodeOAuthState, randomToken } from '@/lib/line-login';
import { loginErrorHref, safeReturnTo, siteOrigin, slugFromPath } from '@/lib/return-to';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(sp.get('return_to'));
  const slug = (sp.get('slug') ?? '').trim() || slugFromPath(returnTo);
  if (!slug || !/^[A-Za-z0-9_-]+$/.test(slug)) redirect('/');

  const env = googleEnv();
  if (!env) {
    console.error('Google 登入未設定:缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET。');
    redirect(loginErrorHref(slug, 'google_failed', returnTo));
  }

  const state = randomToken();
  const nonce = randomToken();
  (await cookies()).set({
    name: GOOGLE_OAUTH_COOKIE,
    value: encodeOAuthState({ state, nonce, return_to: returnTo, slug }),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_MAX_AGE,
  });

  redirect(googleAuthorizeUrl(env.clientId, state, nonce, siteOrigin(request.nextUrl.origin)));
}
