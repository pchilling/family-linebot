'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

export type UploadProductImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * 上傳商品圖到 Supabase Storage bucket "tenant-assets",更新 products.image_url。
 * 客端 react-image-crop 已 crop 成 600×750 jpeg blob。
 * Path: {tenant_id}/products/{product_id}-{timestamp}.jpg
 */
export async function uploadProductImage(formData: FormData): Promise<UploadProductImageResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const productId = String(formData.get('product_id') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!productId) return { ok: false, error: '無商品資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: '裁切後檔案應 < 3MB' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // 確認 product 屬於這 tenant(防 cross-tenant 上傳)
  const { data: product, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (pErr || !product) return { ok: false, error: '商品不存在或無權限' };

  const path = `${tenant.id}/products/${productId}-${Date.now()}.jpg`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (upErr) {
    console.error('[uploadProductImage upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('products')
    .update({ image_url: publicUrl })
    .eq('id', productId);

  if (updateErr) {
    console.error('[uploadProductImage update]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/products`);
  revalidatePath(`/${slug}`);
  // 公開商品詳情頁也要刷(slug-based,不知道 product slug 就 cover 範圍 revalidate)
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}

/**
 * 上傳變體圖。Variant 跟 product 是 1:n,variant 可以自己有圖(色 / 尺寸款式),
 * 不設則 fallback 用 product 的圖。
 * Path: {tenant_id}/variants/{variant_id}-{timestamp}.jpg
 */
export async function uploadVariantImage(formData: FormData): Promise<UploadProductImageResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const variantId = String(formData.get('variant_id') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!variantId) return { ok: false, error: '無變體資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: '裁切後檔案應 < 3MB' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // 確認 variant 屬於這 tenant(防 cross-tenant 上傳)
  const { data: variant, error: vErr } = await supabaseAdmin
    .from('product_variants')
    .select('id')
    .eq('id', variantId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (vErr || !variant) return { ok: false, error: '變體不存在或無權限' };

  const path = `${tenant.id}/variants/${variantId}-${Date.now()}.jpg`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (upErr) {
    console.error('[uploadVariantImage upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('product_variants')
    .update({ image_url: publicUrl })
    .eq('id', variantId);

  if (updateErr) {
    console.error('[uploadVariantImage update]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/products`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}
