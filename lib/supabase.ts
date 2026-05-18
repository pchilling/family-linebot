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
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        tenant_id: params.tenantId,
        line_user_id: params.lineUserId,
        display_name: params.displayName ?? null,
        picture_url: params.pictureUrl ?? null,
        status: params.status ?? 'active',
      },
      { onConflict: 'tenant_id,line_user_id' },
    )
    .select('id')
    .single();
  if (error) {
    console.error('[upsertUser]', error);
    return null;
  }
  return data.id as string;
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

  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('*, regions(name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', monthStart)
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
