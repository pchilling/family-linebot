'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * Tenant owner 改攤位設定。
 * 只開放安全欄位:name / description / brand_color / og_image_url / contact_info。
 * plan / features / slug / order_prefix 不在這裡改(需 NEO 介入)。
 *
 * 因為 React 19 `<form action>` 要回 Promise<void>(不能 return 物件),
 * validation 失敗用 throw,Next.js error boundary 接;成功 revalidate + 隱式 redirect 回同頁。
 *
 * TODO:加 toast / banner 顯示成功/失敗(需 client component + useActionState)。
 * TODO:check 登入用戶是否在 tenant_members 內(目前任一 Supabase Auth 帳號都能改任何 tenant)。
 */
export async function updateTenantSettings(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const brandColor = String(formData.get('brand_color') ?? '').trim();
  const ogImageUrl = String(formData.get('og_image_url') ?? '').trim();
  // contact_info 是 free text(多行),不 trim 怕吃掉 indentation;頭尾空白還是要 trim
  const contactInfo = String(formData.get('contact_info') ?? '').replace(/^\s+|\s+$/g, '');

  if (!slug) throw new Error('無攤位資訊');
  if (!name) throw new Error('店名不能空白');

  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    throw new Error('主題色需為 #RRGGBB 格式');
  }
  if (ogImageUrl && !/^https?:\/\//.test(ogImageUrl)) {
    throw new Error('分享圖網址需以 http:// 或 https:// 開頭');
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error('攤位不存在');

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
    throw new Error('儲存失敗,請稍後再試');
  }

  // 公開頁也讀同筆 tenant,順便清 cache
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/${slug}`);
}
