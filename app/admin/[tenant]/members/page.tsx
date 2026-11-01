import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { SubmitButton } from '../../_components/submit-button';
import { FlashToast } from '../../../_components/toast';
import { inviteMember, removeMember, updateMemberRole } from './actions';

/**
 * 管理員(Phase 13.1,2026-06-04;2026-11-01 換成後台新設計系統、改名「管理員」)。
 *
 * 邀請表單 + 清單。角色共 3 等:owner / admin / staff,
 * 但目前 code 沒任何地方真檢 role,僅作未來 RLS 預埋。
 */

// 2026-11-01:角色改中文(以前直接顯示 Owner / Admin / Staff)
const ROLE_LABEL: Record<string, { text: string; cls: string }> = {
  owner: { text: '擁有者', cls: 'mb-owner' },
  admin: { text: '管理者', cls: 'mb-admin' },
  staff: { text: '工作人員', cls: 'mb-staff' },
};
const ROLE_OPTIONS = [
  { value: 'staff', label: '工作人員' },
  { value: 'admin', label: '管理者' },
  { value: 'owner', label: '擁有者' },
];

type Row = {
  id: string;
  role: string;
  created_at: string;
  platform_users: {
    id: string;
    email: string | null;
    display_name: string | null;
    line_user_id: string | null;
  } | null;
};

async function getMembers(tenantId: string): Promise<Row[]> {
  const { data } = await supabaseAdmin
    .from('tenant_members')
    .select('id, role, created_at, platform_users(id, email, display_name, line_user_id)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  return ((data as unknown) as Row[] | null) ?? [];
}

const CSS = `
.mb-head{margin-bottom:16px}
.mb-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.mb-head p{margin:4px 0 0;font-size:13px;color:#71717a;line-height:1.5}
.mb-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:16px;overflow:hidden}
.mb-card h2{margin:0;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;gap:8px}
.mb-card h2 .n{font-weight:400;color:#71717a;font-size:13px}
.mb-invite{padding:16px;display:flex;flex-direction:column;gap:10px}
.mb-invite .row{display:grid;grid-template-columns:1fr 160px auto;gap:8px;align-items:center}
.mb-invite .hint{font-size:12px;color:#71717a;line-height:1.5}
.mb-row{display:grid;grid-template-columns:1.4fr 280px 110px 100px 80px;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.mb-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px;border-top:0}
.mb-row .muted{color:#71717a;font-size:13px}
.mb-row .sub{font-size:12px;color:#71717a;margin-top:2px}
.mb-row .r{text-align:right}
.mb-role{display:flex;gap:6px;align-items:center;margin:0}
.mb-role select.ui-input{width:120px}
.mb-owner{background:#fae8ff;color:#86198f;border-color:transparent}
.mb-admin{background:#eff6ff;color:#1d4ed8;border-color:transparent}
.mb-staff{background:#f4f4f5;color:#52525b;border-color:transparent}
.mb-line{color:#15803d;font-size:12.5px;font-weight:500}
.mb-empty{padding:28px 16px;text-align:center;color:#71717a;font-size:13.5px}
@media (max-width:767px){
  .mb-card{border-radius:10px}
  .mb-invite .row{grid-template-columns:1fr}
  .mb-row{grid-template-columns:1fr auto;gap:6px 12px;padding:12px 14px}
  .mb-row.head{display:none}
  .mb-row > .c-role{grid-column:1/-1}
  .mb-row > .c-added{display:none}
}
`;

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const { tenant: slug } = await params;
  const { error, info } = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const members = await getMembers(tenant.id);
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 1000 }}>
        {info && <FlashToast message={decodeURIComponent(info)} />}
        {error && <FlashToast tone="error" message={decodeURIComponent(error)} />}

        <header className="mb-head">
          <h1>管理員</h1>
          <p>誰能登入 {tenant.name} 的後台。邀請後對方用同一個 email 註冊或登入就能進來。</p>
        </header>

        <div className="mb-card">
          <h2>邀請管理員</h2>
          <form action={inviteMember} className="mb-invite">
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <div className="row">
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="對方的 email,例如 coworker@example.com"
                className="ui-input"
                aria-label="Email"
              />
              <select name="role" defaultValue="staff" className="ui-input" aria-label="角色">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <SubmitButton pendingText="邀請中…">送出邀請</SubmitButton>
            </div>
            <div className="hint">三種角色目前權限相同,之後才會分開。</div>
          </form>
        </div>

        <div className="mb-card">
          <h2>
            目前管理員
            <span className="n">
              {members.length} 人 · 擁有者 {ownerCount} 人
            </span>
          </h2>
          {members.length === 0 ? (
            <div className="mb-empty">還沒有管理員。</div>
          ) : (
            <>
              <div className="mb-row head" aria-hidden>
                <span>Email / 名稱</span>
                <span>角色</span>
                <span>狀態</span>
                <span>加入</span>
                <span />
              </div>
              {members.map((m) => {
                const pu = m.platform_users;
                const isLastOwner = m.role === 'owner' && ownerCount <= 1;
                const role = ROLE_LABEL[m.role] ?? ROLE_LABEL.staff;
                const joinedTaipei = new Date(m.created_at).toLocaleDateString('zh-TW', {
                  timeZone: 'Asia/Taipei',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                });
                return (
                  <div key={m.id} className="mb-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pu?.email ?? '(沒有 email)'}</div>
                      {pu?.display_name && <div className="sub">{pu.display_name}</div>}
                    </div>
                    <form action={updateMemberRole} className="c-role mb-role">
                      <input type="hidden" name="tenant_slug" value={tenant.slug} />
                      <input type="hidden" name="member_id" value={m.id} />
                      <span className={`ui-badge ${role.cls}`}>{role.text}</span>
                      <select name="role" defaultValue={m.role} disabled={isLastOwner} className="ui-input ui-input-sm" aria-label="改角色">
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {!isLastOwner && (
                        <button type="submit" className="ui-btn ui-btn-outline ui-btn-xs">改</button>
                      )}
                    </form>
                    <div>
                      {pu?.line_user_id ? (
                        <span className="mb-line">已綁 LINE</span>
                      ) : pu?.email ? (
                        <span className="muted">email 邀請</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                    <div className="c-added muted">{joinedTaipei}</div>
                    <div className="r">
                      {!isLastOwner ? (
                        <form action={removeMember} style={{ display: 'inline' }}>
                          <input type="hidden" name="tenant_slug" value={tenant.slug} />
                          <input type="hidden" name="member_id" value={m.id} />
                          <button type="submit" className="ui-btn ui-btn-ghost ui-btn-xs" style={{ color: '#b91c1c' }}>移除</button>
                        </form>
                      ) : (
                        <span className="muted" title="最後一位擁有者不能移除">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
