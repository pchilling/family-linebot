/**
 * Admin 全域 layout — 純 pass-through。
 * 過往這裡有 top nav header,redesign(2026-05-21)後改成 sidebar 在 tenant layout 內,
 * 這層不再 render UI,免雙 nav。
 * 登入 / 登出邏輯改到 sidebar 底部(app/admin/[tenant]/layout.tsx)。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
