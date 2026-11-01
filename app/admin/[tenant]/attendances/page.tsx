import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { IconChevronLeft } from '@/lib/icons';
import {
  cancelReservationAdmin,
  markAttendance,
  markNoShow,
  promoteWaitlist,
  unmarkAttendance,
} from './actions';

/**
 * 出席(2026-11-01 換成後台新設計系統)。
 * 列表 = 本週課程與每堂簽到數;詳情 = 單堂的報名 / 候補 / 簽到 / 未簽到名單與手動操作。
 * 查詢與 action 不變。
 */

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ class_id?: string }>;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function methodLabel(m: string): string {
  return ({ liff: 'LINE 報名頁', qr: '掃 QR', manual: '老師', admin: '後台' }[m]) ?? m;
}

const CSS = `
.at-head{margin-bottom:16px}
.at-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.at-head h1 .sub{font-size:14px;font-weight:400;color:#71717a}
.at-head p{margin:4px 0 0;font-size:13px;color:#71717a;line-height:1.5}
.at-back{display:inline-flex;align-items:center;gap:2px;font-size:13px;color:#71717a;text-decoration:none;margin-bottom:10px}
.at-back:hover{color:#18181b}
.at-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:16px;overflow:hidden}
.at-card h2{margin:0;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;gap:8px}
.at-card h2 .n{font-weight:400;color:#71717a;font-size:13px}
.at-card.dim{opacity:.7}
.at-row{display:grid;grid-template-columns:140px 1.4fr 1fr 1fr 110px 90px;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.at-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px;border-top:0}
.at-row .r{text-align:right;font-variant-numeric:tabular-nums}
.at-row .muted{color:#71717a;font-size:13px}
.at-link{font-weight:600;color:#18181b;text-decoration:none}
.at-link:hover{text-decoration:underline}
.at-li{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.at-li .main{flex:1;min-width:0}
.at-li .sub{font-size:12px;color:#71717a;margin-top:2px;display:flex;gap:6px;align-items:center}
.at-li form{margin:0}
.at-pos{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;color:#a16207;margin-right:8px;font-size:12.5px}
.at-empty{padding:24px 16px;text-align:center;color:#71717a;font-size:13.5px}
.at-ok{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.at-cancel{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
@media (max-width:767px){
  .at-card{border-radius:10px}
  .at-row{grid-template-columns:1fr auto;gap:4px 12px;padding:12px 14px}
  .at-row.head{display:none}
  .at-row > .c-time{grid-column:1/-1}
  .at-row > .c-place,.at-row > .c-teacher{display:none}
  .at-li{padding:10px 14px;flex-wrap:wrap}
}
`;

// ====================
// 列表 view:本週課程(已過 + 即將)+ 每堂簽到數
// ====================
async function ListView({ tenantId, slug }: { tenantId: string; slug: string }) {
  // 本週區間(Asia/Taipei)
  const now = new Date();
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const dayOfWeek = twNow.getUTCDay(); // 0=Sun .. 6=Sat
  const weekStart = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() - dayOfWeek) - twOffsetMs,
  ).toISOString();
  const weekEnd = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate() - dayOfWeek + 7) - twOffsetMs,
  ).toISOString();

  const { data: classes } = await supabaseAdmin
    .from('classes')
    .select('id, name, instructor, scheduled_at, capacity, status, regions(name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', weekStart)
    .lt('scheduled_at', weekEnd)
    .order('scheduled_at');

  type ClassRow = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    capacity: number | null;
    status: string;
    regions: { name: string } | null;
  };
  const rows = ((classes as unknown) as ClassRow[] | null) ?? [];

  // 一次拉本週所有課的簽到數
  const classIds = rows.map((c) => c.id);
  const counts = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: atts } = await supabaseAdmin
      .from('attendances')
      .select('class_id')
      .in('class_id', classIds);
    for (const a of ((atts as { class_id: string }[] | null) ?? [])) {
      counts.set(a.class_id, (counts.get(a.class_id) ?? 0) + 1);
    }
  }

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 1000 }}>
        <header className="at-head">
          <h1>
            出席 <span className="sub">本週</span>
          </h1>
          <p>點課程名稱看報名與簽到名單,也可以手動簽到。</p>
        </header>

        <div className="at-card">
          {rows.length === 0 ? (
            <div className="at-empty">本週沒有課程。</div>
          ) : (
            <>
              <div className="at-row head" aria-hidden>
                <span>時間</span>
                <span>課程</span>
                <span>地點</span>
                <span>老師</span>
                <span className="r">已簽 / 名額</span>
                <span>狀態</span>
              </div>
              {rows.map((c) => {
                const signed = counts.get(c.id) ?? 0;
                const isPast = new Date(c.scheduled_at) < now;
                return (
                  <div key={c.id} className="at-row">
                    <div className="c-time muted" style={{ color: isPast ? '#a1a1aa' : undefined }}>{formatDateTime(c.scheduled_at)}</div>
                    <div>
                      <Link href={`/admin/${slug}/attendances?class_id=${c.id}`} className="at-link">{c.name}</Link>
                    </div>
                    <div className="c-place muted">{c.regions?.name ?? '—'}</div>
                    <div className="c-teacher muted">{c.instructor ?? '—'}</div>
                    <div className="r" style={{ fontWeight: 600 }}>
                      {signed} / {c.capacity ?? '不限'}
                    </div>
                    <div>
                      {c.status === 'cancelled' ? <span className="ui-badge at-cancel">已取消</span> : <span className="ui-badge at-ok">正常</span>}
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

// ====================
// 詳情 view:單堂課的簽到名單 + 手動勾未簽
// ====================
async function DetailView({
  tenantId,
  slug,
  classId,
}: {
  tenantId: string;
  slug: string;
  classId: string;
}) {
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, instructor, scheduled_at, capacity, status, regions(name)')
    .eq('tenant_id', tenantId)
    .eq('id', classId)
    .maybeSingle();
  type Cls = {
    id: string;
    name: string;
    instructor: string | null;
    scheduled_at: string;
    capacity: number | null;
    status: string;
    regions: { name: string } | null;
  };
  const c = cls as Cls | null;
  if (!c) {
    return (
      <main style={{ padding: '28px 32px 48px' }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <Link href={`/admin/${slug}/attendances`} className="at-back">
          <IconChevronLeft size={14} /> 出席
        </Link>
        <p style={{ marginTop: 12, color: '#b91c1c' }}>找不到這堂課。</p>
      </main>
    );
  }

  // 平行撈:簽到 / 報名 / 全 tenant users
  const [{ data: attRaw }, { data: resvRaw }, { data: usersRaw }] = await Promise.all([
    supabaseAdmin
      .from('attendances')
      .select('user_id, method, checked_in_at, users(display_name, full_name)')
      .eq('class_id', classId)
      .order('checked_in_at'),
    supabaseAdmin
      .from('reservations')
      .select('user_id, status, position, created_at, users(display_name, full_name)')
      .eq('class_id', classId)
      .order('position', { ascending: true, nullsFirst: true })
      .order('created_at'),
    supabaseAdmin
      .from('users')
      .select('id, display_name, full_name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('display_name'),
  ]);

  type AttRow = {
    user_id: string;
    method: string;
    checked_in_at: string;
    users: { display_name: string | null; full_name: string | null } | null;
  };
  type ResvRow = {
    user_id: string;
    status: string;
    position: number | null;
    created_at: string;
    users: { display_name: string | null; full_name: string | null } | null;
  };
  type UserRow = {
    id: string;
    display_name: string | null;
    full_name: string | null;
  };
  const atts = ((attRaw as unknown) as AttRow[] | null) ?? [];
  const resvs = ((resvRaw as unknown) as ResvRow[] | null) ?? [];
  const allUsers = ((usersRaw as unknown) as UserRow[] | null) ?? [];

  const signedIds = new Set(atts.map((a) => a.user_id));
  const unsigned = allUsers.filter((u) => !signedIds.has(u.id));

  const confirmedResvs = resvs.filter((r) => r.status === 'confirmed');
  const waitlistResvs = resvs.filter((r) => r.status === 'waitlist');
  const cancelledResvs = resvs.filter((r) => r.status === 'cancelled' || r.status === 'no_show');

  const hidden = (userId: string) => (
    <>
      <input type="hidden" name="tenant_slug" value={slug} />
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="user_id" value={userId} />
    </>
  );
  const nameOf = (u: { full_name: string | null; display_name: string | null } | null) => u?.full_name ?? u?.display_name ?? '(沒有名稱)';

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 860 }}>
        <Link href={`/admin/${slug}/attendances`} className="at-back">
          <IconChevronLeft size={14} /> 出席
        </Link>
        <header className="at-head">
          <h1>
            {c.name}
            {c.status === 'cancelled' && <span className="ui-badge at-cancel">已取消</span>}
          </h1>
          <p>
            {formatDateTime(c.scheduled_at)} · {c.regions?.name ?? '—'} · {c.instructor ?? '—'} · 名額 {c.capacity ?? '不限'}
          </p>
        </header>

        <div className="at-card">
          <h2>
            已報名
            <span className="n">{confirmedResvs.length}{c.capacity ? ` / ${c.capacity}` : ''}</span>
          </h2>
          {confirmedResvs.length === 0 ? (
            <div className="at-empty">還沒有人報名。</div>
          ) : (
            confirmedResvs.map((r) => (
              <div key={r.user_id} className="at-li">
                <div className="main" style={{ fontWeight: 500 }}>{nameOf(r.users)}</div>
                <form action={markNoShow}>
                  {hidden(r.user_id)}
                  <button type="submit" className="ui-btn ui-btn-outline ui-btn-xs" title="標記為沒到">沒到</button>
                </form>
                <form action={cancelReservationAdmin}>
                  {hidden(r.user_id)}
                  <button type="submit" className="ui-btn ui-btn-ghost ui-btn-xs" title="取消這筆報名,候補第 1 名會自動補上">取消</button>
                </form>
              </div>
            ))
          )}
        </div>

        {waitlistResvs.length > 0 && (
          <div className="at-card">
            <h2>
              候補
              <span className="n">{waitlistResvs.length}</span>
            </h2>
            {waitlistResvs.map((r) => (
              <div key={r.user_id} className="at-li">
                <div className="main" style={{ fontWeight: 500 }}>
                  <span className="at-pos">#{r.position}</span>
                  {nameOf(r.users)}
                </div>
                <form action={promoteWaitlist}>
                  {hidden(r.user_id)}
                  <button type="submit" className="ui-btn ui-btn-primary ui-btn-xs" title="改成已報名">補上</button>
                </form>
                <form action={cancelReservationAdmin}>
                  {hidden(r.user_id)}
                  <button type="submit" className="ui-btn ui-btn-ghost ui-btn-xs" title="取消候補">取消</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {cancelledResvs.length > 0 && (
          <div className="at-card dim">
            <h2>
              已取消、沒到
              <span className="n">{cancelledResvs.length}</span>
            </h2>
            {cancelledResvs.map((r) => (
              <div key={r.user_id} className="at-li">
                <div className="main">
                  {nameOf(r.users)}
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#a1a1aa' }}>{r.status === 'no_show' ? '沒到' : '已取消'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="at-card">
          <h2>
            已簽到
            <span className="n">{atts.length}{c.capacity ? ` / ${c.capacity}` : ''}</span>
          </h2>
          {atts.length === 0 ? (
            <div className="at-empty">還沒有人簽到。</div>
          ) : (
            atts.map((a) => (
              <div key={a.user_id} className="at-li">
                <div className="main">
                  <div style={{ fontWeight: 500 }}>{nameOf(a.users)}</div>
                  <div className="sub">
                    {formatTime(a.checked_in_at)}
                    <span className="ui-badge" style={{ fontSize: 11, padding: '0 7px' }}>{methodLabel(a.method)}</span>
                  </div>
                </div>
                <form action={unmarkAttendance}>
                  {hidden(a.user_id)}
                  <button type="submit" className="ui-btn ui-btn-ghost ui-btn-xs" title="取消這個簽到">取消</button>
                </form>
              </div>
            ))
          )}
        </div>

        <div className="at-card">
          <h2>
            未簽到
            <span className="n">{unsigned.length}</span>
          </h2>
          {unsigned.length === 0 ? (
            <div className="at-empty">全部簽完了。</div>
          ) : (
            unsigned.map((u) => (
              <div key={u.id} className="at-li">
                <div className="main">
                  {u.full_name ?? u.display_name ?? '(沒有名稱)'}
                  {!u.full_name && u.display_name && <span style={{ fontSize: 12, color: '#a1a1aa', marginLeft: 6 }}>LINE 名稱</span>}
                </div>
                <form action={markAttendance}>
                  {hidden(u.id)}
                  <button type="submit" className="ui-btn ui-btn-primary ui-btn-xs">手動簽到</button>
                </form>
              </div>
            ))
          )}
        </div>

        <p style={{ fontSize: 12, color: '#a1a1aa', margin: '8px 0 0', lineHeight: 1.6 }}>
          客人加了 LINE 好友才會出現在「未簽到」名單;封鎖或退出的不會列。
        </p>
      </div>
    </main>
  );
}

// ====================
// Entry
// ====================
export default async function AttendancesPage({ params, searchParams }: Props) {
  const { tenant: slug } = await params;
  const { class_id } = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  if (class_id) {
    return <DetailView tenantId={tenant.id} slug={tenant.slug} classId={class_id} />;
  }
  return <ListView tenantId={tenant.id} slug={tenant.slug} />;
}
