'use server';

import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

export type LookupOrderResult =
  | { ok: true; orderNo: string }
  | { ok: false; error: string };

/**
 * Guest 查訂單:用 order_no + (email 或 phone) 比對。
 *
 * 安全性:
 * - 找不到 / email/phone 不對 都回同樣的訊息(避免 enumeration)
 * - 比對 guest_email / guest_phone / shipping_phone(訂單可能存在不同位置)
 */
export async function lookupOrder(formData: FormData): Promise<LookupOrderResult> {
  const slug = String(formData.get('tenantSlug') ?? '').trim();
  const orderNo = String(formData.get('order_no') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!orderNo) return { ok: false, error: '請填訂單編號' };
  if (!email && !phone) return { ok: false, error: '請填 Email 或電話(其中一項)' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('order_no, guest_email, guest_phone, shipping_phone')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();

  if (error) {
    console.error('[lookupOrder]', error);
    return { ok: false, error: '查詢失敗,請稍後再試' };
  }

  // 重要:找不到 / 不匹配 都回同樣訊息,避免 enumeration attack
  const notFoundMsg = '找不到訂單,請確認訂單編號與 Email/電話正確';
  if (!data) return { ok: false, error: notFoundMsg };

  type OrderRow = {
    order_no: string;
    guest_email: string | null;
    guest_phone: string | null;
    shipping_phone: string | null;
  };
  const o = data as OrderRow;

  let matched = false;
  if (email && o.guest_email && o.guest_email.toLowerCase() === email) matched = true;
  if (phone && (o.guest_phone === phone || o.shipping_phone === phone)) matched = true;

  if (!matched) return { ok: false, error: notFoundMsg };

  return { ok: true, orderNo: o.order_no };
}
