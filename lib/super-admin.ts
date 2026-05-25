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
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.SUPER_ADMIN_EMAILS ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
