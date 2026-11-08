'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cancelOpenNotify, followTenant, requestOpenNotify, unfollowTenant } from '@/lib/groupbuy';
import { getCurrentMember } from '@/lib/member-auth';
import { loginHref, safeReturnTo } from '@/lib/return-to';
import { getTenantPublic } from '@/lib/supabase';

/**
 * 追蹤這家店(Phase 35,2026-11-07)。
 * 團購分頁的「門」與我的訂單頁的追蹤卡都用這兩支;表單帶 tenant_slug 與 return_to(站內路徑)。
 * 沒登入 → 導去登入視窗,登入完回原頁並帶 follow=1(團購分頁會自動追蹤)。
 * Phase 37(2026-11-08):攤位開了「追蹤要核准」→ 先是申請(requested=1),攤主核准後才算追蹤;
 * 另加「開團通知我」兩支(notify=1 走同一套登入回跳)。
 */

/** 在站內路徑後面加一個查詢參數(原本有沒有 ? 都處理) */
function withParam(path: string, key: string, value: string): string {
  const [p, q = ''] = path.split('?');
  const sp = new URLSearchParams(q);
  sp.set(key, value);
  return `${p}?${sp.toString()}`;
}

function readForm(formData: FormData) {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const returnTo = safeReturnTo(formData.get('return_to'), `/${slug}/groupbuy`);
  return { slug, returnTo };
}

export async function followThisStore(formData: FormData): Promise<void> {
  const { slug, returnTo } = readForm(formData);
  if (!slug) redirect('/');
  const tenant = await getTenantPublic(slug);
  if (!tenant) redirect('/');
  const member = await getCurrentMember();
  if (!member) redirect(loginHref(slug, withParam(returnTo, 'follow', '1')));
  const status = await followTenant(tenant.id, member.id, tenant.groupbuy_follow_approval);
  revalidatePath(`/${slug}/groupbuy`);
  revalidatePath(`/${slug}/account`);
  redirect(withParam(returnTo, status === 'pending' ? 'requested' : 'followed', '1'));
}

/** 開團通知我:tenant_slug + return_to;沒登入 → 登入回來帶 notify=1 由團購分頁自動登記 */
export async function requestOpenNotifyAction(formData: FormData): Promise<void> {
  const { slug, returnTo } = readForm(formData);
  if (!slug) redirect('/');
  const tenant = await getTenantPublic(slug);
  if (!tenant) redirect('/');
  const member = await getCurrentMember();
  if (!member) redirect(loginHref(slug, withParam(returnTo, 'notify', '1')));
  await requestOpenNotify(tenant.id, member.id);
  revalidatePath(`/${slug}/groupbuy`);
  redirect(withParam(returnTo, 'notified', '1'));
}

export async function cancelOpenNotifyAction(formData: FormData): Promise<void> {
  const { slug, returnTo } = readForm(formData);
  if (!slug) redirect('/');
  const tenant = await getTenantPublic(slug);
  if (!tenant) redirect('/');
  const member = await getCurrentMember();
  if (!member) redirect(loginHref(slug, returnTo));
  await cancelOpenNotify(tenant.id, member.id);
  revalidatePath(`/${slug}/groupbuy`);
  redirect(withParam(returnTo, 'notify_off', '1'));
}

export async function unfollowThisStore(formData: FormData): Promise<void> {
  const { slug, returnTo } = readForm(formData);
  if (!slug) redirect('/');
  const tenant = await getTenantPublic(slug);
  if (!tenant) redirect('/');
  const member = await getCurrentMember();
  if (!member) redirect(loginHref(slug, returnTo));
  await unfollowTenant(tenant.id, member.id);
  revalidatePath(`/${slug}/groupbuy`);
  revalidatePath(`/${slug}/account`);
  redirect(withParam(returnTo, 'unfollowed', '1'));
}
