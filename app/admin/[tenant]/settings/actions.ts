'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

export type UpdateSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Tenant owner 改攤位設定。
 * 只開放安全欄位:name / description / brand_color / og_image_url。
 * plan / features / slug / order_prefix 不在這裡改(需 NEO 介入)。
 *
 * TODO(後續):check 登入用戶是否在 tenant_members 內。目前 middleware 只擋未登入,
 * 任一 Supabase Auth 帳號都能改任何 tenant — 等多人使用時加 RBAC。
 */
export async function updateTenantSettings(formData: FormData): Promise<UpdateSettingsResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const brandColor = String(formData.get('brand_color') ?? '').trim();
  const ogImageUrl = String(formData.get('og_image_url') ?? '').trim();
  // contact_info 是 free text(多行),不 trim 怕吃掉 indentation;頭尾空白還是要 trim
  const contactInfo = String(formData.get('contact_info') ?? '').replace(/^\s+|\s+$/g, '');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!name) return { ok: false, error: '店名不能空白' };

  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    return { ok: false, error: '主題色需為 #RRGGBB 格式' };
  }
  if (ogImageUrl && !/^https?:\/\//.test(ogImageUrl)) {
    return { ok: false, error: '分享圖網址需以 http:// 或 https:// 開頭' };
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      name,
      description: description || null,
      brand_color: brandColor || null,
      og_image_url: ogImageUrl || null,
      contact_info: contactInfo || null,
    })
    .eq('id', tenant.id);

  if (error) {
    console.error('[updateTenantSettings]', error);
    return { ok: false, error: '儲存失敗,請稍後再試' };
  }

  // 公開頁也讀同筆 tenant,順便清 cache
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);

  return { ok: true };
}
