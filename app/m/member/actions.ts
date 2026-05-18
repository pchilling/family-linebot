'use server';

import { supabaseAdmin } from '@/lib/supabase';

const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID!;
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

export type MemberProfile = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
  birthday: string | null;
};

/**
 * 載入會員資料(從 idToken 取得 userId 後查 DB)
 */
export async function loadProfile(
  idToken: string,
): Promise<MemberProfile | null> {
  const lineUserId = await verifyIdToken(idToken);

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('full_name, phone, address, birthday')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) {
    console.error('[loadProfile]', error);
    throw new Error('讀取會員資料失敗');
  }
  return (data as MemberProfile | null) ?? null;
}

/**
 * 儲存會員資料(upsert)
 */
export async function saveProfile(formData: FormData) {
  const idToken = String(formData.get('idToken'));
  const lineUserId = await verifyIdToken(idToken);

  const full_name = String(formData.get('full_name') || '').trim() || null;
  const phone = String(formData.get('phone') || '').trim() || null;
  const address = String(formData.get('address') || '').trim() || null;
  const birthdayRaw = String(formData.get('birthday') || '').trim();
  const birthday = birthdayRaw || null;

  // upsert by (tenant_id, line_user_id) — 既有 user 一定有,update
  const { error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        tenant_id: TENANT_ID,
        line_user_id: lineUserId,
        full_name,
        phone,
        address,
        birthday,
        status: 'active',
      },
      { onConflict: 'tenant_id,line_user_id' },
    );
  if (error) {
    console.error('[saveProfile]', error);
    throw new Error('儲存失敗:' + error.message);
  }
}
