import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * OAuth callback handler(Phase A — Google 登入,2026-05-26)
 *
 * Flow:
 *   1. 用戶按 login page 的「使用 Google 登入」
 *   2. 跳 Google → 同意 → Google redirect to /auth/callback?code=xxx
 *   3. 這裡 exchange code for session cookie
 *   4. redirect 去 /admin(那邊會做 tenant_members 檢查)
 *
 * 失敗 fallback /admin/login?error=oauth_failed
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/admin/login?error=oauth_failed', url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchange failed', error);
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent('signin_failed')}`, url),
    );
  }

  return NextResponse.redirect(new URL('/admin', url));
}
