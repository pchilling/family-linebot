'use server';

import { revalidatePath } from 'next/cache';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';

export type SubmitReviewsResult = { ok: true; saved: number; store: boolean } | { ok: false; error: string };

/**
 * 送出評價(Phase 25):用訂單存取碼驗證身分(不用登入),每個商品 1–5 星 + 可選留言。
 * 同一筆訂單同一商品再送 = 更新(unique order_id + product_id)。
 * 分數客人自己給,後台只能隱藏、不能改。
 * Phase 30(2026-11-01):同一張表單多「這家店整體」一顆星 → tenant_reviews,一筆訂單評一次(再送 = 更新)。
 */
export async function submitReviews(formData: FormData): Promise<SubmitReviewsResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const orderNo = String(formData.get('order_no') ?? '').trim();
  const k = String(formData.get('k') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 30) || null;
  if (!slug || !orderNo || !k) return { ok: false, error: '缺少訂單資訊' };
  // 2026-11-01 Peter:評價一定要有名字(自己的或暱稱),不給匿名
  if (!displayName) return { ok: false, error: '請填評價要顯示的名字' };

  const tenant = await getTenantPublic(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, status, access_key, user_id, order_items(product_id, price_at_purchase, products(slug))')
    .eq('tenant_id', tenant.id)
    .eq('order_no', orderNo)
    .maybeSingle();
  const order = (data ?? null) as unknown as {
    id: string;
    status: string;
    access_key: string | null;
    user_id: string | null;
    order_items: { product_id: string; price_at_purchase: number; products: { slug: string | null } | null }[] | null;
  } | null;
  if (!order || !order.access_key || order.access_key !== k) return { ok: false, error: '連結無效,請從 LINE 通知的按鈕進入' };
  if (order.status !== 'shipped' && order.status !== 'delivered') return { ok: false, error: '出貨後才能評價' };

  const productIds = [...new Set((order.order_items ?? []).map((i) => i.product_id))];
  const rows: Record<string, unknown>[] = [];
  for (const pid of productIds) {
    const rating = Number(formData.get(`rating_${pid}`));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue; // 沒打星的商品跳過
    const comment = String(formData.get(`comment_${pid}`) ?? '').trim().slice(0, 300) || null;
    rows.push({
      tenant_id: tenant.id,
      product_id: pid,
      order_id: order.id,
      user_id: order.user_id,
      rating,
      comment,
      display_name: displayName,
      status: 'visible',
    });
  }
  // 店家星等(Phase 30):沒打就跳過
  const storeRating = Number(formData.get('rating_store'));
  const hasStore = Number.isInteger(storeRating) && storeRating >= 1 && storeRating <= 5;
  if (rows.length === 0 && !hasStore) return { ok: false, error: '至少給商品或這家店打個分數' };

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('product_reviews').upsert(rows, { onConflict: 'order_id,product_id' });
    if (error) {
      console.error('[submitReviews]', error);
      return { ok: false, error: '儲存失敗,請稍後再試' };
    }
  }
  if (hasStore) {
    const storeComment = String(formData.get('comment_store') ?? '').trim().slice(0, 300) || null;
    const { error } = await supabaseAdmin.from('tenant_reviews').upsert(
      { tenant_id: tenant.id, order_id: order.id, user_id: order.user_id, rating: storeRating, comment: storeComment, display_name: displayName, status: 'visible' },
      { onConflict: 'order_id' },
    );
    if (error) {
      console.error('[submitReviews:store]', error);
      return { ok: false, error: '店家評價儲存失敗,請稍後再試' };
    }
  }

  // 頁首的店家星數在 layout 裡算,整個商店的路由都要重算
  revalidatePath(`/${slug}`, 'layout');
  for (const i of order.order_items ?? []) {
    if (i.products?.slug) revalidatePath(`/${slug}/p/${i.products.slug}`);
  }
  return { ok: true, saved: rows.length, store: hasStore };
}
