'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 老師手動勾學員為已簽到。method='manual'。
 * created_by 暫時 null(Supabase auth user → platform_users 的 mapping 還沒做,Phase B 一併)
 */
export async function markAttendance(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!slug) throw new Error('無攤位資訊');
  if (!classId) throw new Error('無課程資訊');
  if (!userId) throw new Error('無學員資訊');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { error } = await supabaseAdmin.from('attendances').insert({
    tenant_id: tenant.id,
    class_id: classId,
    user_id: userId,
    method: 'manual',
  });

  if (error) {
    // 23505 = unique_violation,已簽過視為 no-op
    if ((error as { code?: string }).code === '23505') {
      revalidatePath(`/admin/${slug}/attendances`);
      return;
    }
    console.error('[markAttendance]', error);
    throw new Error('簽到失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/attendances`);
}

/**
 * 取消簽到(誤勾 / 學員退課)— 直接 delete attendance row。
 * stock_movements 是 append-only,但 attendances 沒這限制,delete 簡單。
 */
export async function unmarkAttendance(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!slug || !classId || !userId) throw new Error('缺必要參數');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { error } = await supabaseAdmin
    .from('attendances')
    .delete()
    .eq('tenant_id', tenant.id)
    .eq('class_id', classId)
    .eq('user_id', userId);

  if (error) {
    console.error('[unmarkAttendance]', error);
    throw new Error('取消失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/attendances`);
}
