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
