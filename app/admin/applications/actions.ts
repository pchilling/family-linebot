'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/super-admin';

async function requireSuperAdmin(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect('/admin/login');
  if (!isSuperAdmin(user.email)) redirect('/admin');
  return user.email;
}

/**
 * 核准申請(Phase 7.11):tenant.status pending → active
 */
export async function approveApplication(formData: FormData): Promise<void> {
  const reviewer = await requireSuperAdmin();
  const tenantId = String(formData.get('tenant_id') ?? '').trim();
  if (!tenantId) return;

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      status: 'active',
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', tenantId)
    .eq('status', 'pending');

  if (error) {
    console.error('[approveApplication]', error);
    return;
  }
  revalidatePath('/admin/applications');
}

/**
 * 拒絕申請(Phase 7.11):tenant.status pending → rejected,寫入拒絕原因。
 * 不刪資料(資料庫操作前提:不破壞既有)。
 */
export async function rejectApplication(formData: FormData): Promise<void> {
  const reviewer = await requireSuperAdmin();
  const tenantId = String(formData.get('tenant_id') ?? '').trim();
  const reason = String(formData.get('rejection_reason') ?? '').trim() || null;
  if (!tenantId) return;

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      status: 'rejected',
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', tenantId)
    .eq('status', 'pending');

  if (error) {
    console.error('[rejectApplication]', error);
    return;
  }
  revalidatePath('/admin/applications');
}

/**
 * 重新審核(rejected → pending):管理員想再給機會時用。
 */
export async function reopenApplication(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const tenantId = String(formData.get('tenant_id') ?? '').trim();
  if (!tenantId) return;

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      status: 'pending',
      rejection_reason: null,
    })
    .eq('id', tenantId)
    .eq('status', 'rejected');

  if (error) {
    console.error('[reopenApplication]', error);
    return;
  }
  revalidatePath('/admin/applications');
}
