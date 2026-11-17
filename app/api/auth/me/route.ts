import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/lib/member-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * 目前登入的會員(Phase 26):給頁首的帳號選單與結帳頁預填用。
 * 頁面本身不讀 cookie,改由這個 API 在瀏覽器端問,商品頁才能維持 ISR 快取。
 * adminSlugs(2026-11-17):這個人是哪些攤位的成員(tenant_members),選單用來決定要不要顯示「我的後台」;不是任何攤位的成員就是 []。
 * 回 { member: null } 代表沒登入。永遠不快取。name 可能是 null(信箱登入的人通常沒名字),顯示端自己退回信箱前半。
 */
export async function GET() {
  const m = await getCurrentMember();
  if (!m) return NextResponse.json({ member: null }, { headers: { 'Cache-Control': 'no-store' } });

  const { data, error } = await supabaseAdmin.from('tenant_members').select('tenants(slug)').eq('user_id', m.id);
  if (error) console.error('[auth/me tenant_members]', error);
  const adminSlugs = ((data as unknown as { tenants: { slug: string } | null }[] | null) ?? [])
    .map((r) => r.tenants?.slug)
    .filter((s): s is string => !!s);

  const body = { member: { id: m.id, name: m.display_name, avatarUrl: m.picture_url, email: m.email, phone: m.phone, adminSlugs } };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
