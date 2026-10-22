import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/lib/member-auth';

export const dynamic = 'force-dynamic';

/**
 * 目前登入的會員(Phase 26):給頁首的帳號選單與結帳頁預填用。
 * 頁面本身不讀 cookie,改由這個 API 在瀏覽器端問,商品頁才能維持 ISR 快取。
 * 回 { member: null } 代表沒登入。永遠不快取。name 可能是 null(信箱登入的人通常沒名字),顯示端自己退回信箱前半。
 */
export async function GET() {
  const m = await getCurrentMember();
  const body = m
    ? { member: { id: m.id, name: m.display_name, avatarUrl: m.picture_url, email: m.email, phone: m.phone } }
    : { member: null };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
