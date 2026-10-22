'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 後台評價管理(Phase 25):只能「隱藏 / 顯示」,不能改分數或留言 —
 * 真實評價才能放星星,改了就是假的。隱藏後商品卡與商品頁都不計入。
 */
export async function setReviewStatus(formData: FormData) {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!slug || !id || (status !== 'visible' && status !== 'hidden')) return;

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return;

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
