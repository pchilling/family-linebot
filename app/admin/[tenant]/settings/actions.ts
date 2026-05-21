'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

export type SettingsState =
  | { status: 'idle' }
  | { status: 'success'; ts: number }
  | { status: 'error'; error: string };

/**
 * Tenant owner 改攤位設定。
 * 只開放安全欄位:name / description / brand_color / og_image_url / contact_info。
 * plan / features / slug / order_prefix 不在這裡改(需 NEO 介入)。
 *
 * Signature 給 React 19 useActionState 用:(prev, formData) => newState
 *
 * TODO:check 登入用戶是否在 tenant_members 內(目前任一 Supabase Auth 帳號都能改任何 tenant)
 */
export async function updateTenantSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const brandColor = String(formData.get('brand_color') ?? '').trim();
  const ogImageUrl = String(formData.get('og_image_url') ?? '').trim();
  // contact_info 是 free text(多行),頭尾空白 trim,內部換行保留
  const contactInfo = String(formData.get('contact_info') ?? '').replace(/^\s+|\s+$/g, '');
  const paymentInfo = String(formData.get('payment_info') ?? '').replace(/^\s+|\s+$/g, '');

  if (!slug) return { status: 'error', error: '無攤位資訊' };
  if (!name) return { status: 'error', error: '店名不能空白' };

  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    return { status: 'error', error: '主題色需為 #RRGGBB 格式' };
  }
  if (ogImageUrl && !/^https?:\/\//.test(ogImageUrl)) {
    return { status: 'error', error: '分享圖網址需以 http:// 或 https:// 開頭' };
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { status: 'error', error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      name,
      description: description || null,
      brand_color: brandColor || null,
      og_image_url: ogImageUrl || null,
      contact_info: contactInfo || null,
      payment_info: paymentInfo || null,
    })
    .eq('id', tenant.id);

  if (error) {
    console.error('[updateTenantSettings]', error);
    return { status: 'error', error: '儲存失敗,請稍後再試' };
  }

  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);

  return { status: 'success', ts: Date.now() };
}

// ========================
// Logo upload(2026-05-21,Phase 7.1)
// 用 Supabase Storage bucket "tenant-assets" 存,public bucket。
// 客端 react-image-crop 已 crop 成 256×256 jpeg blob,server 只需要 upload + 寫 logo_url。
// ========================
export type UploadLogoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadLogo(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: '檔案太大(裁切後應 < 2MB)' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // path 加 timestamp 避免 CDN cache 殘留舊圖
  const path = `${tenant.id}/logo-${Date.now()}.jpg`;

  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (upErr) {
    console.error('[uploadLogo upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: publicUrl })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('[uploadLogo update tenant]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}

/**
 * 上傳 hero banner(也作 og:image)。Phase 7.3。
 * 1200×630 jpeg,寫 tenants.og_image_url。
 * Path: {tenant_id}/banner-{ts}.jpg
 */
export async function uploadBanner(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: '裁切後檔案應 < 4MB' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const path = `${tenant.id}/banner-${Date.now()}.jpg`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (upErr) {
    console.error('[uploadBanner upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update({ og_image_url: publicUrl })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('[uploadBanner update]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}
