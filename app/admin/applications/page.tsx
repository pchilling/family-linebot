import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/super-admin';
import { approveApplication, reopenApplication, rejectApplication } from './actions';
import { SubmitButton } from '../_components/submit-button';
import { colors, fontFamilySans, fontSize, fontWeight, radius, space } from '@/lib/admin-theme';

export const dynamic = 'force-dynamic';

type ApplicationRow = {
  id: string;
  slug: string;
  name: string;
  order_prefix: string;
  status: string;
  applicant_phone: string | null;
  business_type: string | null;
  application_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function formatTw(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * /admin/applications — Super admin 審核待申請的攤位。
 * env SUPER_ADMIN_EMAILS 白名單外的人 redirect 走。
 */
export default async function ApplicationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect('/admin/login');
  if (!isSuperAdmin(user.email)) redirect('/admin');

  // 撈所有非 active 的 tenants(pending + rejected)
  const { data } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, slug, name, order_prefix, status, applicant_phone, business_type, application_notes, rejection_reason, reviewed_by, reviewed_at, created_at',
    )
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false });

  const applications = (data as ApplicationRow[] | null) ?? [];
  const pending = applications.filter((a) => a.status === 'pending');
  const rejected = applications.filter((a) => a.status === 'rejected');

  // 撈申請人 email(用 tenant_members → platform_users.email)
  const tenantIds = applications.map((a) => a.id);
  const emailsByTenant = new Map<string, string>();
  if (tenantIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id, platform_users(email)')
      .in('tenant_id', tenantIds)
      .eq('role', 'owner');
    type Row = { tenant_id: string; platform_users: { email: string | null } | null };
    for (const m of (members as Row[] | null) ?? []) {
      if (m.platform_users?.email) emailsByTenant.set(m.tenant_id, m.platform_users.email);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bgBody,
        fontFamily: fontFamilySans,
        color: colors.textPrimary,
        padding: `${space['8']}px ${space['4']}px`,
      }}
    >
      <main style={{ maxWidth: 920, margin: '0 auto' }}>
        <header style={{ marginBottom: space['8'] }}>
          <Link href="/admin" style={{ color: colors.textMuted, fontSize: fontSize.sm, textDecoration: 'none' }}>
            ← 回 admin
          </Link>
          <h1
            style={{
              margin: `${space['3']}px 0 ${space['1']}px`,
              fontSize: fontSize['2xl'],
              fontWeight: fontWeight.semibold,
              letterSpacing: '-0.02em',
            }}
          >
            申請審核
          </h1>
          <p style={{ margin: 0, color: colors.textMuted, fontSize: fontSize.sm }}>
            Super admin · 共 {pending.length} 件待審 / {rejected.length} 件已拒
          </p>
        </header>

        {/* Pending */}
        <section style={{ marginBottom: space['10'] }}>
          <h2
            style={{
              fontSize: fontSize.md,
              fontWeight: fontWeight.semibold,
              marginBottom: space['4'],
              color: '#d97706',
            }}
          >
            ⏳ 待審 ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: fontSize.sm }}>(沒有待審申請)</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space['4'] }}>
              {pending.map((a) => (
                <ApplicationCard key={a.id} a={a} email={emailsByTenant.get(a.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Rejected */}
        {rejected.length > 0 && (
          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: fontSize.md,
                fontWeight: fontWeight.semibold,
                marginBottom: space['4'],
                color: '#991b1b',
              }}
            >
              ❌ 已拒絕 ({rejected.length}) — 點開展開
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space['4'], marginTop: space['4'] }}>
              {rejected.map((a) => (
                <ApplicationCard key={a.id} a={a} email={emailsByTenant.get(a.id)} />
              ))}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}

function ApplicationCard({ a, email }: { a: ApplicationRow; email: string | undefined }) {
  const isPending = a.status === 'pending';
  const isRejected = a.status === 'rejected';
  return (
    <article
      style={{
        background: colors.bgCard,
        border: `1px solid ${isPending ? '#fde68a' : '#fecaca'}`,
        borderLeft: `3px solid ${isPending ? '#d97706' : '#991b1b'}`,
        borderRadius: radius.lg,
        padding: `${space['5']}px`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: space['2'] }}>
        <div>
          <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>
            {a.name}
          </h3>
          <p style={{ margin: `${space['1']}px 0 0`, color: colors.textMuted, fontSize: fontSize.xs, fontFamily: 'var(--font-geist-mono), monospace' }}>
            /{a.slug} · {a.order_prefix} · 申請 {formatTw(a.created_at)}
          </p>
        </div>
        {isRejected && (
          <span
            style={{
              padding: '2px 10px',
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: 4,
              fontSize: fontSize.xs,
              fontWeight: fontWeight.semibold,
              height: 'fit-content',
            }}
          >
            已拒絕
          </span>
        )}
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: `${space['2']}px ${space['4']}px`,
          margin: `${space['4']}px 0 0`,
          fontSize: fontSize.sm,
        }}
      >
        <dt style={{ color: colors.textMuted }}>聯絡 email</dt>
        <dd style={{ margin: 0 }}>{email ?? '—'}</dd>
        <dt style={{ color: colors.textMuted }}>聯絡電話</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-geist-mono), monospace' }}>
          {a.applicant_phone ?? '—'}
        </dd>
        {a.business_type && (
          <>
            <dt style={{ color: colors.textMuted }}>業態</dt>
            <dd style={{ margin: 0 }}>{a.business_type}</dd>
          </>
        )}
        {a.application_notes && (
          <>
            <dt style={{ color: colors.textMuted }}>簡介</dt>
            <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.application_notes}</dd>
          </>
        )}
        {isRejected && a.rejection_reason && (
          <>
            <dt style={{ color: '#991b1b' }}>拒絕原因</dt>
            <dd style={{ margin: 0, color: '#991b1b', whiteSpace: 'pre-wrap' }}>{a.rejection_reason}</dd>
          </>
        )}
        {isRejected && a.reviewed_by && (
          <>
            <dt style={{ color: colors.textMuted }}>審核人</dt>
            <dd style={{ margin: 0, fontSize: fontSize.xs, color: colors.textMuted }}>
              {a.reviewed_by} · {formatTw(a.reviewed_at)}
            </dd>
          </>
        )}
      </dl>

      <div style={{ marginTop: space['5'], display: 'flex', gap: space['2'], flexWrap: 'wrap' }}>
        {isPending && (
          <>
            <form action={approveApplication} style={{ flex: 1, minWidth: 120 }}>
              <input type="hidden" name="tenant_id" value={a.id} />
              <SubmitButton fullWidth size="sm" pendingText="核准中…">✓ 核准</SubmitButton>
            </form>
            <details style={{ flex: 1, minWidth: 120 }}>
              <summary
                style={{
                  padding: `${space['3']}px ${space['4']}px`,
                  textAlign: 'center',
                  background: colors.bgCard,
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: radius.md,
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.semibold,
                  cursor: 'pointer',
                  listStyle: 'none',
                }}
              >
                ✗ 拒絕
              </summary>
              <form
                action={rejectApplication}
                style={{ marginTop: space['3'], display: 'flex', flexDirection: 'column', gap: space['2'] }}
              >
                <input type="hidden" name="tenant_id" value={a.id} />
                <textarea
                  name="rejection_reason"
                  required
                  placeholder="拒絕原因(必填)"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: `${space['2']}px`,
                    fontSize: fontSize.sm,
                    fontFamily: 'inherit',
                    border: '1px solid #fecaca',
                    borderRadius: radius.md,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
                <SubmitButton variant="danger" size="sm" pendingText="處理中…">確認拒絕</SubmitButton>
              </form>
            </details>
          </>
        )}
        {isRejected && (
          <form action={reopenApplication}>
            <input type="hidden" name="tenant_id" value={a.id} />
            <SubmitButton variant="secondary" size="sm" pendingText="處理中…">↻ 重新開啟</SubmitButton>
          </form>
        )}
      </div>
    </article>
  );
}
