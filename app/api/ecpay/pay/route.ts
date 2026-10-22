/**
 * 綠界付款的瀏覽器端入口(2026-10-22)
 *
 * GET  /api/ecpay/pay?slug=…&orderNo=…&method=atm|credit
 *   對一張既有訂單發動綠界付款:組好參數與檢查碼,回一個會自動送出的表單,
 *   把客人的瀏覽器 POST 到綠界付款頁。網頁結帳與 LINE 商品專區都直接導到這裡。
 *
 * POST /api/ecpay/pay
 *   綠界把客人的瀏覽器導回來(信用卡 OrderResultURL / ATM 取號 ClientRedirectURL),
 *   帶著跟 Server 端通知一樣的欄位。驗過檢查碼就順手更新訂單(跟 /api/ecpay/notify
 *   做一樣的事,重複呼叫不會重複處理),然後 303 導到客人的訂單頁。
 *
 * 安全:金額一律以 DB 的訂單金額為準;導回的資料沒驗過檢查碼就只拿來決定導去哪一頁。
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  applyEcpayAtmInfo,
  applyEcpayPaymentResult,
  buildEcpayCheckout,
  findEcpayOrder,
  isEcpayConfigured,
  makeMerchantTradeNo,
  verifyEcpayCallback,
  type EcpayFields,
  type EcpayMethod,
} from '@/lib/ecpay';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  order_no: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  payment_status: string;
  status: string;
  payment_method: string | null;
  atm_vaccount: string | null;
  atm_expire_at: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 會自動送出的跳轉頁;沒開 JavaScript 的話留一顆按鈕 */
function autoSubmitPage(action: string, fields: EcpayFields): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>前往綠界付款</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: -apple-system, "Noto Sans TC", system-ui, sans-serif; color: #52525b; background: #fafaf9; }
  main { text-align: center; padding: 24px; }
  button { margin-top: 16px; padding: 10px 18px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; font-size: 14px; }
</style>
</head>
<body>
<main>
  <p>正在前往綠界付款頁,請稍候…</p>
  <form id="ecpay-form" method="post" action="${escapeHtml(action)}">
${inputs}
    <noscript><button type="submit">若沒有自動跳轉,請按這裡</button></noscript>
  </form>
</main>
<script>document.getElementById('ecpay-form').submit();</script>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const slug = (sp.get('slug') ?? '').trim();
  const orderNo = (sp.get('orderNo') ?? '').trim();
  const methodParam = (sp.get('method') ?? '').trim().toLowerCase();
  const method: EcpayMethod | null = methodParam === 'atm' ? 'atm' : methodParam === 'credit' ? 'credit' : null;
  const home = new URL(slug ? `/${slug}` : '/', req.nextUrl.origin);

  if (!slug || !orderNo || !method) {
    console.error('[ecpay pay] 參數不全', { slug, orderNo, methodParam });
    return NextResponse.redirect(home);
  }
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.redirect(home);

  const orderUrl = (query: string) => new URL(`/${slug}/order/${orderNo}${query}`, req.nextUrl.origin);

  if (!hasFeature(tenant, 'ecpay') || !isEcpayConfigured()) {
    console.error('[ecpay pay] 此攤位未開放綠界', slug);
    return NextResponse.redirect(orderUrl('?ecpay=failed'));
  }
  // ATM 虛擬帳號另有 ecpay_atm flag(2026-10-22 起預設關,只開信用卡)
  if (method === 'atm' && !hasFeature(tenant, 'ecpay_atm')) {
    console.error('[ecpay pay] 此攤位未開放 ATM 虛擬帳號', slug);
    return NextResponse.redirect(orderUrl('?ecpay=failed'));
  }

  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, total_twd, shipping_fee_twd, payment_status, status, payment_method, atm_vaccount, atm_expire_at')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const order = (data ?? null) as OrderRow | null;

  if (!order) {
    console.error('[ecpay pay] 找不到訂單', orderNo);
    return NextResponse.redirect(home);
  }
  if (order.payment_status === 'paid') return NextResponse.redirect(orderUrl('?ecpay=done'));
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return NextResponse.redirect(orderUrl('?ecpay=cancelled_order'));
  }
  // ATM 已經取過號而且還沒過期 → 不要再要一組新帳號,直接回訂單頁看帳號
  if (
    method === 'atm' &&
    order.payment_method === 'ecpay_atm' &&
    order.atm_vaccount &&
    order.atm_expire_at &&
    new Date(order.atm_expire_at).getTime() > Date.now()
  ) {
    return NextResponse.redirect(orderUrl('?ecpay=atm'));
  }

  const amount = order.total_twd + (order.shipping_fee_twd ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    console.error('[ecpay pay] 金額異常', orderNo, amount);
    return NextResponse.redirect(orderUrl('?ecpay=failed'));
  }

  const merchantTradeNo = makeMerchantTradeNo(order.order_no);
  const { error: updErr } = await supabaseAdmin
    .from('orders')
    .update({
      ecpay_merchant_trade_no: merchantTradeNo,
      payment_method: method === 'atm' ? 'ecpay_atm' : 'ecpay_credit',
    })
    .eq('id', order.id);
  if (updErr) {
    console.error('[ecpay pay] 存交易編號失敗', orderNo, updErr);
    return NextResponse.redirect(orderUrl('?ecpay=failed'));
  }

  // 綠界要打得到的公開網址;本機開發時 NEXT_PUBLIC_PROD_URL 沒設就退回目前 origin
  const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
  const checkout = buildEcpayCheckout({
    merchantTradeNo,
    amount,
    method,
    tradeDesc: `${tenant.name} 網路訂單`,
    itemName: `${tenant.name} 訂單 ${order.order_no}`,
    orderId: order.id,
    returnUrl: `${baseUrl}/api/ecpay/notify`,
    paymentInfoUrl: `${baseUrl}/api/ecpay/notify`,
    browserReturnUrl: `${baseUrl}/api/ecpay/pay`,
    clientBackUrl: `${baseUrl}/${slug}/order/${order.order_no}`,
  });
  if (!checkout) return NextResponse.redirect(orderUrl('?ecpay=failed'));

  return new NextResponse(autoSubmitPage(checkout.action, checkout.fields), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const fields: EcpayFields = {};
  try {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string') fields[k] = v;
    }
  } catch (e) {
    console.error('[ecpay pay] 讀不到導回表單', e);
    return NextResponse.redirect(new URL('/', req.nextUrl.origin), 303);
  }

  // 先找訂單決定要導去哪(這一步不信任資料內容,只拿來找頁面)
  const order = await findEcpayOrder(fields);
  const slug = order?.tenants?.slug;
  if (!order || !slug) {
    console.error('[ecpay pay] 導回找不到訂單', fields.MerchantTradeNo, fields.CustomField1);
    return NextResponse.redirect(new URL('/', req.nextUrl.origin), 303);
  }
  const orderUrl = (query: string) => new URL(`/${slug}/order/${order.order_no}${query}`, req.nextUrl.origin);

  if (!verifyEcpayCallback(fields)) {
    console.error('[ecpay pay] 導回檢查碼不符', fields.MerchantTradeNo);
    return NextResponse.redirect(orderUrl('?ecpay=failed'), 303);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
  if (fields.RtnCode === '1') {
    const result = await applyEcpayPaymentResult(fields, baseUrl);
    console.log('[ecpay pay] 導回付款結果', fields.MerchantTradeNo, result);
    const ok = result === 'paid' || result === 'already_paid';
    return NextResponse.redirect(orderUrl(ok ? '?ecpay=done' : '?ecpay=failed'), 303);
  }
  if (fields.RtnCode === '2') {
    const result = await applyEcpayAtmInfo(fields);
    console.log('[ecpay pay] 導回取號結果', fields.MerchantTradeNo, result);
    return NextResponse.redirect(orderUrl('?ecpay=atm'), 303);
  }

  console.warn('[ecpay pay] 導回非成功', fields.MerchantTradeNo, fields.RtnCode, fields.RtnMsg);
  return NextResponse.redirect(orderUrl('?ecpay=failed'), 303);
}
