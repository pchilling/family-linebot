'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { lineClientFor } from '@/lib/line';

/**
 * D#14(2026-09-02):客人在訂單頁自助回報匯款後 5 碼。
 * 不用進 LINE 找客服 — 寫入 orders.payment_last5 + payment_reported_at,
 * 後台訂單列表會亮「已回報」標記,管理員核帳後照舊按「確認已收款」。
 * 只在 payment_status 還是 pending 時可寫(已收款的單不動)。
 */
export async function reportPaymentLast5(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const orderNo = String(formData.get('order_no') ?? '').trim();
  const last5 = String(formData.get('last5') ?? '').trim();

  if (!slug || !orderNo) throw new Error('缺訂單資訊');
  if (!/^\d{5}$/.test(last5)) throw new Error('後 5 碼需為 5 位數字');

  const tenant = await getTenantPublic(slug);
  if (!tenant) throw new Error('攤位不存在');

  // Phase 22:存取碼對不上就不給回報(不然任何人都能對別人的單亂填後 5 碼)
  const k = String(formData.get('k') ?? '').trim();
  const { data: keyRow } = await supabaseAdmin
    .from('orders')
    .select('access_key')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const accessKey = (keyRow as { access_key: string | null } | null)?.access_key ?? null;
  if (!accessKey || k !== accessKey) throw new Error('連結無效,請從 LINE 通知或下單完成頁的連結開啟這張訂單');

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({ payment_last5: last5, payment_reported_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .eq('payment_status', 'pending')
    .select('user_id');

  if (error) {
    console.error('[reportPaymentLast5]', error);
    throw new Error('回報失敗,請稍後再試');
  }

  // 2026-09-12:LIFF 來的訂單有 LINE 身分 → 回報成功推確認訊息(聊天室有最新狀態)
  const userId = (updated as { user_id: string | null }[] | null)?.[0]?.user_id ?? null;
  if (userId) {
    try {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('line_user_id')
        .eq('id', userId)
        .maybeSingle();
      const lineUserId = (u as { line_user_id: string | null } | null)?.line_user_id;
      if (lineUserId) {
        const client = await lineClientFor(tenant.id); // Phase 38:用這個攤位的 LINE 帳號
        await client.pushMessage({
          to: lineUserId,
          messages: [{
            type: 'text',
            text: `✓ 已收到您回報的帳號後 5 碼(${last5})\n訂單 ${orderNo} 等待賣家核帳中。`,
          }],
        });
      }
    } catch (e) {
      console.warn('[reportPaymentLast5 push]', e);
    }
  }

  revalidatePath(`/${slug}/order/${orderNo}`);
  redirect(`/${slug}/order/${orderNo}?reported=1&k=${accessKey}`);
}

/**
 * Phase 27(2026-11-01):掃碼付款的客人按「我已付款」回報。
 * 沒有後 5 碼可填(LINE Pay 轉帳、街口都沒有),改成選填備註(轉帳時間、暱稱、後幾碼都行),
 * 寫 payment_reported_at + payment_note,後台「待核帳」人工確認,其餘規則同回報後 5 碼。
 */
export async function reportQrPaid(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const orderNo = String(formData.get('order_no') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim().slice(0, 100);
  if (!slug || !orderNo) throw new Error('缺訂單資訊');

  const tenant = await getTenantPublic(slug);
  if (!tenant) throw new Error('攤位不存在');

  const k = String(formData.get('k') ?? '').trim();
  const { data: keyRow } = await supabaseAdmin
    .from('orders')
    .select('access_key, payment_method')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const row = keyRow as { access_key: string | null; payment_method: string | null } | null;
  const accessKey = row?.access_key ?? null;
  if (!accessKey || k !== accessKey) throw new Error('連結無效,請從下單完成頁的連結開啟這張訂單');
  if (row?.payment_method !== 'qr') throw new Error('這筆訂單不是掃碼付款');

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({ payment_note: note || null, payment_reported_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .eq('payment_status', 'pending')
    .select('user_id');
  if (error) {
    console.error('[reportQrPaid]', error);
    throw new Error('回報失敗,請稍後再試');
  }

  // LIFF / LINE 身分的訂單推一則確認
  const userId = (updated as { user_id: string | null }[] | null)?.[0]?.user_id ?? null;
  if (userId) {
    try {
      const { data: u } = await supabaseAdmin.from('users').select('line_user_id').eq('id', userId).maybeSingle();
      const lineUserId = (u as { line_user_id: string | null } | null)?.line_user_id;
      if (lineUserId) {
        const client = await lineClientFor(tenant.id); // Phase 38
        await client.pushMessage({
          to: lineUserId,
          messages: [{ type: 'text', text: `✓ 已收到您的付款回報\n訂單 ${orderNo} 等待賣家核帳中。` }],
        });
      }
    } catch (e) {
      console.warn('[reportQrPaid push]', e);
    }
  }

  revalidatePath(`/${slug}/order/${orderNo}`);
  redirect(`/${slug}/order/${orderNo}?reported=1&k=${accessKey}`);
}
