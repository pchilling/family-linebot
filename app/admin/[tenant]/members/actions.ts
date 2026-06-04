'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Members 邀請 UI server actions(Phase 13.1,2026-06-04)。
 *
 * 沒做 RLS check —— 假設能進 /admin/[tenant]/members 的就有權管理。
 * 之後補 tenant_members role check 時這層一起改。
 *
 * 安全:防最後一個 owner 被移除 / 降級(會孤兒化 tenant)。
 */

const VALID_ROLES = ['owner', 'admin', 'staff'] as const;
type Role = (typeof VALID_ROLES)[number];

function parseRole(raw: string): Role | null {
  return (VALID_ROLES as readonly string[]).includes(raw) ? (raw as Role) : null;
}

async function tenantIdFromSlug(slug: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function countOwners(tenantId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('tenant_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'owner');
  return count ?? 0;
}

/**
 * 邀請成員:
 *   1. email + role
 *   2. 查 platform_users 有沒這 email
 *      - 有 → 拿 id
 *      - 沒 → 建一筆(display_name 用 email 前綴 placeholder)
 *   3. 插 tenant_members(ON CONFLICT do nothing,已是成員就 noop)
 */
export async function inviteMember(formData: FormData) {
  const slug = String(formData.get('tenant_slug') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const roleRaw = String(formData.get('role') || 'staff').trim();

  if (!slug) return;
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) return;

  const role = parseRole(roleRaw) ?? 'staff';
  if (!email || !email.includes('@')) {
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('email 格式錯誤')}`);
  }

  // 1. 查或建 platform_users
  const { data: existing } = await supabaseAdmin
    .from('platform_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let userId: string;
  if (existing) {
    userId = (existing as { id: string }).id;
  } else {
    const namePlaceholder = email.split('@')[0];
    const { data: created, error: createErr } = await supabaseAdmin
      .from('platform_users')
      .insert({
        email,
        display_name: namePlaceholder,
        status: 'active',
      })
      .select('id')
      .single();
    if (createErr || !created) {
      console.error('[inviteMember] create platform_users', createErr);
      redirect(`/admin/${slug}/members?error=${encodeURIComponent('建立用戶失敗:' + (createErr?.message ?? ''))}`);
    }
    userId = (created as { id: string }).id;
  }

  // 2. 插 tenant_members(unique constraint 會擋重複,我們 swallow)
  const { error: tmErr } = await supabaseAdmin
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: userId, role });

  if (tmErr) {
    // duplicate key violation = 已是成員,不算錯
    if (tmErr.code === '23505') {
      revalidatePath(`/admin/${slug}/members`);
      redirect(`/admin/${slug}/members?info=${encodeURIComponent(email + ' 已經是成員了')}`);
    }
    console.error('[inviteMember] insert tenant_members', tmErr);
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('加入成員失敗:' + tmErr.message)}`);
  }

  revalidatePath(`/admin/${slug}/members`);
  redirect(`/admin/${slug}/members?info=${encodeURIComponent('已邀請 ' + email)}`);
}

/**
 * 改成員 role。
 * 安全:如果是最後一個 owner,不能降級。
 */
export async function updateMemberRole(formData: FormData) {
  const slug = String(formData.get('tenant_slug') || '').trim();
  const memberId = String(formData.get('member_id') || '').trim();
  const newRoleRaw = String(formData.get('role') || '').trim();

  if (!slug || !memberId) return;
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) return;

  const newRole = parseRole(newRoleRaw);
  if (!newRole) {
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('role 不合法')}`);
  }

  // 撈現有 row 看當前 role
  const { data: cur } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const currentRole = (cur as { role: string } | null)?.role;
  if (!currentRole) {
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('找不到此成員')}`);
  }

  // 防最後一個 owner 被降級
  if (currentRole === 'owner' && newRole !== 'owner') {
    const ownerCount = await countOwners(tenantId);
    if (ownerCount <= 1) {
      redirect(`/admin/${slug}/members?error=${encodeURIComponent('這是最後一個 owner,不能降級(會孤兒化 tenant)')}`);
    }
  }

  const { error } = await supabaseAdmin
    .from('tenant_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[updateMemberRole]', error);
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('更新失敗:' + error.message)}`);
  }

  revalidatePath(`/admin/${slug}/members`);
  redirect(`/admin/${slug}/members?info=${encodeURIComponent('Role 已更新')}`);
}

/**
 * 移除成員(刪 tenant_members row。platform_users 不動,他在其他 tenant 還能用)。
 * 安全:不能移除最後一個 owner。
 */
export async function removeMember(formData: FormData) {
  const slug = String(formData.get('tenant_slug') || '').trim();
  const memberId = String(formData.get('member_id') || '').trim();

  if (!slug || !memberId) return;
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) return;

  const { data: cur } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const currentRole = (cur as { role: string } | null)?.role;
  if (!currentRole) {
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('找不到此成員')}`);
  }

  if (currentRole === 'owner') {
    const ownerCount = await countOwners(tenantId);
    if (ownerCount <= 1) {
      redirect(`/admin/${slug}/members?error=${encodeURIComponent('這是最後一個 owner,不能移除(會孤兒化 tenant)')}`);
    }
  }

  const { error } = await supabaseAdmin
    .from('tenant_members')
    .delete()
    .eq('id', memberId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[removeMember]', error);
    redirect(`/admin/${slug}/members?error=${encodeURIComponent('移除失敗:' + error.message)}`);
  }

  revalidatePath(`/admin/${slug}/members`);
  redirect(`/admin/${slug}/members?info=${encodeURIComponent('已移除成員')}`);
}
