import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { IconChevronLeft } from '@/lib/icons';

/**
 * 客戶明細(2026-11-01 換成後台新設計系統)。資料查詢不變。
 */

type Props = {
  params: Promise<{ tenant: string; id: string }>;
};

function formatTw(iso: string): string {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '活躍', cls: 'cd-active' },
  blocked: { label: '封鎖', cls: 'cd-blocked' },
  left: { label: '已退出', cls: 'cd-left' },
};
const ORDER_STATUS: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};
const SOURCE_LABEL: Record<string, string> = { web: '網站', liff: 'LINE', manual: '手動', line_chat: 'LINE 對話' };
const METHOD_LABEL: Record<string, string> = { liff: 'LINE 報名頁', qr: '掃 QR', manual: '老師', admin: '後台' };
const RESV: Record<string, { label: string; color: string }> = {
  confirmed: { label: '已報名', color: '#15803d' },
  waitlist: { label: '候補', color: '#a16207' },
  cancelled: { label: '已取消', color: '#71717a' },
  no_show: { label: '沒到', color: '#b91c1c' },
};

const CSS = `
.cd-back{display:inline-flex;align-items:center;gap:2px;font-size:13px;color:#71717a;text-decoration:none;margin-bottom:10px}
.cd-back:hover{color:#18181b}
.cd-head{margin-bottom:16px}
.cd-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cd-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.cd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.cd-stat{padding:14px 16px;background:#fff;border:1px solid #e4e4e7;border-radius:12px}
.cd-stat .l{font-size:12px;color:#71717a;margin-bottom:4px}
.cd-stat .v{font-size:22px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.cd-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:16px;overflow:hidden}
.cd-card h2{margin:0;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;gap:8px}
.cd-card h2 .n{font-weight:400;color:#71717a;font-size:13px}
.cd-kv{display:grid;grid-template-columns:110px 1fr;gap:10px 14px;font-size:13.5px;margin:0;padding:16px}
.cd-kv dt{color:#71717a;margin:0}.cd-kv dd{margin:0;min-width:0;word-break:break-all}
.cd-code{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;padding:1px 8px;background:#f4f4f5;border-radius:4px;font-size:13px;user-select:all}
.cd-hint{font-size:12px;color:#71717a;margin-left:8px}
.cd-row{display:grid;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.cd-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px;border-top:0}
.cd-row .r{text-align:right;font-variant-numeric:tabular-nums}
.cd-row .muted{color:#71717a;font-size:13px}
.cd-orders{grid-template-columns:170px 90px 100px 110px 1fr}
.cd-atts{grid-template-columns:1.4fr 160px 120px}
.cd-resvs{grid-template-columns:1.4fr 100px 150px 150px}
.cd-link{font-weight:600;color:#18181b;text-decoration:none}
.cd-link:hover{text-decoration:underline}
.cd-no{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:13px}
.cd-empty{padding:24px 16px;text-align:center;color:#71717a;font-size:13.5px}
.cd-active{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.cd-blocked{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.cd-left{background:#f4f4f5;color:#71717a;border-color:transparent}
@media (max-width:767px){
  .cd-stats{grid-template-columns:1fr 1fr}
  .cd-card{border-radius:10px}
  .cd-kv{grid-template-columns:90px 1fr;padding:14px}
  .cd-row{grid-template-columns:1fr auto;gap:4px 12px;padding:12px 14px}
  .cd-row.head{display:none}
  .cd-row > .wide{grid-column:1/-1}
}
`;

export default async function CustomerDetailPage({ params }: Props) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // 平行撈:user / orders / attendances / reservations
  const [
    { data: userRaw },
    { data: ordersRaw },
    { data: attsRaw },
    { data: resvsRaw },
  ] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select(
        'id, line_user_id, display_name, full_name, phone, address, birthday, member_id, referrer_member_id, status, added_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('orders')
      .select('id, order_no, status, payment_status, total_twd, discount_twd, source, created_at')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('attendances')
      .select('id, method, checked_in_at, classes(name, scheduled_at)')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('checked_in_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('reservations')
      .select('id, status, position, created_at, classes(name, scheduled_at)')
      .eq('tenant_id', tenant.id)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  type UserRow = {
    id: string;
    line_user_id: string;
    display_name: string | null;
    full_name: string | null;
    phone: string | null;
    address: string | null;
    birthday: string | null;
    member_id: string | null;
    referrer_member_id: string | null;
    status: string;
    added_at: string;
  };
  const user = (userRaw ?? null) as UserRow | null;
  if (!user) {
    return (
      <main style={{ padding: '28px 32px 48px' }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <Link href={`/admin/${slug}/customers`} className="cd-back">
          <IconChevronLeft size={14} /> 客戶
        </Link>
        <p style={{ marginTop: 12, color: '#b91c1c' }}>找不到這位客戶。</p>
      </main>
    );
  }

  type OrderRow = {
    id: string;
    order_no: string;
    status: string;
    payment_status: string;
    total_twd: number;
    discount_twd: number | null; // Phase 33
    source: string;
    created_at: string;
  };
  type AttRow = {
    id: string;
    method: string;
    checked_in_at: string;
    classes: { name: string; scheduled_at: string } | null;
  };
  type ResvRow = {
    id: string;
    status: string;
    position: number | null;
    created_at: string;
    classes: { name: string; scheduled_at: string } | null;
  };
  const orders = ((ordersRaw as unknown) as OrderRow[] | null) ?? [];
  const atts = ((attsRaw as unknown) as AttRow[] | null) ?? [];
  const resvs = ((resvsRaw as unknown) as ResvRow[] | null) ?? [];

  // 找「我介紹進來的人」(referrer_member_id = 我的 member_id)
  type RefereeRow = { id: string; display_name: string | null; full_name: string | null; member_id: string | null };
  let referrals: RefereeRow[] = [];
  if (user.member_id) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, display_name, full_name, member_id')
      .eq('tenant_id', tenant.id)
      .eq('referrer_member_id', user.member_id);
    referrals = (data as RefereeRow[] | null) ?? [];
  }

  // 找「我的介紹人」(如果填的 referrer_member_id 在系統內有對應的 user)
  let referrer: RefereeRow | null = null;
  if (user.referrer_member_id) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, display_name, full_name, member_id')
      .eq('tenant_id', tenant.id)
      .eq('member_id', user.referrer_member_id)
      .maybeSingle();
    referrer = (data as RefereeRow | null) ?? null;
  }

  // 統計(排除 cancelled/refunded 訂單)
  const activeOrders = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
  // Phase 33:消費金額 = 商品小計 − 折扣碼(不含運費)
  const netOf = (o: { total_twd: number; discount_twd: number | null }) => o.total_twd - (o.discount_twd ?? 0);
  const totalSpent = activeOrders.reduce((s, o) => s + netOf(o), 0);
  const activeAttCount = atts.length;
  const activeResvCount = resvs.filter((r) => r.status === 'confirmed' || r.status === 'waitlist').length;

  const displayName = user.full_name ?? user.display_name ?? '(沒有名稱)';
  const st = STATUS[user.status] ?? { label: user.status, cls: 'cd-left' };
  const nameOf = (r: RefereeRow) => r.full_name ?? r.display_name ?? '(沒有名稱)';

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        <Link href={`/admin/${slug}/customers`} className="cd-back">
          <IconChevronLeft size={14} /> 客戶
        </Link>
        <header className="cd-head">
          <h1>
            {displayName}
            <span className={`ui-badge ${st.cls}`}>{st.label}</span>
          </h1>
          <p>加入 {formatDate(user.added_at)}</p>
        </header>

        <div className="cd-stats">
          {[
            { label: '累積消費', value: `NT$ ${totalSpent.toLocaleString()}` },
            { label: '訂單', value: `${activeOrders.length}` },
            { label: '簽到次數', value: `${activeAttCount}` },
            { label: '未來報名', value: `${activeResvCount}` },
          ].map((s) => (
            <div key={s.label} className="cd-stat">
              <div className="l">{s.label}</div>
              <div className="v">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="cd-card">
          <h2>個人資料</h2>
          <dl className="cd-kv">
            <dt>LINE 名稱</dt>
            <dd>
              <span className="cd-code">{user.display_name ?? '—'}</span>
              <span className="cd-hint">到 LINE 官方帳號用這個名字找對話</span>
            </dd>
            <dt>填寫姓名</dt>
            <dd>{user.full_name ?? '—'}</dd>
            <dt>電話</dt>
            <dd>{user.phone ?? '—'}</dd>
            <dt>地址</dt>
            <dd>{user.address ?? '—'}</dd>
            <dt>生日</dt>
            <dd>{user.birthday ?? '—'}</dd>
            <dt>會員編號</dt>
            <dd>{user.member_id ? <span className="cd-code">{user.member_id}</span> : <span style={{ color: '#a1a1aa' }}>還沒填</span>}</dd>
            <dt>介紹人編號</dt>
            <dd>
              {user.referrer_member_id ? (
                <>
                  <span className="cd-code">{user.referrer_member_id}</span>
                  {referrer ? (
                    <Link href={`/admin/${slug}/customers/${referrer.id}`} className="cd-link" style={{ marginLeft: 8, fontSize: 13 }}>
                      {nameOf(referrer)}
                    </Link>
                  ) : (
                    <span className="cd-hint">這個編號還沒有對應的客戶,可能還沒辦會員</span>
                  )}
                </>
              ) : (
                <span style={{ color: '#a1a1aa' }}>—</span>
              )}
            </dd>
            <dt>LINE userId</dt>
            <dd style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 12, color: '#a1a1aa' }}>{user.line_user_id}</dd>
          </dl>
        </div>

        {referrals.length > 0 && (
          <div className="cd-card">
            <h2>
              介紹進來的人
              <span className="n">{referrals.length} 位</span>
            </h2>
            {referrals.map((r) => (
              <div key={r.id} className="cd-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <Link href={`/admin/${slug}/customers/${r.id}`} className="cd-link">{nameOf(r)}</Link>
                {r.member_id && <span className="cd-code" style={{ fontSize: 12 }}>{r.member_id}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="cd-card">
          <h2>
            訂單
            <span className="n">{orders.length} 筆</span>
          </h2>
          {orders.length === 0 ? (
            <div className="cd-empty">還沒有訂單。</div>
          ) : (
            <>
              <div className="cd-row cd-orders head" aria-hidden>
                <span>訂單編號</span>
                <span>來源</span>
                <span>狀態</span>
                <span className="r">金額</span>
                <span>時間</span>
              </div>
              {orders.map((o) => (
                <div key={o.id} className="cd-row cd-orders">
                  <div>
                    <Link href={`/admin/${slug}/orders/${o.id}`} className="cd-link cd-no">{o.order_no}</Link>
                  </div>
                  <div className="muted">{SOURCE_LABEL[o.source] ?? o.source}</div>
                  <div>
                    <span className={`ui-badge ob-${o.status}`}>{ORDER_STATUS[o.status] ?? o.status}</span>
                  </div>
                  <div className="r" style={{ fontWeight: 600 }}>NT$ {netOf(o).toLocaleString()}</div>
                  <div className="muted wide">{formatTw(o.created_at)}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="cd-card">
          <h2>
            簽到
            <span className="n">{atts.length} 次</span>
          </h2>
          {atts.length === 0 ? (
            <div className="cd-empty">還沒有簽到紀錄。</div>
          ) : (
            <>
              <div className="cd-row cd-atts head" aria-hidden>
                <span>課程</span>
                <span>簽到時間</span>
                <span>方式</span>
              </div>
              {atts.map((a) => (
                <div key={a.id} className="cd-row cd-atts">
                  <div style={{ fontWeight: 500 }}>{a.classes?.name ?? '(已刪除的課程)'}</div>
                  <div className="muted">{formatTw(a.checked_in_at)}</div>
                  <div className="muted">{METHOD_LABEL[a.method] ?? a.method}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="cd-card">
          <h2>
            報名
            <span className="n">{resvs.length} 筆</span>
          </h2>
          {resvs.length === 0 ? (
            <div className="cd-empty">還沒有報名紀錄。</div>
          ) : (
            <>
              <div className="cd-row cd-resvs head" aria-hidden>
                <span>活動</span>
                <span>狀態</span>
                <span>活動時間</span>
                <span>報名時間</span>
              </div>
              {resvs.map((r) => {
                const rs = RESV[r.status] ?? { label: r.status, color: '#52525b' };
                return (
                  <div key={r.id} className="cd-row cd-resvs">
                    <div style={{ fontWeight: 500 }}>{r.classes?.name ?? '(已刪除的活動)'}</div>
                    <div style={{ color: rs.color, fontWeight: 600, fontSize: 13 }}>
                      {rs.label}
                      {r.status === 'waitlist' && r.position !== null && ` #${r.position}`}
                    </div>
                    <div className="muted wide">{r.classes?.scheduled_at ? formatTw(r.classes.scheduled_at) : '—'}</div>
                    <div className="muted wide">報名於 {formatTw(r.created_at)}</div>
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
