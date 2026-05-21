import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side supabase client(anon key)— 給 realtime subscription 用。
 * 跟 supabase-server.ts(SSR cookie session)、supabase.ts(service_role)分開。
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
