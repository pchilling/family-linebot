'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
  const shopBgColor = String(formData.get('shop_bg_color') ?? '').trim(); // C#7 商城底色
  const headerBgColor = String(formData.get('header_bg_color') ?? '').trim(); // Phase 15.1 頂部列底色
  // og_image_url 不再由這個表單管理(2026-09-05):改由「連結分享預覽圖」上傳區獨佔,
  // 避免兩處互蓋。這裡不碰該欄位。
  // contact_info 是 free text(多行),頭尾空白 trim,內部換行保留
  const contactInfo = String(formData.get('contact_info') ?? '').replace(/^\s+|\s+$/g, '');
  const paymentInfo = String(formData.get('payment_info') ?? '').replace(/^\s+|\s+$/g, '');

  if (!slug) return { status: 'error', error: '無攤位資訊' };
  if (!name) return { status: 'error', error: '店名不能空白' };

  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    return { status: 'error', error: '主題色需為 #RRGGBB 格式' };
  }
  if (shopBgColor && !/^#[0-9a-fA-F]{6}$/.test(shopBgColor)) {
    return { status: 'error', error: '商城底色需為 #RRGGBB 格式' };
  }
  if (headerBgColor && !/^#[0-9a-fA-F]{6}$/.test(headerBgColor)) {
    return { status: 'error', error: '頂部列底色需為 #RRGGBB 格式' };
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { status: 'error', error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      name,
      description: description || null,
      brand_color: brandColor || null,
      shop_bg_color: shopBgColor || null,
      header_bg_color: headerBgColor || null,
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
 * 移除 logo:把 tenants.logo_url 設 null。
 * 不刪 Storage 內舊圖(保留歷史,不影響成本因 free tier 量小)。
 */
export async function removeLogo(slug: string): Promise<UploadLogoResult> {
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', tenant.id);
  if (error) {
    console.error('[removeLogo]', error);
    return { ok: false, error: '移除失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);
  return { ok: true, url: '' };
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

/**
 * 移除 banner:把 tenants.og_image_url 設 null。
 */
export async function removeBanner(slug: string): Promise<UploadLogoResult> {
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ og_image_url: null })
    .eq('id', tenant.id);
  if (error) {
    console.error('[removeBanner]', error);
    return { ok: false, error: '移除失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);
  return { ok: true, url: '' };
}


// ====================
// Phase 9.8(2026-06-02):攤位 Banner 多媒體 — image / video / YouTube URL
// ====================

type BannerItem = { type: 'image' | 'video'; url: string };

async function getTenantBanners(tenantId: string): Promise<BannerItem[]> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('banners')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    console.error('[getTenantBanners]', error);
    throw new Error('讀取現有 banner 失敗:' + error.message);
  }
  let b = (data as { banners?: unknown } | null)?.banners;
  // 防禦:若 banners 欄位被存成 JSON 字串(schema drift),先 parse 回陣列,
  // 否則會被當成空陣列 → 下一次寫入時覆蓋掉既有 banner。
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = null;
    }
  }
  return Array.isArray(b) ? (b as BannerItem[]) : [];
}

async function setTenantBanners(tenantId: string, banners: BannerItem[]) {
  const { error } = await supabaseAdmin.from('tenants').update({ banners }).eq('id', tenantId);
  if (error) {
    console.error('[setTenantBanners]', error);
    throw new Error('儲存 banner 失敗:' + error.message);
  }
}

function bannerRedirect(slug: string) {
  if (slug) redirect(`/admin/${slug}/settings`);
}

export async function addTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  const tenant = await getTenantBySlug(slug);
  if (!tenant || !url || (type !== 'image' && type !== 'video')) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  await setTenantBanners(tenant.id, [...current, { type, url }]);
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function removeTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const index = Number(formData.get('index'));
  const tenant = await getTenantBySlug(slug);
  if (!tenant || !Number.isFinite(index)) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  await setTenantBanners(tenant.id, current.filter((_, i) => i !== index));
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function reorderTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const index = Number(formData.get('index'));
  const direction = String(formData.get('direction'));
  const tenant = await getTenantBySlug(slug);
  if (!tenant || !Number.isFinite(index)) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  if (index < 0 || index >= current.length) { bannerRedirect(slug); return; }
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (targetIdx < 0 || targetIdx >= current.length) { bannerRedirect(slug); return; }
  const next = [...current];
  [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
  await setTenantBanners(tenant.id, next);
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function uploadTenantBannerImage(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '圖檔應 < 5MB' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = (file as File).name?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const safeExt = ['jpg','jpeg','png','webp','gif'].includes(ext) ? ext : 'jpg';
  const contentType =
    safeExt === 'png' ? 'image/png' :
    safeExt === 'webp' ? 'image/webp' :
    safeExt === 'gif' ? 'image/gif' :
    'image/jpeg';
  const path = `${tenant.id}/banners/media/${Date.now()}.${safeExt}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType, upsert: false });
  if (upErr) { console.error('[uploadTenantBannerImage]', upErr); return { ok: false, error: '上傳失敗' }; }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type: 'image', url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}

export async function uploadTenantBannerVideo(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 50 * 1024 * 1024) return { ok: false, error: '影片應 < 50MB' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = (file as File).name?.split('.').pop()?.toLowerCase() ?? 'mp4';
  const safeExt = ['mp4','mov','webm'].includes(ext) ? ext : 'mp4';
  const contentType = safeExt === 'webm' ? 'video/webm' : safeExt === 'mov' ? 'video/quicktime' : 'video/mp4';
  const path = `${tenant.id}/banners/videos/${Date.now()}.${safeExt}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType, upsert: false });
  if (upErr) { console.error('[uploadTenantBannerVideo]', upErr); return { ok: false, error: '上傳失敗' }; }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type: 'video', url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}

// ====================
// Banner 瀏覽器直傳 Supabase Storage(2026-08-06)
// Server Action body 走不了大檔(next.config bodySizeLimit 2mb + Vercel 4.5MB 硬限制),
// 改成:createBannerUploadUrl 發簽名上傳連結 → 瀏覽器直傳 → finalizeBannerUpload 記進 banners。
// ====================

export type BannerUploadUrlResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

export async function createBannerUploadUrl(formData: FormData): Promise<BannerUploadUrlResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const filename = String(formData.get('filename') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (type !== 'image' && type !== 'video') return { ok: false, error: '類型錯誤' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const safeExt =
    type === 'image'
      ? (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg')
      : (['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? ext : 'mp4');
  const dir = type === 'image' ? 'media' : 'videos';
  const path = `${tenant.id}/banners/${dir}/${Date.now()}.${safeExt}`;

  const { data, error } = await supabaseAdmin.storage
    .from('tenant-assets')
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[createBannerUploadUrl]', error);
    return { ok: false, error: '建立上傳連結失敗' };
  }
  return { ok: true, path: data.path, token: data.token };
}

export async function finalizeBannerUpload(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const path = String(formData.get('path') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (type !== 'image' && type !== 'video') return { ok: false, error: '類型錯誤' };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };
  // path 必須落在該 tenant 自己的 banners 目錄,防止塞別人的檔案路徑
  if (!path.startsWith(`${tenant.id}/banners/`)) return { ok: false, error: '路徑不合法' };

  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type, url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}
