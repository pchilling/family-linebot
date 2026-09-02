'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { broadcastNewsItem } from '@/lib/line';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

async function tenantIdBySlug(slug: string): Promise<string | null> {
  const t = await getTenantBySlug(slug);
  return t?.id ?? null;
}

export async function createNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const linkUrl = String(formData.get('link_url') ?? '').trim();
  const imageUrl = String(formData.get('image_url') ?? '').trim(); // D#4
  const publish = formData.get('publish') === 'on';
  const push = formData.get('push') === 'on'; // D#3:發布後同步推播

  if (!slug) throw new Error('無攤位資訊');
  if (!title) throw new Error('標題必填');

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) throw new Error('攤位不存在');

  const publishedAt = publish ? new Date().toISOString() : null;
  const { error } = await supabaseAdmin.from('news').insert({
    tenant_id: tenantId,
    title,
    body: body || null,
    link_url: linkUrl || null,
    image_url: imageUrl || null,
    status: publish ? 'published' : 'draft',
    published_at: publishedAt,
  });

  if (error) {
    console.error('[createNews]', error);
    throw new Error('建立失敗:' + error.message);
  }

  // D#3:勾了推播且有發布 → 廣播給所有好友(失敗不影響已建立的消息)
  if (publish && push) {
    try {
      await broadcastNewsItem({
        id: '',
        title,
        body: body || null,
        link_url: linkUrl || null,
        image_url: imageUrl || null,
        published_at: publishedAt ?? new Date().toISOString(),
      });
    } catch (e) {
      console.error('[createNews broadcast]', e);
    }
  }

  revalidatePath(`/admin/${slug}/news`);
}

/**
 * D#3(2026-09-02):單則已發布消息手動推播給所有好友。
 * ⚠️ 每次推播吃 LINE 免費額度(好友數 × 1 則)。
 */
export async function pushNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  if (!slug || !id) throw new Error('缺必要參數');

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) throw new Error('攤位不存在');

  const { data } = await supabaseAdmin
    .from('news')
    .select('id, title, body, link_url, image_url, published_at, status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const n = data as {
    id: string; title: string; body: string | null; link_url: string | null;
    image_url: string | null; published_at: string | null; status: string;
  } | null;
  if (!n) throw new Error('消息不存在');
  if (n.status !== 'published') throw new Error('只有已發佈的消息能推播');

  await broadcastNewsItem({
    id: n.id,
    title: n.title,
    body: n.body,
    link_url: n.link_url,
    image_url: n.image_url,
    published_at: n.published_at ?? new Date().toISOString(),
  });

  redirect(`/admin/${slug}/news?saved=${id}`);
}

export async function updateNews(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const linkUrl = String(formData.get('link_url') ?? '').trim();
  const imageUrl = String(formData.get('image_url') ?? '').trim(); // D#4
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
    link_url: string | null;
    image_url: string | null;
    status: string;
    published_at?: string | null;
  } = {
    title,
    body: body || null,
    link_url: linkUrl || null,
    image_url: imageUrl || null,
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
  redirect(`/admin/${slug}/news?saved=${id}`);
}

// ====================
// D#4(2026-09-02):消息圖片瀏覽器直傳(同 banner 的簽名上傳連結 pattern,
// 檔案不經過 server,避開 Vercel 4.5MB body 限制)
// ====================

export type NewsUploadUrlResult =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; error: string };

export async function createNewsImageUploadUrl(formData: FormData): Promise<NewsUploadUrlResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const filename = String(formData.get('filename') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };

  const tenantId = await tenantIdBySlug(slug);
  if (!tenantId) return { ok: false, error: '攤位不存在' };

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const path = `${tenantId}/news/${Date.now()}.${safeExt}`;

  const { data, error } = await supabaseAdmin.storage
    .from('tenant-assets')
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[createNewsImageUploadUrl]', error);
    return { ok: false, error: '建立上傳連結失敗' };
  }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  return { ok: true, path: data.path, token: data.token, publicUrl };
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
