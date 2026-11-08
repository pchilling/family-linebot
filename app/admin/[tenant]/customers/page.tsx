import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { IconSearch } from '@/lib/icons';

/**
 * 客戶列表(2026-11-01 換成後台新設計系統:篩選列常駐、卡片式清單取代 <table>)。
 * 查詢與排序邏輯不變。
 *
 * Phase 35(2026-11-07):多一欄「追蹤」(追蹤中 / LINE 好友 / 訪客,可篩)。
 * 資料來源三份合併:users(LINE 好友,照舊)+ tenant_followers(追蹤這家店的人)+ 網站訂單的 platform_user_id。
 * 平台使用者的 line_user_id 對得到同攤位 users 列就併進該列,對不到就另成一列(沒有連結、電話地址 —)。
 */

type UserRow = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  birthday: string | null;
  status: string;
  added_at: string;
};

type PlatformUserLite = { id: string; display_name: string | null; email: string | null; line_user_id: string | null };

type Filters = {
  q?: string;
  status?: string;
  has_orders?: string; // 'yes' | 'no'
  sort?: string; // 'spent' | 'orders' | 'added' (default 'added')
  follow?: string; // Phase 35:'following' | 'line' | 'guest'
};

type FollowKind = 'following' | 'line' | 'guest';

/** 合併後的一列 */
type CustomerRow = {
  key: string;
  userId: string | null; // users.id;有才給連結
  platformUserId: string | null;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  birthday: string | null;
  status: string | null; // users.status;純平台使用者 null
  added_at: string | null;
  follow: FollowKind;
};

async function getCustomers(tenantId: string, f: Filters): Promise<UserRow[]> {
  let query = supabaseAdmin
    .from('users')
    .select(
      'id, line_user_id, display_name, full_name, phone, address, birthday, status, added_at',
    )
    .eq('tenant_id', tenantId);

  if (f.status) query = query.eq('status', f.status);
  if (f.q) {
    const q = f.q.replace(/[%,]/g, '');
    query = query.or(
      `display_name.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  query = query.order('added_at', { ascending: false }).limit(300);
  const { data } = await query;
  return (data ?? []) as UserRow[];
}

/** Phase 35:追蹤這家店的人(tenant_followers join platform_users) */
async function getFollowers(tenantId: string): Promise<{ created_at: string; user: PlatformUserLite }[]> {
  const { data } = await supabaseAdmin
    .from('tenant_followers')
    .select('created_at, platform_users(id, display_name, email, line_user_id)')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved') // Phase 37:等核准的不算追蹤中(在團購頁核准)
    .order('created_at', { ascending: false })
    .limit(500);
  type Row = { created_at: string; platform_users: PlatformUserLite | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !!r.platform_users)
    .map((r) => ({ created_at: r.created_at, user: r.platform_users as PlatformUserLite }));
}

/** Phase 35:網站下過單的平台使用者(orders.platform_user_id distinct) */
async function getOrderPlatformUsers(tenantId: string): Promise<Map<string, PlatformUserLite>> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('platform_user_id, platform_users(id, display_name, email, line_user_id)')
    .eq('tenant_id', tenantId)
    .not('platform_user_id', 'is', null)
    .limit(1000);
  type Row = { platform_user_id: string; platform_users: PlatformUserLite | null };
  const map = new Map<string, PlatformUserLite>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (r.platform_users && !map.has(r.platform_user_id)) map.set(r.platform_user_id, r.platform_users);
  }
  return map;
}

type StatsRow = { order_count: number; total_spent: number };
/**
 * 訂單統計:LINE 單(user_id)與網站單(platform_user_id,且沒有 user_id,避免同一張單算兩次)分開存,
 * 合併列時兩邊相加。
 */
async function getCustomerStats(tenantId: string): Promise<{ byUser: Map<string, StatsRow>; byPlatform: Map<string, StatsRow> }> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('user_id, platform_user_id, total_twd, discount_twd, status')
    .eq('tenant_id', tenantId)
    .or('user_id.not.is.null,platform_user_id.not.is.null');
  const byUser = new Map<string, StatsRow>();
  const byPlatform = new Map<string, StatsRow>();
  const add = (map: Map<string, StatsRow>, key: string, net: number) => {
    const existing = map.get(key);
    if (existing) {
      existing.order_count += 1;
      existing.total_spent += net;
    } else {
      map.set(key, { order_count: 1, total_spent: net });
    }
  };
  for (const o of (data ?? []) as Array<{ user_id: string | null; platform_user_id: string | null; total_twd: number; discount_twd: number | null; status: string }>) {
    if (o.status === 'cancelled' || o.status === 'refunded') continue;
    // Phase 33:消費金額 = 商品小計 − 折扣碼(不含運費)
    const net = o.total_twd - (o.discount_twd ?? 0);
    if (o.user_id) add(byUser, o.user_id, net);
    else if (o.platform_user_id) add(byPlatform, o.platform_user_id, net);
  }
  return { byUser, byPlatform };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '活躍', cls: 'cs-active' },
  blocked: { label: '封鎖', cls: 'cs-blocked' },
  left: { label: '已退出', cls: 'cs-left' },
};

const FOLLOW: Record<FollowKind, { label: string; cls: string }> = {
  following: { label: '追蹤中', cls: 'cs-following' },
  line: { label: 'LINE 好友', cls: 'cs-line' },
  guest: { label: '訪客', cls: 'cs-guest' },
};

function formatTw(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

const CSS = `
.cs-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.cs-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.cs-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.cs-filter{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:14px}
.cs-filter .q{flex:1 1 220px;min-width:160px;position:relative}
.cs-filter .q svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#a1a1aa;pointer-events:none}
.cs-filter .q input{padding-left:32px}
.cs-filter select.ui-input{width:auto}
.cs-list{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.cs-row{display:grid;grid-template-columns:1.3fr 120px 1.4fr 96px 64px 110px 84px 90px 96px;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.cs-row:first-child{border-top:0}
.cs-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px}
.cs-row .r{text-align:right;font-variant-numeric:tabular-nums}
.cs-row .muted{color:#71717a;font-size:13px}
.cs-row .trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-name{font-weight:600;color:#18181b;text-decoration:none}
a.cs-name:hover{text-decoration:underline}
.cs-sub{font-size:12px;color:#71717a;margin-top:2px}
.cs-active{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.cs-blocked{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.cs-left{background:#f4f4f5;color:#71717a;border-color:transparent}
.cs-following{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.cs-line{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.cs-guest{background:#f4f4f5;color:#71717a;border-color:transparent}
.cs-empty{padding:48px 16px;text-align:center;color:#71717a;font-size:14px;line-height:1.6}
@media (max-width:767px){
  .cs-head{align-items:flex-start;flex-direction:column}
  .cs-filter select.ui-input{width:100%;flex:1 1 45%}
  .cs-list{border-radius:10px}
  .cs-row{grid-template-columns:1fr auto;grid-template-areas:"name st" "name follow" "phone phone" "addr addr" "stats stats";gap:4px 12px;padding:12px 14px}
  .cs-row.head{display:none}
  .c-name{grid-area:name}.c-st{grid-area:st}.c-follow{grid-area:follow}.c-phone{grid-area:phone}.c-addr{grid-area:addr}
  .c-bday,.c-added{display:none}
  .c-orders{grid-area:stats;text-align:left}.c-spent{display:none}
  .cs-row .trunc{white-space:normal}
}
`;

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Filters>;
}) {
  const { tenant: slug } = await params;
  const filters = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const [allCustomers, stats, followers, orderPlatformUsers] = await Promise.all([
    getCustomers(tenant.id, filters),
    getCustomerStats(tenant.id),
    getFollowers(tenant.id),
    getOrderPlatformUsers(tenant.id),
  ]);

  // ---- Phase 35:三份資料合併成一份列 ----
  const followedIds = new Set(followers.map((f) => f.user.id));
  const followedAt = new Map(followers.map((f) => [f.user.id, f.created_at]));
  // 平台使用者全集:追蹤者 + 網站下過單的人
  const platformUsers = new Map<string, PlatformUserLite>();
  for (const f of followers) platformUsers.set(f.user.id, f.user);
  for (const [id, u] of orderPlatformUsers) if (!platformUsers.has(id)) platformUsers.set(id, u);

  const usersByLine = new Map(allCustomers.map((u) => [u.line_user_id, u]));
  const platformByUserId = new Map<string, PlatformUserLite>(); // users.id → 併進去的平台使用者
  const standalone: PlatformUserLite[] = [];
  for (const pu of platformUsers.values()) {
    const u = pu.line_user_id ? usersByLine.get(pu.line_user_id) : undefined;
    if (u) {
      if (!platformByUserId.has(u.id)) platformByUserId.set(u.id, pu);
    } else {
      standalone.push(pu);
    }
  }

  const followKind = (platformUserId: string | null, lineStatus: string | null): FollowKind => {
    if (platformUserId && followedIds.has(platformUserId)) return 'following';
    if (lineStatus === 'active') return 'line';
    return 'guest';
  };

  let rows: CustomerRow[] = allCustomers.map((u) => {
    const pu = platformByUserId.get(u.id) ?? null;
    return {
      key: `u:${u.id}`,
      userId: u.id,
      platformUserId: pu?.id ?? null,
      display_name: u.display_name,
      full_name: u.full_name,
      phone: u.phone,
      address: u.address,
      birthday: u.birthday,
      status: u.status,
      added_at: u.added_at,
      follow: followKind(pu?.id ?? null, u.status),
    };
  });
  // 對不到 LINE 好友的平台使用者另成一列;狀態 / 搜尋篩選套在這裡(users 那份已在 SQL 篩過)
  const needle = (filters.q ?? '').trim().toLowerCase();
  const standaloneRows: CustomerRow[] = standalone
    .filter(() => !filters.status) // 有篩 LINE 狀態時,沒 LINE 身分的人不列
    .filter((pu) => !needle || (pu.display_name ?? '').toLowerCase().includes(needle) || (pu.email ?? '').toLowerCase().includes(needle))
    .map((pu) => ({
      key: `p:${pu.id}`,
      userId: null,
      platformUserId: pu.id,
      display_name: pu.display_name ?? pu.email,
      full_name: pu.display_name && pu.email ? pu.email : null,
      phone: null,
      address: null,
      birthday: null,
      status: null,
      added_at: followedAt.get(pu.id) ?? null,
      follow: followKind(pu.id, null),
    }))
    .sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? ''));
  rows = [...rows, ...standaloneRows];

  const statsOf = (c: CustomerRow): StatsRow | undefined => {
    const a = c.userId ? stats.byUser.get(c.userId) : undefined;
    const b = c.platformUserId ? stats.byPlatform.get(c.platformUserId) : undefined;
    if (!a && !b) return undefined;
    return { order_count: (a?.order_count ?? 0) + (b?.order_count ?? 0), total_spent: (a?.total_spent ?? 0) + (b?.total_spent ?? 0) };
  };

  // 後端再篩 has_orders / follow / 排序(這些用 supabase 查詢成本高,小規模 in-memory 比較簡單)
  let customers = rows;
  if (filters.has_orders === 'yes') {
    customers = customers.filter((c) => (statsOf(c)?.order_count ?? 0) > 0);
  } else if (filters.has_orders === 'no') {
    customers = customers.filter((c) => !statsOf(c));
  }
  if (filters.follow === 'following' || filters.follow === 'line' || filters.follow === 'guest') {
    customers = customers.filter((c) => c.follow === filters.follow);
  }

  if (filters.sort === 'spent') {
    customers = [...customers].sort(
      (a, b) => (statsOf(b)?.total_spent ?? 0) - (statsOf(a)?.total_spent ?? 0),
    );
  } else if (filters.sort === 'orders') {
    customers = [...customers].sort(
      (a, b) => (statsOf(b)?.order_count ?? 0) - (statsOf(a)?.order_count ?? 0),
    );
  }
  // 預設按 added_at 降序(users 已在 SQL order by 排過,平台使用者接在後面)

  const hasAnyFilter = !!(filters.q || filters.status || filters.has_orders || filters.sort || filters.follow);

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        <header className="cs-head">
          <div>
            <h1>客戶</h1>
            <p>
              {hasAnyFilter ? '符合條件 ' : ''}
              {customers.length}
              {allCustomers.length >= 300 ? '+ 位,只顯示最近 300 位' : ' 位'}
              {!hasAnyFilter && ' · 加 LINE 好友或進會員專區就會自動建檔,追蹤這家店的人也會出現'}
            </p>
          </div>
        </header>

        <form method="GET" action={`/admin/${tenant.slug}/customers`} className="cs-filter">
          <label className="q">
            <IconSearch size={15} />
            <input
              name="q"
              className="ui-input ui-input-sm"
              defaultValue={filters.q ?? ''}
              placeholder="搜尋 LINE 名稱、姓名、電話"
              aria-label="搜尋"
            />
          </label>
          <select name="status" className="ui-input ui-input-sm" defaultValue={filters.status ?? ''} aria-label="狀態">
            <option value="">所有狀態</option>
            <option value="active">活躍</option>
            <option value="blocked">封鎖</option>
            <option value="left">已退出</option>
          </select>
          {/* Phase 35:追蹤篩選 */}
          <select name="follow" className="ui-input ui-input-sm" defaultValue={filters.follow ?? ''} aria-label="追蹤">
            <option value="">不限追蹤</option>
            <option value="following">追蹤中</option>
            <option value="line">LINE 好友</option>
            <option value="guest">訪客</option>
          </select>
          <select name="has_orders" className="ui-input ui-input-sm" defaultValue={filters.has_orders ?? ''} aria-label="有沒有訂單">
            <option value="">不限訂單</option>
            <option value="yes">有訂單</option>
            <option value="no">沒訂單</option>
          </select>
          <select name="sort" className="ui-input ui-input-sm" defaultValue={filters.sort ?? ''} aria-label="排序">
            <option value="">最近加入</option>
            <option value="spent">消費最多</option>
            <option value="orders">訂單最多</option>
          </select>
          <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">查詢</button>
          {hasAnyFilter && (
            <Link href={`/admin/${tenant.slug}/customers`} className="ui-btn ui-btn-ghost ui-btn-sm">
              清除
            </Link>
          )}
        </form>

        <div className="cs-list">
          {customers.length === 0 ? (
            <div className="cs-empty">
              {hasAnyFilter ? '沒有符合條件的客戶。' : '還沒有客戶。客人加 LINE 好友、進會員專區或追蹤這家店後會自動建檔。'}
            </div>
          ) : (
            <>
              <div className="cs-row head" aria-hidden>
                <span>客戶</span>
                <span>電話</span>
                <span>地址</span>
                <span>生日</span>
                <span className="r">訂單</span>
                <span className="r">累積消費</span>
                <span>狀態</span>
                <span>追蹤</span>
                <span>加入</span>
              </div>
              {customers.map((c) => {
                const s = statsOf(c);
                const st = c.status ? (STATUS[c.status] ?? { label: c.status, cls: 'cs-left' }) : null;
                const fo = FOLLOW[c.follow];
                return (
                  <div key={c.key} className="cs-row">
                    <div className="c-name" style={{ minWidth: 0 }}>
                      {c.userId ? (
                        <Link href={`/admin/${tenant.slug}/customers/${c.userId}`} className="cs-name">
                          {c.display_name ?? '(沒有名稱)'}
                        </Link>
                      ) : (
                        <span className="cs-name">{c.display_name ?? '(沒有名稱)'}</span>
                      )}
                      {c.full_name && <div className="cs-sub">{c.full_name}</div>}
                    </div>
                    <div className="c-phone muted">{c.phone ?? '—'}</div>
                    <div className="c-addr muted trunc" title={c.address ?? undefined}>{c.address ?? '—'}</div>
                    <div className="c-bday muted">{c.birthday ?? '—'}</div>
                    <div className="c-orders r">
                      {s?.order_count ?? 0}
                      <span className="ui-only-mobile muted"> 筆訂單{s?.total_spent ? ` · NT$ ${s.total_spent.toLocaleString()}` : ''}</span>
                    </div>
                    <div className="c-spent r" style={{ fontWeight: s?.total_spent ? 600 : 400 }}>
                      {s?.total_spent ? `NT$ ${s.total_spent.toLocaleString()}` : '—'}
                    </div>
                    <div className="c-st">
                      {st ? <span className={`ui-badge ${st.cls}`}>{st.label}</span> : <span className="muted">—</span>}
                    </div>
                    <div className="c-follow">
                      <span className={`ui-badge ${fo.cls}`}>{fo.label}</span>
                    </div>
                    <div className="c-added muted">{c.added_at ? formatTw(c.added_at) : '—'}</div>
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
