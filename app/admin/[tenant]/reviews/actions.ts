'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminTenant } from '@/lib/super-admin';

/**
 * 後台評價管理(Phase 25):只能「隱藏 / 顯示」,不能改分數或留言 —
 * 真實評價才能放星星,改了就是假的。隱藏後商品卡與商品頁都不計入。
 */
export async function setReviewStatus(formData: FormData) {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'product'); // Phase 30:'store' = 店家評價(tenant_reviews)
  if (!slug || !id || (status !== 'visible' && status !== 'hidden')) return;

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return;

  if (kind === 'store') {
    await supabaseAdmin.from('tenant_reviews').update({ status }).eq('tenant_id', tenant.id).eq('id', id);
    revalidatePath(`/admin/${slug}/reviews`);
    revalidatePath(`/${slug}`, 'layout'); // 頁首星數在 layout 算
    redirect(`/admin/${slug}/reviews?kind=store&saved=${status}`);
  }

  const { data } = await supabaseAdmin
    .from('product_reviews')
    .update({ status })
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .select('products(slug)')
    .maybeSingle();
  const productSlug = (data as { products: { slug: string | null } | null } | null)?.products?.slug;

  revalidatePath(`/admin/${slug}/reviews`);
  revalidatePath(`/${slug}`);
  if (productSlug) revalidatePath(`/${slug}/p/${productSlug}`);
  redirect(`/admin/${slug}/reviews?saved=${status}`);
}
