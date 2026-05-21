'use server';

import { supabaseAdmin } from '@/lib/supabase';

// 活動報名專用 LIFF channel,沒設 fallback 用既有 LIFF_CHANNEL_ID
const LIFF_CHANNEL_ID =
  process.env.LIFF_CHANNEL_ID_EVENTS ?? process.env.LIFF_CHANNEL_ID!;
const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

async function verifyIdToken(idToken: string): Promise<string> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: LIFF_CHANNEL_ID,
  });
  const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LIFF token 驗證失敗: ${text}`);
  }
  const data = (await resp.json()) as { sub?: string };
  if (!data.sub) throw new Error('LIFF token 缺 sub');
  return data.sub;
}

async function getUserId(lineUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export type EventListItem = {
  id: string;
  name: string;
  instructor: string | null;
  scheduled_at: string;
  region_name: string | null;
  capacity: number | null;
  is_paid: boolean;
  price_twd: number | null;
  confirmed_count: number;
  waitlist_count: number;
  // my_status:null = 沒報過 / 沒 active 報名;confirmed / waitlist / cancelled
  my_status: 'confirmed' | 'waitlist' | 'cancelled' | null;
  my_position: number | null;
};

export type EventsTenant = {
  name: string;
  logo_url: string | null;
};

export type EventsData = {
  tenant: EventsTenant;
  events: EventListItem[];
};

/**
 * 列出未來 60 天內所有未取消的活動 + 容量 / 已報名 / 候補數 / 自己的狀態。
 * 同時帶 tenant 資訊(name + logo)給 hero 用。
 */
export async function loadEvents(idToken: string): Promise<EventsData> {
  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) throw new Error('查無會員資料,請先到「會員專區」填資料');

  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 天

  const { data: classes, error: cErr } = await supabaseAdmin
    .from('classes')
    .select(
      'id, name, instructor, scheduled_at, capacity, is_paid, price_twd, regions(name)',
    )
    .eq('tenant_id', TENANT_ID)
    .gte('scheduled_at', now.toISOString())
    .lt('scheduled_at', horizon.toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_at');

  if (cErr) {
    console.error('[loadEvents fetch classes]', cErr);
    throw new Error('查活動失敗');
  }

  type ClassRow = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    capacity: number | null;
    is_paid: boolean;
    price_twd: number | null;
    regions: { name: string } | null;
  };
  const rows = ((classes as unknown) as ClassRow[] | null) ?? [];

  // 拉 tenant info(name + logo)給 hero 用
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('name, logo_url')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const tenant = ((tenantRow as { name: string; logo_url: string | null } | null) ?? { name: '活動報名', logo_url: null }) as EventsTenant;

  if (rows.length === 0) return { tenant, events: [] };

  const classIds = rows.map((c) => c.id);

  // 一次撈 reservations:取所有 status active 的(排除 cancelled)
  const { data: allResvs } = await supabaseAdmin
    .from('reservations')
    .select('class_id, user_id, status, position')
    .in('class_id', classIds);

  type ResvRow = {
    class_id: string;
    user_id: string;
    status: string;
    position: number | null;
  };
  const resvs = (allResvs as ResvRow[] | null) ?? [];

  // 統計每堂課 confirmed / waitlist 數,以及自己的狀態
  const confirmedCount = new Map<string, number>();
  const waitlistCount = new Map<string, number>();
  const myResv = new Map<string, { status: string; position: number | null }>();
  for (const r of resvs) {
    if (r.status === 'confirmed') {
      confirmedCount.set(r.class_id, (confirmedCount.get(r.class_id) ?? 0) + 1);
    } else if (r.status === 'waitlist') {
      waitlistCount.set(r.class_id, (waitlistCount.get(r.class_id) ?? 0) + 1);
    }
    if (r.user_id === userId) {
      myResv.set(r.class_id, { status: r.status, position: r.position });
    }
  }

  const events: EventListItem[] = rows.map((c) => {
    const my = myResv.get(c.id);
    return {
      id: c.id,
      name: c.name,
      instructor: c.instructor,
      scheduled_at: c.scheduled_at,
      region_name: c.regions?.name ?? null,
      capacity: c.capacity,
      is_paid: c.is_paid,
      price_twd: c.price_twd,
      confirmed_count: confirmedCount.get(c.id) ?? 0,
      waitlist_count: waitlistCount.get(c.id) ?? 0,
      my_status:
        my?.status === 'confirmed' || my?.status === 'waitlist' || my?.status === 'cancelled'
          ? (my.status as 'confirmed' | 'waitlist' | 'cancelled')
          : null,
      my_position: my?.position ?? null,
    };
  });

  return { tenant, events };
}

export type ReserveResult =
  | { ok: true; status: 'confirmed' | 'waitlist'; position: number | null }
  | { ok: false; error: string };

/**
 * 學員報名一堂活動。
 * - 容量 0 / null → 自動 confirmed(無人數上限)
 * - 已報 confirmed < capacity → confirmed
 * - 滿了 → waitlist + 自動算 position
 * - 之前是 cancelled → 重新 reserve(update 不 insert,因為 unique)
 */
export async function reserveSpot(idToken: string, classId: string): Promise<ReserveResult> {
  if (!classId) return { ok: false, error: '缺活動資訊' };

  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) return { ok: false, error: '查無會員資料,請先到「會員專區」填資料' };

  // 確認活動存在 / 未取消
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, capacity, status, scheduled_at')
    .eq('tenant_id', TENANT_ID)
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return { ok: false, error: '找不到活動' };
  const c = cls as {
    id: string;
    name: string;
    capacity: number | null;
    status: string;
    scheduled_at: string;
  };
  if (c.status === 'cancelled') return { ok: false, error: '此活動已取消' };

  // 算 confirmed 數
  const { count: confirmedCount } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', 'confirmed');

  const cap = c.capacity ?? Number.MAX_SAFE_INTEGER;
  const hasRoom = (confirmedCount ?? 0) < cap;

  let newStatus: 'confirmed' | 'waitlist';
  let newPosition: number | null;

  if (hasRoom) {
    newStatus = 'confirmed';
    newPosition = null;
  } else {
    newStatus = 'waitlist';
    const { count: waitlistCount } = await supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'waitlist');
    newPosition = (waitlistCount ?? 0) + 1;
  }

  // upsert(unique(class_id, user_id)— 之前可能是 cancelled,改回 active)
  const { error } = await supabaseAdmin
    .from('reservations')
    .upsert(
      {
        tenant_id: TENANT_ID,
        class_id: classId,
        user_id: userId,
        status: newStatus,
        position: newPosition,
      },
      { onConflict: 'class_id,user_id' },
    );

  if (error) {
    console.error('[reserveSpot]', error);
    return { ok: false, error: '報名失敗,請稍後再試' };
  }

  return { ok: true, status: newStatus, position: newPosition };
}

export type CancelResult = { ok: boolean; error?: string };

/**
 * 學員自己取消報名。
 * 設為 cancelled 不刪(保留紀錄)。Wave 3 自動升等待補:trigger / cron 處理。
 */
export async function cancelReservation(
  idToken: string,
  classId: string,
): Promise<CancelResult> {
  if (!classId) return { ok: false, error: '缺活動資訊' };

  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) return { ok: false, error: '查無會員資料' };

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled', position: null })
    .eq('class_id', classId)
    .eq('user_id', userId)
    .in('status', ['confirmed', 'waitlist']);

  if (error) {
    console.error('[cancelReservation]', error);
    return { ok: false, error: '取消失敗,請稍後再試' };
  }

  return { ok: true };
}
