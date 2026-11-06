/**
 * Super admin 判定(Phase 7.11,2026-05-26)。
 *
 * env SUPER_ADMIN_EMAILS 為逗號分隔的 email 白名單。
 * 例:`SUPER_ADMIN_EMAILS=phsiung957@gmail.com`
 *
 * 用途:
 * - /admin/applications(審核待申請的 tenant)只給 super admin 看
 * - 未來 /admin/_audit / impersonate 等都可以掛這邊
 */
import { createSupabaseServerClient } from './supabase-server';
import { getTenantBySlug, getUserAllowedTenants, supabaseAdmin, type TenantBySlug } from './supabase';

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.SUPER_ADMIN_EMAILS ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// ====================
// 後台 server action 的門(2026-11-05)
// 之前只有 /admin/[tenant] 的 layout 擋頁面,action 的攤位來自表單的 tenant_slug / tenant_id
// 隱藏欄位,登入任一後台帳號改一下就能動別的攤位。現在每個 action 一進來先過這裡:
// 登入帳號必須是該攤位的成員(tenant_members,含申請中),或超級管理員,否則直接丟錯。
// ====================

/** 目前登入後台的 email(Phase 34 起 export:金鑰匯入 action 與收款設定頁要判超級管理員) */
export async function currentAdminEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

/** 用 slug 驗:不是成員也不是超級管理員就丟錯 */
export async function assertTenantAccess(slug: string): Promise<void> {
  if (!slug) throw new Error('缺攤位資訊');
  const email = await currentAdminEmail();
  if (!email) throw new Error('請先登入後台');
  if (isSuperAdmin(email)) return;
  const allowed = await getUserAllowedTenants(email);
  if (!allowed.some((t) => t.slug === slug)) {
    console.warn('[tenant-access] 拒絕', email, '→', slug);
    throw new Error('沒有這個攤位的權限');
  }
}

/** 取攤位前先驗權限;攤位不存在回 null(跟 getTenantBySlug 一樣),沒權限丟錯 */
export async function requireAdminTenant(slug: string): Promise<TenantBySlug | null> {
  await assertTenantAccess(slug);
  return getTenantBySlug(slug);
}

/** 用 tenant id 驗(舊表單只帶 tenant_id) */
export async function assertTenantAccessById(tenantId: string): Promise<void> {
  const { data } = await supabaseAdmin.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (!slug) throw new Error('攤位不存在');
  await assertTenantAccess(slug);
}

/** 改 / 刪單一資料列的動作:用那列的 tenant_id 反查再驗(商品、規格、訂單、活動…) */
export async function assertRowAccess(table: string, id: string): Promise<void> {
  if (!id) throw new Error('缺資料 id');
  const { data } = await supabaseAdmin.from(table).select('tenant_id').eq('id', id).maybeSingle();
  const tenantId = (data as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) throw new Error('資料不存在');
  await assertTenantAccessById(tenantId);
}
