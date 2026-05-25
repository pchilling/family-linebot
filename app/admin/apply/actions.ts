'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

export type ApplyError = { error: string };

/**
 * 自助申請開店(Phase 7.11,2026-05-26)。
 *
 * 流程:
 *   1. 驗證已登入(Supabase Auth)
 *   2. 校驗欄位:slug / order_prefix 格式 + 唯一性
 *   3. 找 / 建 platform_users(用 Google email)
 *   4. 建 tenant(status='pending')
 *   5. 建 tenant_members(role='owner')
 *   6. 建 default region(台灣)
 *   7. redirect /admin/{slug}
 *
 * 用戶可以立刻進後台設定商品 / 活動,但公開頁面(LIFF / store)會擋
 * (各 customer-facing helper 都 filter tenants.status='active')。
 */
export async function submitApplication(formData: FormData): Promise<ApplyError | void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { error: '請先登入' };
  }

  const tenantName = String(formData.get('tenant_name') ?? '').trim();
  const slug = String(formData.get('tenant_slug') ?? '').trim().toLowerCase();
  const orderPrefix = String(formData.get('order_prefix') ?? '').trim().toUpperCase();
  const applicantName = String(formData.get('applicant_name') ?? '').trim();
  const applicantPhone = String(formData.get('applicant_phone') ?? '').trim();
  const businessType = String(formData.get('business_type') ?? '').trim() || null;
  const applicationNotes = String(formData.get('application_notes') ?? '').trim() || null;

  if (!tenantName) return { error: '店名必填' };
  if (!applicantName) return { error: '聯絡人姓名必填' };
  if (!applicantPhone) return { error: '聯絡手機必填' };

  if (!/^[a-z0-9-]{3,20}$/.test(slug)) {
    return { error: '網址識別需 3-20 字,只能小寫英文 / 數字 / 連字號' };
  }
  if (!/^[A-Z]{2,5}$/.test(orderPrefix)) {
    return { error: '訂單前綴需 2-5 個大寫英文字母' };
  }

  // 唯一性檢查
  const { data: dupSlug } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (dupSlug) return { error: `網址識別「${slug}」已被使用` };

  const { data: dupPrefix } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('order_prefix', orderPrefix)
    .maybeSingle();
  if (dupPrefix) return { error: `訂單前綴「${orderPrefix}」已被使用` };

  // 1. 找 / 建 platform_users(可能因為早期是 LINE 用戶登入過,已存在)
  let userId: string;
  const { data: existingPu } = await supabaseAdmin
    .from('platform_users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingPu) {
    userId = (existingPu as { id: string }).id;
  } else {
    const { data: newPu, error: puErr } = await supabaseAdmin
      .from('platform_users')
      .insert({
        email: user.email,
        display_name: applicantName,
        picture_url: user.user_metadata?.avatar_url ?? null,
      })
      .select('id')
      .single();
    if (puErr || !newPu) {
      console.error('[submitApplication] platform_users insert', puErr);
      return { error: '系統錯誤,請稍候重試' };
    }
    userId = (newPu as { id: string }).id;
  }

  // 2. 建 tenant (status='pending')
  const { data: tenant, error: tErr } = await supabaseAdmin
    .from('tenants')
    .insert({
      slug,
      name: tenantName,
      plan: 'free',
      status: 'pending',
      order_prefix: orderPrefix,
      applicant_phone: applicantPhone,
      business_type: businessType,
      application_notes: applicationNotes,
    })
    .select('id, slug')
    .single();
  if (tErr || !tenant) {
    console.error('[submitApplication] tenant insert', tErr);
    return { error: '建立失敗,請稍候重試' };
  }
  const newTenant = tenant as { id: string; slug: string };

  // 3. 綁 tenant_members
  const { error: tmErr } = await supabaseAdmin.from('tenant_members').insert({
    tenant_id: newTenant.id,
    user_id: userId,
    role: 'owner',
  });
  if (tmErr) {
    console.error('[submitApplication] tenant_members insert', tmErr);
    return { error: '綁定失敗' };
  }

  // 4. 建 default region(台灣) — 沒地點不能開課
  const { error: rErr } = await supabaseAdmin.from('regions').insert({
    tenant_id: newTenant.id,
    name: '台灣',
  });
  if (rErr) {
    console.error('[submitApplication] default region', rErr);
    // region 失敗不擋,user 可手動補
  }

  redirect(`/admin/${newTenant.slug}`);
}
