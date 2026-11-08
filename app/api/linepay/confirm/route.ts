/**
 * LINE Pay 付款完成導回入口(2026-10-15)
 *
 * 客人在 LINE Pay 付款頁按確認後,LINE Pay 會把瀏覽器導回這裡,
 * 並帶上 transactionId / orderId。這一步呼叫 confirm API 才真的扣款,
 * 成功後把訂單標為已付款並推 LINE 通知,最後導回客人的訂單頁。
 *
 * 安全:金額一律以 DB 的訂單金額為準;transactionId 必須跟發動付款時存的那筆相同。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { confirmLinePayPayment } from '@/lib/linepay';
import { buildPaymentFlexMessage, lineClientFor, notifyAdmin } from '@/lib/line';
import { getTenantBySlug, orderPayable, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  tenant_id: string; // Phase 34:confirm 用訂單所屬攤位的金鑰
  order_no: string;
  total_twd: number;
  discount_twd: number | null; // Phase 33
  shipping_fee_twd: number | null;
  payment_status: string;
  status: string;
  linepay_transaction_id: string | null;
  access_key: string | null;
  users: { line_user_id: string | null } | null;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const slug = (sp.get('slug') ?? '').trim();
  const transactionId = (sp.get('transactionId') ?? '').trim();
  const orderNo = (sp.get('orderId') ?? '').trim();
  const home = new URL(slug ? `/${slug}` : '/', req.nextUrl.origin);

  if (!slug || !transactionId || !orderNo) {
    console.error('[linepay confirm] 參數不全', { slug, transactionId, orderNo });
    return NextResponse.redirect(home);
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.redirect(home);

  // Phase 22:導回訂單頁要帶存取碼(訂單載入後填入),沒帶的話客人會看到遮蔽版
  let accessKey = '';
  const orderUrl = (query: string) =>
    new URL(
      `/${slug}/order/${orderNo}${query}${accessKey ? `${query ? '&' : '?'}k=${accessKey}` : ''}`,
      req.nextUrl.origin,
    );

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, tenant_id, order_no, total_twd, discount_twd, shipping_fee_twd, payment_status, status, linepay_transaction_id, access_key, users(line_user_id)',
    )
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const order = (data ?? null) as unknown as OrderRow | null;

  if (!order) {
    console.error('[linepay confirm] 找不到訂單', orderNo);
    return NextResponse.redirect(home);
  }
  // Phase 22:交易序號對得上(只有 LINE Pay 真的導回來才會帶對)才在網址帶存取碼,
  // 不然任何人拿單號加隨便一個序號來敲這支就能拿到碼
  if (order.linepay_transaction_id === transactionId) accessKey = order.access_key ?? '';
  // 重複導回(客人按上一頁 / 重新整理)→ 直接看訂單頁,不再扣一次
  if (order.payment_status === 'paid') {
    return NextResponse.redirect(orderUrl('?linepay=done'));
  }
  // 已取消的單不收款(例如逾期自動取消後客人才按付款)— 沒呼叫 confirm 就不會扣到錢
  if (order.status === 'cancelled' || order.status === 'refunded') {
    console.warn('[linepay confirm] 訂單已取消,不收款', orderNo);
    return NextResponse.redirect(orderUrl('?linepay=cancelled_order'));
  }
  if (order.linepay_transaction_id !== transactionId) {
    console.error('[linepay confirm] 交易序號對不上', orderNo, transactionId);
    return NextResponse.redirect(orderUrl('?linepay=failed'));
  }

  // Phase 33:confirm 金額必須等於 reserve 時的金額,兩邊都用 orderPayable
  const amount = orderPayable(order);
  // Phase 34:金鑰由 DB 裡訂單的 tenant_id 決定(查詢已綁 tenant.id,兩者相等),不是由網址的 slug 決定
  const confirmed = await confirmLinePayPayment(order.tenant_id, transactionId, amount);
  if (!confirmed.ok) {
    if (confirmed.code === 'no_config') {
      // 這條已驗過 transactionId 對得上,不是垃圾請求;攤位金鑰被清除 / 解不開,沒 confirm 就不會扣款
      console.error('[linepay confirm] 攤位沒有金鑰,訂單未請款', order.order_no, order.tenant_id, confirmed.code);
      await notifyAdmin('LINE Pay 導回但攤位沒有金鑰,訂單未請款', [
        `訂單 ${order.order_no}`,
        '客人沒有被扣款。請到該攤位「設定 → 收款」重新填入 LINE Pay 金鑰後,請客人再付一次。',
      ]);
    }
    return NextResponse.redirect(orderUrl('?linepay=failed'));
  }

  // paid_at 由 trigger handle_order_status_change 自動填
  const { error: updErr } = await supabaseAdmin
    .from('orders')
    .update({ status: 'paid', payment_status: 'paid', payment_method: 'line_pay' })
    .eq('id', order.id);
  if (updErr) {
    // 錢已經收了,這裡失敗只能靠人工補標,務必留 log
    console.error('[linepay confirm] 已扣款但更新訂單失敗', order.order_no, transactionId, updErr);
    await notifyAdmin('LINE Pay 已扣款但訂單沒標到已收款', [
      `訂單 ${order.order_no},NT$ ${amount}`,
      `交易序號 ${transactionId}`,
      '請到後台手動標已收款(明早排程也會再補一次)。',
    ]);
  }

  const lineUserId = order.users?.line_user_id;
  if (lineUserId) {
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
      const client = await lineClientFor(order.tenant_id); // Phase 38:用這張單所屬攤位的 LINE 帳號
      await client.pushMessage({
        to: lineUserId,
        messages: [
          buildPaymentFlexMessage({
            kind: 'paid',
            orderNo: order.order_no,
            amountTwd: amount,
            orderUrl: `${baseUrl}/${slug}/order/${order.order_no}${accessKey ? `?k=${accessKey}` : ''}`,
          }),
        ],
      });
    } catch (e) {
      console.warn('[linepay confirm] push 失敗', e);
    }
  }

  return NextResponse.redirect(orderUrl('?linepay=done'));
}
