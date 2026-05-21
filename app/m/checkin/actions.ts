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

type UserRecord = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

/**
 * 確保 user 存在(沒加 bot 好友也能掃 QR 進來),回傳 user record。
 * 用 displayName / pictureUrl 補資料(從客端 LIFF getProfile 帶來)。
 */
async function ensureUser(
  lineUserId: string,
  displayName: string | null,
  pictureUrl: string | null,
): Promise<UserRecord> {
  // 先查
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, full_name, phone')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (existing) return existing as UserRecord;

  // 沒則 insert
  const { data: created, error } = await supabaseAdmin
    .from('users')
    .insert({
      tenant_id: TENANT_ID,
      line_user_id: lineUserId,
      display_name: displayName,
      picture_url: pictureUrl,
      status: 'active',
    })
    .select('id, full_name, phone')
    .single();

  if (error || !created) {
    console.error('[ensureUser]', error);
    throw new Error('建立會員資料失敗');
  }
  return created as UserRecord;
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

type ClassInfo = {
  id: string;
  name: string;
  scheduled_at: string;
};

export type CheckinState =
  | { kind: 'success'; message: string }
  | { kind: 'error'; error: string }
  | { kind: 'need_profile'; classInfo: ClassInfo };

async function doCheckin(
  userId: string,
  classId: string,
  method: 'qr' | 'liff',
): Promise<CheckinState> {
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, status, scheduled_at')
    .eq('tenant_id', TENANT_ID)
    .eq('id', classId)
    .maybeSingle();
  if (!cls) return { kind: 'error', error: '找不到課程' };
  const c = cls as { id: string; name: string; status: string; scheduled_at: string };
  if (c.status === 'cancelled') return { kind: 'error', error: '此課程已取消' };

  const { error } = await supabaseAdmin.from('attendances').insert({
    tenant_id: TENANT_ID,
    class_id: classId,
    user_id: userId,
    method,
  });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { kind: 'error', error: '你已經簽過這堂課了' };
    }
    console.error('[doCheckin]', error);
    return { kind: 'error', error: '簽到失敗,請稍後再試' };
  }

  return { kind: 'success', message: `✓ ${c.name} 簽到成功` };
}

/**
 * 學員掃 QR 進來。先確保 user 存在(沒加 bot 好友也建檔),
 * 再檢查是否填了 full_name + phone。沒填 → return need_profile,
 * 已填 → 直接簽到。
 */
export async function checkinFromQr(
  idToken: string,
  classId: string,
  displayName: string | null,
  pictureUrl: string | null,
): Promise<CheckinState> {
  if (!classId) return { kind: 'error', error: '缺課程資訊' };

  const lineUserId = await verifyIdToken(idToken);
  const user = await ensureUser(lineUserId, displayName, pictureUrl);

  const hasProfile = !!(user.full_name && user.phone);
  if (!hasProfile) {
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id, name, scheduled_at')
      .eq('tenant_id', TENANT_ID)
      .eq('id', classId)
      .maybeSingle();
    if (!cls) return { kind: 'error', error: '找不到課程' };
    return {
      kind: 'need_profile',
      classInfo: cls as ClassInfo,
    };
  }

  return doCheckin(user.id, classId, 'qr');
}

/**
 * 填完 mini-form 之後存資料 + 立刻簽到。
 */
export async function saveProfileAndCheckin(formData: FormData): Promise<CheckinState> {
  const idToken = String(formData.get('idToken') ?? '');
  const classId = String(formData.get('class_id') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const memberId = String(formData.get('member_id') ?? '').trim() || null;
  const referrerMemberId =
    String(formData.get('referrer_member_id') ?? '').trim() || null;

  if (!idToken || !classId) return { kind: 'error', error: '缺必要參數' };
  if (!fullName) return { kind: 'error', error: '請填真實姓名' };
  if (!phone) return { kind: 'error', error: '請填電話' };

  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) return { kind: 'error', error: '查無會員,請重新掃 QR' };

  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({
      full_name: fullName,
      phone,
      member_id: memberId,
      referrer_member_id: referrerMemberId,
      status: 'active',
    })
    .eq('id', userId);

  if (updErr) {
    console.error('[saveProfileAndCheckin update]', updErr);
    return { kind: 'error', error: '儲存資料失敗' };
  }

  return doCheckin(userId, classId, 'qr');
}

// Legacy export(舊版 page 還可能用到)
export type CheckinResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function checkin(
  idToken: string,
  classId: string,
  method: 'liff' | 'qr' = 'liff',
): Promise<CheckinResult> {
  if (!classId) return { ok: false, error: '缺課程資訊' };
  const lineUserId = await verifyIdToken(idToken);
  const userId = await getUserId(lineUserId);
  if (!userId) return { ok: false, error: '查無會員資料,請先到「會員專區」填資料' };
  const result = await doCheckin(userId, classId, method);
  if (result.kind === 'success') return { ok: true, message: result.message };
  if (result.kind === 'error') return { ok: false, error: result.error };
  return { ok: false, error: '請先填會員資料' };
}
