import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { colors, fontSize, radius, space } from '@/lib/admin-theme';
import { SubmitButton } from '../../_components/submit-button';
import { inviteMember, removeMember, updateMemberRole } from './actions';

/**
 * Members 邀請 UI(Phase 13.1,2026-06-04)。
 *
 * 列表 + 邀請表單。Role 共 3 等:owner / admin / staff,
 * 但目前 code 沒任何地方真檢 role,僅作未來 RLS 預埋。
 */

const ROLE_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  owner: { text: 'Owner', bg: '#fae8ff', fg: '#86198f' },
  admin: { text: 'Admin', bg: '#dbeafe', fg: '#1d4ed8' },
  staff: { text: 'Staff', bg: '#f3f4f6', fg: '#4b5563' },
};

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
    <div style={{ padding: space['6'] }}>
      <header style={{ marginBottom: space['8'] }}>
        <h1
          style={{
            margin: 0,
            fontSize: fontSize['2xl'],
            fontWeight: 700,
            color: colors.textPrimary,
            letterSpacing: '-0.01em',
          }}
        >
          成員
        </h1>
        <p style={{ margin: `${space['1']}px 0 0`, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 1.5 }}>
          管理 {tenant.name} 的後台存取權限。邀請後對方需用同 email 註冊 / 登入即可進來。
        </p>
      </header>

      {/* 訊息 banner */}
      {(error || info) && (
        <div
          style={{
            padding: `${space['3']}px ${space['4']}px`,
            marginBottom: space['5'],
            background: error ? colors.dangerBg : '#ecfdf5',
            border: `1px solid ${error ? colors.dangerBorder : '#a7f3d0'}`,
            color: error ? colors.dangerText : '#047857',
            fontSize: fontSize.sm,
            borderRadius: radius.md,
            lineHeight: 1.5,
          }}
        >
          {error ? decodeURIComponent(error) : decodeURIComponent(info!)}
        </div>
      )}

      {/* 邀請表單 */}
      <section
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: `${space['5']}px ${space['6']}px`,
          marginBottom: space['8'],
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: space['4'],
            fontSize: fontSize.lg,
            fontWeight: 600,
            color: colors.textPrimary,
          }}
        >
          邀請成員
        </h2>
        <form action={inviteMember} style={{ display: 'flex', flexDirection: 'column', gap: space['4'] }}>
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: space['3'] }}>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="coworker@example.com"
              style={{
                padding: `${space['3']}px ${space['4']}px`,
                fontSize: fontSize.md,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                color: colors.textPrimary,
                background: colors.bgCard,
                outline: 'none',
              }}
            />
            <select
              name="role"
              defaultValue="staff"
              style={{
                padding: `${space['3']}px ${space['4']}px`,
                fontSize: fontSize.md,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                background: colors.bgCard,
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SubmitButton pendingText="邀請中…">送出邀請</SubmitButton>
          </div>
        </form>
        <p style={{ marginTop: space['3'], marginBottom: 0, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 1.6 }}>
          ⚠️ 目前 code 沒檢查 role 等級,3 個 role 實際權限相同(預埋給未來 RLS 用)。
        </p>
      </section>

      {/* 成員列表 */}
      <section
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: `${space['4']}px ${space['6']}px`,
            borderBottom: `1px solid ${colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'baseline',
            gap: space['3'],
          }}
        >
          <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: colors.textPrimary }}>
            目前成員
          </h2>
          <span style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
            {members.length} 人 · {ownerCount} owner
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={thStyle}>Email / 顯示名</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>狀態</th>
              <th style={thStyle}>加入</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>動作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const pu = m.platform_users;
              const isLastOwner = m.role === 'owner' && ownerCount <= 1;
              const roleStyle = ROLE_LABEL[m.role] ?? ROLE_LABEL.staff;
              const joinedTaipei = new Date(m.created_at).toLocaleDateString('zh-TW', {
                timeZone: 'Asia/Taipei',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              });
              return (
                <tr key={m.id} style={{ borderTop: `1px solid ${colors.borderSubtle}` }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: colors.textPrimary, fontSize: fontSize.sm }}>
                      {pu?.email ?? '(無 email)'}
                    </div>
                    {pu?.display_name && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                        {pu.display_name}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <form action={updateMemberRole} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="hidden" name="tenant_slug" value={tenant.slug} />
                      <input type="hidden" name="member_id" value={m.id} />
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          background: roleStyle.bg,
                          color: roleStyle.fg,
                          borderRadius: 4,
                          fontSize: fontSize.xs,
                          fontWeight: 600,
                          marginRight: 6,
                        }}
                      >
                        {roleStyle.text}
                      </span>
                      <select
                        name="role"
                        defaultValue={m.role}
                        disabled={isLastOwner}
                        style={{
                          padding: '4px 8px',
                          fontSize: fontSize.xs,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 4,
                          background: isLastOwner ? '#f9fafb' : colors.bgCard,
                          color: colors.textPrimary,
                          fontFamily: 'inherit',
                          cursor: isLastOwner ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                      {!isLastOwner && (
                        <button
                          type="submit"
                          style={{
                            padding: '4px 10px',
                            fontSize: fontSize.xs,
                            background: colors.bgCard,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 4,
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          改
                        </button>
                      )}
                    </form>
                  </td>
                  <td style={tdStyle}>
                    {pu?.line_user_id ? (
                      <span style={{ fontSize: fontSize.xs, color: '#16a34a' }}>● 已綁 LINE</span>
                    ) : pu?.email ? (
                      <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>email 邀請</span>
                    ) : (
                      <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: colors.textMuted, fontSize: fontSize.xs }}>{joinedTaipei}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {!isLastOwner ? (
                      <form action={removeMember} style={{ display: 'inline' }}>
                        <input type="hidden" name="tenant_slug" value={tenant.slug} />
                        <input type="hidden" name="member_id" value={m.id} />
                        <button
                          type="submit"
                          style={{
                            padding: '4px 10px',
                            fontSize: fontSize.xs,
                            background: 'transparent',
                            border: `1px solid ${colors.dangerBorder}`,
                            borderRadius: 4,
                            color: colors.dangerText,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          移除
                        </button>
                      </form>
                    ) : (
                      <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: colors.textMuted, padding: space['8'] }}>
                  尚無成員
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: `${space['3']}px ${space['6']}px`,
  fontSize: fontSize.xs,
  fontWeight: 600,
  color: colors.textMuted,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: `${space['3']}px ${space['6']}px`,
  verticalAlign: 'middle',
  color: colors.textPrimary,
};
