import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-only Supabase client(service_role,跳過 RLS)
 * 只在 server side(API route / server action / script)用,絕對不能放 browser
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Tenant = {
  id: string;
  name: string;
  line_channel_id: string | null;
  line_bot_user_id: string | null;
  line_channel_secret: string | null;
  line_channel_access_token: string | null;
  rich_menu_id: string | null;
};

export type User = {
  id: string;
  tenant_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: 'active' | 'blocked' | 'left';
};

export type TenantBySlug = {
  id: string;
  slug: string;
  name: string;
  plan: string;
};

export async function getTenantBySlug(slug: string): Promise<TenantBySlug | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, plan')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return null;
  return (data as TenantBySlug | null) ?? null;
}

export async function getTenantByBotUserId(botUserId: string): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('line_bot_user_id', botUserId)
    .single();
  if (error) return null;
  return data as Tenant;
}

export async function upsertUser(params: {
  tenantId: string;
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  status?: 'active' | 'blocked' | 'left';
}): Promise<string | null> {
  // update-first pattern:null 的 displayName / pictureUrl 不會 overwrite existing
  const updateData: Record<string, unknown> = {
    status: params.status ?? 'active',
  };
  if (params.displayName) updateData.display_name = params.displayName;
  if (params.pictureUrl) updateData.picture_url = params.pictureUrl;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('tenant_id', params.tenantId)
    .eq('line_user_id', params.lineUserId)
    .select('id');
  if (upErr) {
    console.error('[upsertUser update]', upErr);
    return null;
  }
  if (updated && updated.length > 0) {
    return (updated[0] as { id: string }).id;
  }

  // 沒既有 row → insert(follow event 第一次來會走這條)
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('users')
    .insert({
      tenant_id: params.tenantId,
      line_user_id: params.lineUserId,
      display_name: params.displayName ?? null,
      picture_url: params.pictureUrl ?? null,
      status: params.status ?? 'active',
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('[upsertUser insert]', insErr);
    return null;
  }
  return (inserted as { id: string }).id;
}

export type ClassRow = {
  id: string;
  tenant_id: string;
  region_id: string;
  regions: { name: string } | null;     // joined from regions table
  name: string;
  instructor: string | null;
  scheduled_at: string;
  duration_min: number | null;
  capacity: number | null;
  is_paid: boolean;
  price_twd: number | null;
  signup_url: string | null;
  description: string | null;
  status: string;
};

/**
 * 取本月開課的所有 class(以台灣時區為準)
 * Join regions 拿地點 name,排除 cancelled,依 scheduled_at 排序
 */
export async function getClassesForCurrentMonth(tenantId: string): Promise<ClassRow[]> {
  const now = new Date();
  // Asia/Taipei 月初 / 月末 — Vercel server runs UTC,計算用 UTC offset
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const monthStart = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), 1) - twOffsetMs).toISOString();
  const monthEnd = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth() + 1, 1) - twOffsetMs).toISOString();

  // 只列未來 + 今天(scheduled_at >= now),過去場次過濾掉
  const nowIso = now.toISOString();
  const effectiveStart = nowIso > monthStart ? nowIso : monthStart;

  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('*, regions(name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', effectiveStart)
    .lt('scheduled_at', monthEnd)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });
  if (error) {
    console.error('[getClassesForCurrentMonth]', error);
    return [];
  }
  return (data ?? []) as ClassRow[];
}

export async function logMessage(params: {
  tenantId: string;
  userId: string | null;
  direction: 'inbound' | 'outbound';
  eventType?: string;
  messageType?: string;
  content?: unknown;
  rawEvent?: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('messages').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    direction: params.direction,
    event_type: params.eventType ?? null,
    message_type: params.messageType ?? null,
    content: params.content ?? null,
    raw_event: params.rawEvent ?? null,
  });
  if (error) console.error('[logMessage]', error);
}
