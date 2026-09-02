'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';

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

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ payment_last5: last5, payment_reported_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .eq('payment_status', 'pending');

  if (error) {
    console.error('[reportPaymentLast5]', error);
    throw new Error('回報失敗,請稍後再試');
  }

  revalidatePath(`/${slug}/order/${orderNo}`);
  redirect(`/${slug}/order/${orderNo}?reported=1`);
}
