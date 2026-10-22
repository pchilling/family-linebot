// 登入流程共用的小工具(Phase 26,2026-10-23)。前後端都會用,所以不加 server-only。

/** 登出的固定網址:頁面上的登出按鈕用一般表單 POST 到這裡(app/api/auth/signout/route.ts),不用 server action,
 *  因為部署前開著的舊分頁送出的 action 代號新版本會找不到。 */
export const SIGNOUT_URL = '/api/auth/signout';

/** return_to 的長度上限(超過就當不合法) */
const RETURN_TO_MAX = 512;

/**
 * 只接受站內路徑:以 / 開頭、不是 //(協定相對網址)、沒有控制字元或空白,
 * 也不接受登入流程自己的頁(避免繞圈)。不合法一律回 fallback。
 */
export function safeReturnTo(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  if (!v || v.length > RETURN_TO_MAX) return fallback;
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback;
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return fallback;
  if (/^\/[^/?#]+\/login(\/|\?|#|$)/.test(v)) return fallback;
  if (v.startsWith('/api/auth/') || v.startsWith('/auth/')) return fallback;
  return v;
}

/** 從站內路徑推攤位 slug(/oilswa/p/xxx → oilswa);平台路徑推不出來回 null */
export function slugFromPath(path: string): string | null {
  const m = path.match(/^\/([A-Za-z0-9_-]+)(?:[/?#]|$)/);
  if (!m) return null;
  const s = m[1];
  if (['api', 'admin', 'm', 'auth', 'policy', 'login', '_next'].includes(s)) return null;
  return s;
}

/** 組攤位登入頁網址:/[slug]/login?return_to=<站內路徑> */
export function loginHref(slug: string, returnTo: string): string {
  const safe = safeReturnTo(returnTo, `/${slug}`);
  return `/${slug}/login?return_to=${encodeURIComponent(safe)}`;
}

/** 組登入失敗網址:/[slug]/login?error=<key>&return_to=<站內路徑> */
export function loginErrorHref(slug: string | null, error: string, returnTo: string): string {
  if (!slug) return '/';
  const safe = safeReturnTo(returnTo, `/${slug}`);
  return `/${slug}/login?error=${encodeURIComponent(error)}&return_to=${encodeURIComponent(safe)}`;
}

/**
 * 網站 origin(OAuth 導回網址、登入信連結都要用,要跟 LINE / Google 後台登記的一字不差)。
 * 優先 NEXT_PUBLIC_SITE_ORIGIN(本機開發設 http://localhost:3000),再來是這次 request 的 origin,
 * 最後才是正式站網址。
 */
export function siteOrigin(requestOrigin?: string | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/+$/, '');
  if (env) return env;
  if (requestOrigin) return requestOrigin.replace(/\/+$/, '');
  return (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
}
