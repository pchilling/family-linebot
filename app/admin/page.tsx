import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getUserAllowedTenants } from '@/lib/supabase';

/**
 * /admin → 看 user 第一個有權限的 tenant。
 * 沒登入 middleware 已擋(redirect /admin/login)。
 * 沒任何 tenant 權限 → /admin/login?error=no_tenant_access。
 */
export default async function AdminIndex() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = await getUserAllowedTenants(user?.email);
  if (allowed.length === 0) {
    redirect('/admin/login?error=no_tenant_access');
  }

  redirect(`/admin/${allowed[0].slug}`);
}
