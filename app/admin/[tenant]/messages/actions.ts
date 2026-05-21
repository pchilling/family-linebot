'use server';

import { revalidatePath } from 'next/cache';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 把所有 support 模式內未讀 inbound 訊息標為已讀。
 * 進 messages 頁面 mount 後 client effect 呼叫(延遲 2 秒讓 user 先看 highlight)
 */
export async function markAllSupportAsRead(slug: string): Promise<void> {
  const t = await getTenantBySlug(slug);
  if (!t) return;
  await supabaseAdmin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', t.id)
    .eq('is_support', true)
    .eq('direction', 'inbound')
    .is('read_at', null);
  revalidatePath(`/admin/${slug}/messages`);
}
