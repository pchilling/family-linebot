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

// ========================
// 報名管理(Wave 2,2026-05-21)
// ========================

/**
 * 把候補學員升等為 confirmed,並 reorder 剩餘 waitlist 的 position。
 * 沒檢查容量(允許老師超賣);若想 strict 加 capacity check 自己加。
 */
export async function promoteWaitlist(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!slug || !classId || !userId) throw new Error('缺必要參數');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

  // 先取得這個 user 在 waitlist 的 position(後面要 reorder)
  const { data: target } = await supabaseAdmin
    .from('reservations')
    .select('position')
    .eq('class_id', classId)
    .eq('user_id', userId)
    .eq('status', 'waitlist')
    .maybeSingle();
  const targetPosition = (target as { position: number | null } | null)?.position;

  // 升等本人
  const { error: e1 } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'confirmed', position: null })
    .eq('class_id', classId)
    .eq('user_id', userId)
    .eq('status', 'waitlist');

  if (e1) {
    console.error('[promoteWaitlist update target]', e1);
    throw new Error('升等失敗:' + e1.message);
  }

  // 把剩餘比他 position 大的人,各往前 1 格
  if (targetPosition !== null && targetPosition !== undefined) {
    const { data: rest } = await supabaseAdmin
      .from('reservations')
      .select('id, position')
      .eq('class_id', classId)
      .eq('status', 'waitlist')
      .gt('position', targetPosition);

    type Row = { id: string; position: number };
    const rows = (rest as Row[] | null) ?? [];
    for (const r of rows) {
      await supabaseAdmin
        .from('reservations')
        .update({ position: r.position - 1 })
        .eq('id', r.id);
    }
  }

  revalidatePath(`/admin/${slug}/attendances`);
}

/**
 * Admin 取消學員報名(改 status='cancelled')。
 * 若取消的是 confirmed → 候補第 1 個自動升等(同時 reorder)。
 */
export async function cancelReservationAdmin(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!slug || !classId || !userId) throw new Error('缺必要參數');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

  // 先看這個人原本是 confirmed 還是 waitlist
  const { data: before } = await supabaseAdmin
    .from('reservations')
    .select('status, position')
    .eq('class_id', classId)
    .eq('user_id', userId)
    .maybeSingle();
  const beforeRow = before as { status: string; position: number | null } | null;

  // 取消
  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled', position: null })
    .eq('class_id', classId)
    .eq('user_id', userId);

  if (error) {
    console.error('[cancelReservationAdmin]', error);
    throw new Error('取消失敗:' + error.message);
  }

  // 取消的是 confirmed → 找候補第 1 個升等
  if (beforeRow?.status === 'confirmed') {
    const { data: nextUp } = await supabaseAdmin
      .from('reservations')
      .select('id, position')
      .eq('class_id', classId)
      .eq('status', 'waitlist')
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    const next = nextUp as { id: string; position: number } | null;
    if (next) {
      await supabaseAdmin
        .from('reservations')
        .update({ status: 'confirmed', position: null })
        .eq('id', next.id);

      // reorder 剩餘 waitlist
      const { data: rest } = await supabaseAdmin
        .from('reservations')
        .select('id, position')
        .eq('class_id', classId)
        .eq('status', 'waitlist')
        .gt('position', next.position);
      type Row = { id: string; position: number };
      const rows = (rest as Row[] | null) ?? [];
      for (const r of rows) {
        await supabaseAdmin
          .from('reservations')
          .update({ position: r.position - 1 })
          .eq('id', r.id);
      }
    }
  } else if (beforeRow?.status === 'waitlist' && beforeRow.position !== null) {
    // 取消的是 waitlist → 比他大的人各往前 1 格
    const { data: rest } = await supabaseAdmin
      .from('reservations')
      .select('id, position')
      .eq('class_id', classId)
      .eq('status', 'waitlist')
      .gt('position', beforeRow.position);
    type Row = { id: string; position: number };
    const rows = (rest as Row[] | null) ?? [];
    for (const r of rows) {
      await supabaseAdmin
        .from('reservations')
        .update({ position: r.position - 1 })
        .eq('id', r.id);
    }
  }

  revalidatePath(`/admin/${slug}/attendances`);
}

/**
 * 標記學員 no-show(confirmed 但沒簽到 / 沒到)。
 * 不影響其他人,不 promote waitlist(他本來就是已報名的)。
 */
export async function markNoShow(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!slug || !classId || !userId) throw new Error('缺必要參數');

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'no_show', position: null })
    .eq('class_id', classId)
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (error) {
    console.error('[markNoShow]', error);
    throw new Error('標記失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/attendances`);
}
