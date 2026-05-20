'use server';

import { supabaseAdmin } from '@/lib/supabase';

const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID_CHECKIN ?? process.env.LIFF_CHANNEL_ID!;
const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

/**
 * 透過 LINE 官方 endpoint 驗證 LIFF ID token
 * 回傳 sub(= LINE userId)。失敗 throw。
 */
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

export type ClassListItem = {
  id: string;
  name: string;
  instructor: string | null;
  scheduled_at: string;
  region_name: string | null;
  already_checked_in: boolean;
};

/**
 * 列出今日(Asia/Taipei)該 tenant 的所有未取消課程,
 * 並標記學員是否已簽到。
 */
export async function loadTodayClasses(idToken: string): Promise<ClassListItem[]> {
  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) throw new Error('查無會員資料,請先到「會員專區」填資料');

  // Asia/Taipei 今日區間
  const now = new Date();
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const dayStartUtc = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate()) - twOffsetMs,
  ).toISOString();
  const dayEndUtc = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() + 1) - twOffsetMs,
  ).toISOString();

  const { data: classes, error: cErr } = await supabaseAdmin
    .from('classes')
    .select('id, name, instructor, scheduled_at, regions(name)')
    .eq('tenant_id', TENANT_ID)
    .gte('scheduled_at', dayStartUtc)
    .lt('scheduled_at', dayEndUtc)
    .neq('status', 'cancelled')
    .order('scheduled_at');

  if (cErr) {
    console.error('[loadTodayClasses]', cErr);
    throw new Error('查課程失敗');
  }

  type Row = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    regions: { name: string } | null;
  };
  // supabase 對 *-to-one join 有時推成 array,unknown 繞過
  const rows = ((classes as unknown) as Row[] | null) ?? [];
  if (rows.length === 0) return [];

  // 一次查該 user 對這些 class 的簽到紀錄
  const classIds = rows.map((r) => r.id);
  const { data: attendances } = await supabaseAdmin
    .from('attendances')
    .select('class_id')
    .eq('user_id', userId)
    .in('class_id', classIds);
  const attendedSet = new Set(
    ((attendances as { class_id: string }[] | null) ?? []).map((a) => a.class_id),
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    instructor: r.instructor,
    scheduled_at: r.scheduled_at,
    region_name: r.regions?.name ?? null,
    already_checked_in: attendedSet.has(r.id),
  }));
}

export type CheckinResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * 學員主動簽到。method = 'liff' 或 'qr'(從 URL 帶 class_id 的)。
 */
export async function checkin(
  idToken: string,
  classId: string,
  method: 'liff' | 'qr' = 'liff',
): Promise<CheckinResult> {
  if (!classId) return { ok: false, error: '缺課程資訊' };

  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) return { ok: false, error: '查無會員資料,請先到「會員專區」填資料' };

  // 確認課程存在 + 屬於此 tenant + 沒取消
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, status, scheduled_at')
    .eq('tenant_id', TENANT_ID)
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return { ok: false, error: '找不到課程' };
  const c = cls as { id: string; name: string; status: string; scheduled_at: string };
  if (c.status === 'cancelled') return { ok: false, error: '此課程已取消' };

  const { error } = await supabaseAdmin.from('attendances').insert({
    tenant_id: TENANT_ID,
    class_id: classId,
    user_id: userId,
    method,
  });

  if (error) {
    // 23505 = unique_violation(已簽過)
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: '你已經簽過這堂課了' };
    }
    console.error('[checkin]', error);
    return { ok: false, error: '簽到失敗,請稍後再試' };
  }

  return { ok: true, message: `✓ ${c.name} 簽到成功` };
}
