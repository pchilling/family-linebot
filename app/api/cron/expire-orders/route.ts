/**
 * 逾期未付款訂單自動取消(2026-10-15)
 *
 * 由 Vercel Cron 每天台北時間 09:00 觸發(見 vercel.json)。
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
import { lineClient } from '@/lib/line';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 期限:線上付款是當下就該付完,給短一點;匯款要跑銀行,給寬一點
const EXPIRE_DAYS: Record<string, number> = {
  line_pay: 1,
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[expire-orders] 未設定 CRON_SECRET,拒絕執行');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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
    `[expire-orders] 檢查 ${(data ?? []).length} 筆,取消 ${cancelled.length} 筆`,
    cancelled.join(', '),
  );
  return NextResponse.json({
    checked: (data ?? []).length,
    cancelled: cancelled.length,
    orders: cancelled,
    // widestCutoff 只是撈取範圍的下限,實際判斷在上面逐筆做
    scanned_since: widestCutoff,
  });
}
