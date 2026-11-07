'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { followTenant, unfollowTenant } from '@/lib/groupbuy';
import { getCurrentMember } from '@/lib/member-auth';
import { loginHref, safeReturnTo } from '@/lib/return-to';
import { getTenantPublic } from '@/lib/supabase';

/**
 * 追蹤這家店(Phase 35,2026-11-07)。
 * 團購分頁的「門」與我的訂單頁的追蹤卡都用這兩支;表單帶 tenant_slug 與 return_to(站內路徑)。
 * 沒登入 → 導去登入視窗,登入完回原頁並帶 follow=1(團購分頁會自動追蹤)。
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
  await followTenant(tenant.id, member.id);
  revalidatePath(`/${slug}/groupbuy`);
  revalidatePath(`/${slug}/account`);
  redirect(withParam(returnTo, 'followed', '1'));
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
