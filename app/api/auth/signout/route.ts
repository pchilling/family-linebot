import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/member-auth';
import { safeReturnTo } from '@/lib/return-to';

/**
 * 登出(Phase 26):頁面上的登出按鈕用一般表單 POST 到這個固定網址(不用 server action,
 * 因為 action 的代號每次部署都可能改變,部署前開著的舊分頁按登出會找不到)。
 * 只收 POST:連結預取或爬蟲的 GET 不會把人登出。cookie 是 SameSite=Lax,外站用表單 POST 過來不會帶 cookie。
 * 清掉 stall_session 後 303 回表單帶的 return_to(預設首頁)。
 */
export async function POST(request: Request) {
  let returnTo = '/';
  try {
    const form = await request.formData();
    returnTo = safeReturnTo(form.get('return_to'));
  } catch {
    returnTo = '/';
  }
  const res = NextResponse.redirect(new URL(returnTo, request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
