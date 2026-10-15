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
import { lineClient } from '@/lib/line';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  order_no: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  payment_status: string;
  status: string;
  linepay_transaction_id: string | null;
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

  const orderUrl = (query: string) =>
    new URL(`/${slug}/order/${orderNo}${query}`, req.nextUrl.origin);

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, total_twd, shipping_fee_twd, payment_status, status, linepay_transaction_id, users(line_user_id)',
    )
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const order = (data ?? null) as unknown as OrderRow | null;

  if (!order) {
    console.error('[linepay confirm] 找不到訂單', orderNo);
    return NextResponse.redirect(home);
  }
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

  const amount = order.total_twd + (order.shipping_fee_twd ?? 0);
  const confirmed = await confirmLinePayPayment(transactionId, amount);
  if (!confirmed.ok) {
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
  }

  const lineUserId = order.users?.line_user_id;
  if (lineUserId) {
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
      await lineClient.pushMessage({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text:
              `✓ 已收到您的 LINE Pay 付款\n` +
              `訂單編號:${order.order_no}\n` +
              `付款金額:NT$ ${amount.toLocaleString()}\n\n` +
              `我們會盡快為您出貨,謝謝!\n` +
              `${baseUrl}/${slug}/order/${order.order_no}`,
          },
        ],
      });
    } catch (e) {
      console.warn('[linepay confirm] push 失敗', e);
    }
  }

  return NextResponse.redirect(orderUrl('?linepay=done'));
}
