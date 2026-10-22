// LINE 登入第一步(Phase 26):產生 state 與 nonce 存進 HttpOnly cookie,把使用者送去 LINE 授權頁。
// ?slug= 哪個攤位的登入頁來的;?return_to= 登入完成後要回哪一頁(都存在 cookie 裡,LINE 只會把 state 帶回來)。
// ?no_auto=1:授權網址加 disable_auto_login=true(不跳 LINE App,在網頁上登入),cookie 記 retried,再失敗就不重試。
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { LINE_OAUTH_COOKIE, OAUTH_MAX_AGE, encodeOAuthState, lineAuthorizeUrl, lineEnv, randomToken } from '@/lib/line-login';
import { loginErrorHref, safeReturnTo, siteOrigin, slugFromPath } from '@/lib/return-to';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const noAuto = sp.get('no_auto') === '1';
  const returnTo = safeReturnTo(sp.get('return_to'));
  const slug = (sp.get('slug') ?? '').trim() || slugFromPath(returnTo);
  if (!slug || !/^[A-Za-z0-9_-]+$/.test(slug)) redirect('/');

  const env = lineEnv();
  if (!env) {
    console.error('LINE 登入未設定:缺少 LINE_LOGIN_CHANNEL_ID(或 LIFF_CHANNEL_ID)或 LINE_LOGIN_CHANNEL_SECRET。');
    redirect(loginErrorHref(slug, 'line_failed', returnTo));
  }

  const state = randomToken();
  const nonce = randomToken();
  (await cookies()).set({
    name: LINE_OAUTH_COOKIE,
    value: encodeOAuthState({ state, nonce, return_to: returnTo, slug, ...(noAuto ? { retried: true as const } : {}) }),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_MAX_AGE,
  });

  redirect(lineAuthorizeUrl(env.channelId, state, nonce, siteOrigin(request.nextUrl.origin), { disableAutoLogin: noAuto }));
}
