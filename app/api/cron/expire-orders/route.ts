/**
 * 每日訂單維護(2026-10-15 建立,2026-10-16 加 LINE Pay 抓漏,2026-10-22 加綠界抓漏)
 *
 * 由 Vercel Cron 每天台北時間 09:00 觸發(見 vercel.json),依序做三件事:
 *
 * 步驟 1 — LINE Pay 抓漏:
 *   客人在 LINE Pay 按了付款、但導回我們網站那一步失敗(關掉瀏覽器、網路斷),
 *   confirm 就沒跑到 → 錢沒被請款、訂單也還掛著未付款。
 *   這裡主動問 LINE Pay「這筆客人授權了沒」,有授權就補請款並標已付款。
 *   ⚠️ 一定要排在步驟 3 前面,否則會先把客人以為付過的單取消掉。
 *
 * 步驟 2 — 綠界抓漏:
 *   綠界付款(信用卡 / ATM)是綠界 Server 端通知我們,通知失敗它會重送 4 次,
 *   但還是可能漏(我們那時剛好掛掉)。這裡主動問綠界「這筆付了沒」,付了就補標已付款。
 *
 * 步驟 3 — 逾期未付款自動取消:
 * 訂單一成立就扣庫存,未付款的單若放著不管會一直佔庫存 —
 * 超過期限就自動標 cancelled,handle_order_cancel trigger 會把庫存退回來,
 * 並推一則 LINE 通知客人。
 *
 * 不會動到的單:
 *   - 已付款 / 已出貨 / 已取消
 *   - 客人已回報匯款後 5 碼的(代表他付了,在等核帳)
 *
 * 安全:只有帶對 CRON_SECRET 的請求能呼叫(這支會取消訂單,不能公開)。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { buildPaymentFlexMessage, lineClient } from '@/lib/line';
import { checkLinePayPaymentStatus, confirmLinePayPayment } from '@/lib/linepay';
import { applyEcpayPaymentResult, queryEcpayTrade } from '@/lib/ecpay';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 期限:線上付款是當下就該付完,給短一點;匯款要跑銀行,給寬一點。
// 綠界 ATM 虛擬帳號的繳費期限是 3 天(到第 3 天 23:59),這裡給 4 天,
// 確保一定是綠界那邊先到期、我們才取消,不會客人還能轉帳但單已經被取消。
const EXPIRE_DAYS: Record<string, number> = {
  line_pay: 1,
  ecpay_credit: 1,
  ecpay_atm: 4,
  bank: 3,
};
const DEFAULT_EXPIRE_DAYS = 3;

type ExpiringOrder = {
  id: string;
  order_no: string;
  payment_method: string | null;
  created_at: string;
  tenants: { slug: string } | null;
  users: { line_user_id: string | null } | null;
};

type PendingLinePayOrder = {
  id: string;
  order_no: string;
  total_twd: number;
  shipping_fee_twd: number | null;
  linepay_transaction_id: string;
  tenants: { slug: string } | null;
  users: { line_user_id: string | null } | null;
};

/**
 * 步驟 1:找出「有發動過 LINE Pay 但還沒標已付款」的訂單,問 LINE Pay 客人授權了沒。
 * 有授權就補 confirm(真正請款)並標已付款。回補標成功的單號。
 * 只看 7 天內的單 — 更舊的 LINE Pay 交易早就過期作廢了。
 */
async function reconcileLinePay(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, total_twd, shipping_fee_twd, linepay_transaction_id, tenants(slug), users(line_user_id)',
    )
    .eq('payment_status', 'pending')
    .eq('status', 'open')
    .not('linepay_transaction_id', 'is', null)
    .gte('created_at', since)
    .limit(100);

  if (error) {
    console.error('[reconcileLinePay] 查詢失敗', error);
    return [];
  }

  const recovered: string[] = [];
  for (const o of (data ?? []) as unknown as PendingLinePayOrder[]) {
    const status = await checkLinePayPaymentStatus(o.linepay_transaction_id);
    if (!status.authorized) continue; // 多半是客人根本沒付,略過

    const amount = o.total_twd + (o.shipping_fee_twd ?? 0);
    const confirmed = await confirmLinePayPayment(o.linepay_transaction_id, amount);
    if (!confirmed.ok) {
      console.error('[reconcileLinePay] 補請款失敗', o.order_no, confirmed.code, confirmed.error);
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid', payment_status: 'paid', payment_method: 'line_pay' })
      .eq('id', o.id)
      .eq('payment_status', 'pending'); // 期間內被人工標過就不要蓋掉
    if (updErr) {
      // 錢已經請款了,這裡失敗要人工補標
      console.error('[reconcileLinePay] 已請款但更新訂單失敗', o.order_no, updErr);
      continue;
    }
    recovered.push(o.order_no);
    console.log('[reconcileLinePay] 補收款成功', o.order_no, amount);

    const lineUserId = o.users?.line_user_id;
    const slug = o.tenants?.slug;
    if (lineUserId && slug) {
      const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
      try {
        await lineClient.pushMessage({
          to: lineUserId,
          messages: [
            buildPaymentFlexMessage({
              kind: 'paid',
              orderNo: o.order_no,
              amountTwd: amount,
              orderUrl: `${baseUrl}/${slug}/order/${o.order_no}`,
            }),
          ],
        });
      } catch (e) {
        console.warn('[reconcileLinePay] push 失敗', o.order_no, e);
      }
    }
  }
  return recovered;
}

type PendingEcpayOrder = {
  id: string;
  order_no: string;
  ecpay_merchant_trade_no: string;
};

/**
 * 步驟 2:找出「有發動過綠界付款但還沒標已付款」的訂單,問綠界付了沒。
 * 付了就走跟 Server 端通知一樣的處理(標已付款 + 推 LINE 通知卡)。
 * 綠界查詢有頻率限制(太密集會被鎖 30 分鐘),逐筆之間隔半秒;只看 7 天內、最多 30 筆。
 */
async function reconcileEcpay(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, ecpay_merchant_trade_no')
    .eq('payment_status', 'pending')
    .eq('status', 'open')
    .not('ecpay_merchant_trade_no', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(30);

  if (error) {
    console.error('[reconcileEcpay] 查詢失敗', error);
    return [];
  }

  const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
  const recovered: string[] = [];
  for (const o of (data ?? []) as PendingEcpayOrder[]) {
    const q = await queryEcpayTrade(o.ecpay_merchant_trade_no);
    if (!q.ok) {
      console.warn('[reconcileEcpay] 查詢失敗', o.order_no, q.error);
      continue;
    }
    if (q.paid) {
      // 組成跟綠界通知一樣的欄位,共用同一套更新邏輯(金額比對、推播、不重複處理)
      const result = await applyEcpayPaymentResult(
        {
          RtnCode: '1',
          MerchantTradeNo: o.ecpay_merchant_trade_no,
          TradeNo: q.tradeNo,
          TradeAmt: String(q.tradeAmt),
          PaymentType: q.paymentType,
          CustomField1: o.id,
        },
        baseUrl,
      );
      if (result === 'paid') {
        recovered.push(o.order_no);
        console.log('[reconcileEcpay] 補標已付款', o.order_no, q.tradeAmt);
      } else {
        console.warn('[reconcileEcpay] 綠界說已付款但沒補成', o.order_no, result);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return recovered;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[expire-orders] 未設定 CRON_SECRET,拒絕執行');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 步驟 1、2:先補收款,再做步驟 3 的逾期取消(順序不能顛倒)
  const recovered = await reconcileLinePay();
  const recoveredEcpay = await reconcileEcpay();

  const now = Date.now();
  // 先用最寬的期限撈,再依付款方式逐筆判斷
  const widestDays = Math.max(DEFAULT_EXPIRE_DAYS, ...Object.values(EXPIRE_DAYS));
  const widestCutoff = new Date(now - widestDays * 86400000).toISOString();
  const narrowestDays = Math.min(DEFAULT_EXPIRE_DAYS, ...Object.values(EXPIRE_DAYS));
  const narrowestCutoff = new Date(now - narrowestDays * 86400000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, payment_method, created_at, tenants(slug), users(line_user_id)')
    .eq('status', 'open')
    .eq('payment_status', 'pending')
    .is('payment_reported_at', null) // 已回報後 5 碼 = 客人已付款在等核帳,不能取消
    .lt('created_at', narrowestCutoff)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[expire-orders] 查詢失敗', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const candidates = ((data ?? []) as unknown as ExpiringOrder[]).filter((o) => {
    const days = EXPIRE_DAYS[o.payment_method ?? ''] ?? DEFAULT_EXPIRE_DAYS;
    return new Date(o.created_at).getTime() < now - days * 86400000;
  });

  const cancelled: string[] = [];
  for (const o of candidates) {
    // status 改 cancelled → trigger handle_order_cancel 自動退庫存
    const { error: updErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', o.id)
      .eq('status', 'open') // 期間內被人工處理過就不要蓋掉
      .eq('payment_status', 'pending');
    if (updErr) {
      console.error('[expire-orders] 取消失敗', o.order_no, updErr);
      continue;
    }
    cancelled.push(o.order_no);

    const lineUserId = o.users?.line_user_id;
    if (lineUserId) {
      const days = EXPIRE_DAYS[o.payment_method ?? ''] ?? DEFAULT_EXPIRE_DAYS;
      try {
        await lineClient.pushMessage({
          to: lineUserId,
          messages: [
            {
              type: 'text',
              text:
                `您的訂單 ${o.order_no} 因超過 ${days} 天未完成付款,已自動取消。\n\n` +
                `未向您收取任何費用,商品也已經放回架上。\n` +
                `還需要的話歡迎重新下單,有問題隨時跟我們說。`,
            },
          ],
        });
      } catch (e) {
        console.warn('[expire-orders] push 失敗', o.order_no, e);
      }
    }
  }

  console.log(
    `[expire-orders] LINE Pay 補收款 ${recovered.length} 筆;綠界補收款 ${recoveredEcpay.length} 筆;檢查 ${(data ?? []).length} 筆,取消 ${cancelled.length} 筆`,
    cancelled.join(', '),
  );
  return NextResponse.json({
    linepay_recovered: recovered.length,
    recovered_orders: recovered,
    ecpay_recovered: recoveredEcpay.length,
    ecpay_recovered_orders: recoveredEcpay,
    checked: (data ?? []).length,
    cancelled: cancelled.length,
    orders: cancelled,
    // widestCutoff 只是撈取範圍的下限,實際判斷在上面逐筆做
    scanned_since: widestCutoff,
  });
}
