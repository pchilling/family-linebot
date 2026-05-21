'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

async function tenantIdBySlug(slug: string): Promise<string | null> {
  const t = await getTenantBySlug(slug);
  return t?.id ?? null;
}

export async function createNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const publish = formData.get('publish') === 'on';

  if (!slug) throw new Error('無攤位資訊');
  if (!title) throw new Error('標題必填');

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) throw new Error('攤位不存在');

  const { error } = await supabaseAdmin.from('news').insert({
    tenant_id: tenantId,
    title,
    body: body || null,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
  });

  if (error) {
    console.error('[createNews]', error);
    throw new Error('建立失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/news`);
}

export async function updateNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const status = String(formData.get('status') ?? 'draft').trim();

  if (!slug || !id) throw new Error('缺必要參數');
  if (!title) throw new Error('標題必填');
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error('狀態值不對');
  }

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) throw new Error('攤位不存在');

  // 取現在狀態判斷要不要寫 published_at
  const { data: current } = await supabaseAdmin
    .from('news')
    .select('status, published_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const wasPublished = (current as { status?: string } | null)?.status === 'published';
  const willPublish = status === 'published';
  const publishedAt = (current as { published_at?: string } | null)?.published_at ?? null;

  const updatePayload: {
    title: string;
    body: string | null;
    status: string;
    published_at?: string | null;
  } = {
    title,
    body: body || null,
    status,
  };

  // 從 draft → published:寫入當前時間
  if (!wasPublished && willPublish) {
    updatePayload.published_at = new Date().toISOString();
  }
  // 從 published → draft/archived:保留 published_at 不動(historic 紀錄)
  if (wasPublished && !willPublish && publishedAt) {
    updatePayload.published_at = publishedAt;
  }

  const { error } = await supabaseAdmin
    .from('news')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[updateNews]', error);
    throw new Error('儲存失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/news`);
}

export async function deleteNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  if (!slug || !id) throw new Error('缺必要參數');

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) throw new Error('攤位不存在');

  const { error } = await supabaseAdmin
    .from('news')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[deleteNews]', error);
    throw new Error('刪除失敗:' + error.message);
  }

  revalidatePath(`/admin/${slug}/news`);
}
