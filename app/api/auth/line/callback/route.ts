// LINE 授權後回來的地方(Phase 26):比對 state → 用 code 換 token → 請 LINE 驗 id_token(含 nonce)
// → 對回 platform_users(LINE Bot 好友靠 line_user_id 對到同一個會員)→ 寫 stall_session cookie → 回原頁。
// 失敗一律回該攤位的 /login?error=line_failed;使用者在 LINE 按取消回 line_denied。細節只進 console。
// 例外:state 對不上但 cookie 還在,多半是 iPhone / iPad 上 LINE 自動登入(跳 LINE App)失敗,
// 先用 disable_auto_login 自動重試一次(/api/auth/line/start?no_auto=1),重試過還失敗才回錯誤。
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { LINE_OAUTH_COOKIE, decodeOAuthState, exchangeLineCode, lineEnv, sameToken, verifyLineIdToken } from '@/lib/line-login';
import { createSession, resolveOrCreateUser } from '@/lib/member-auth';
import { loginErrorHref, safeReturnTo, siteOrigin } from '@/lib/return-to';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const store = await cookies();
  const saved = decodeOAuthState(store.get(LINE_OAUTH_COOKIE)?.value);
  // state 是一次性的:不論成功失敗都清掉
  store.delete(LINE_OAUTH_COOKIE);
  const slug = saved?.slug ?? null;
  const returnTo = safeReturnTo(saved?.return_to, slug ? `/${slug}` : '/');
  const fail = (code: 'line_failed' | 'line_denied') => loginErrorHref(slug, code, returnTo);

  // 使用者在 LINE 那邊按取消(error=access_denied),或 LINE 回其他錯誤
  const lineError = sp.get('error');
  if (lineError) {
    console.error('LINE 授權回錯誤:', lineError, sp.get('error_description'));
    redirect(fail(lineError === 'access_denied' ? 'line_denied' : 'line_failed'));
  }

  const state = sp.get('state');
  const code = sp.get('code');
  if (!saved || !state || !code || !sameToken(saved.state, state)) {
    const why = !saved ? 'cookie 不見了(過期、換了瀏覽器或不是從本站發起)' : !state || !code ? '缺 state 或 code' : 'state 對不上';
    console.error(`LINE callback 驗證失敗:${why}${saved?.retried ? '(已是關閉自動登入後的重試)' : ''}。`);
    // LINE 自動登入失敗時會帶無效的 code 和對不上的 state 回來,官方建議改用 disable_auto_login 重試一次
    if (saved && state && code && !saved.retried) {
      redirect(`/api/auth/line/start?no_auto=1&slug=${encodeURIComponent(saved.slug)}&return_to=${encodeURIComponent(returnTo)}`);
    }
    redirect(fail('line_failed'));
  }

  const env = lineEnv();
  if (!env) {
    console.error('LINE 登入未設定:缺少 channel id / secret。');
    redirect(fail('line_failed'));
  }

  let uid: string | null = null;
  try {
    const idToken = await exchangeLineCode(code, env, siteOrigin(request.nextUrl.origin));
    const profile = await verifyLineIdToken(idToken, env.channelId, saved.nonce);
    uid = await resolveOrCreateUser({
      provider: 'line',
      providerId: profile.sub,
      email: profile.email,
      displayName: profile.name,
      pictureUrl: profile.picture,
    });
  } catch (e) {
    console.error('LINE 登入失敗:', e);
  }
  if (!uid) redirect(fail('line_failed'));

  await createSession(uid);
  redirect(returnTo);
}
