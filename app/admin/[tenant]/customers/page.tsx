import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { IconSearch } from '@/lib/icons';

/**
 * 客戶列表(2026-11-01 換成後台新設計系統:篩選列常駐、卡片式清單取代 <table>)。
 * 查詢與排序邏輯不變。
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

type Filters = {
  q?: string;
  status?: string;
  has_orders?: string; // 'yes' | 'no'
  sort?: string; // 'spent' | 'orders' | 'added' (default 'added')
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

type StatsRow = { user_id: string; order_count: number; total_spent: number };
async function getCustomerStats(tenantId: string): Promise<Map<string, StatsRow>> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('user_id, total_twd, status')
    .eq('tenant_id', tenantId)
    .not('user_id', 'is', null);
  const map = new Map<string, StatsRow>();
  for (const o of (data ?? []) as Array<{ user_id: string; total_twd: number; status: string }>) {
    if (o.status === 'cancelled' || o.status === 'refunded') continue;
    const existing = map.get(o.user_id);
    if (existing) {
      existing.order_count += 1;
      existing.total_spent += o.total_twd;
    } else {
      map.set(o.user_id, { user_id: o.user_id, order_count: 1, total_spent: o.total_twd });
    }
  }
  return map;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '活躍', cls: 'cs-active' },
  blocked: { label: '封鎖', cls: 'cs-blocked' },
  left: { label: '已退出', cls: 'cs-left' },
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
.cs-row{display:grid;grid-template-columns:1.3fr 120px 1.4fr 96px 64px 110px 84px 96px;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.cs-row:first-child{border-top:0}
.cs-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px}
.cs-row .r{text-align:right;font-variant-numeric:tabular-nums}
.cs-row .muted{color:#71717a;font-size:13px}
.cs-row .trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cs-name{font-weight:600;color:#18181b;text-decoration:none}
.cs-name:hover{text-decoration:underline}
.cs-sub{font-size:12px;color:#71717a;margin-top:2px}
.cs-active{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.cs-blocked{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.cs-left{background:#f4f4f5;color:#71717a;border-color:transparent}
.cs-empty{padding:48px 16px;text-align:center;color:#71717a;font-size:14px;line-height:1.6}
@media (max-width:767px){
  .cs-head{align-items:flex-start;flex-direction:column}
  .cs-filter select.ui-input{width:100%;flex:1 1 45%}
  .cs-list{border-radius:10px}
  .cs-row{grid-template-columns:1fr auto;grid-template-areas:"name st" "phone phone" "addr addr" "stats stats";gap:4px 12px;padding:12px 14px}
  .cs-row.head{display:none}
  .c-name{grid-area:name}.c-st{grid-area:st}.c-phone{grid-area:phone}.c-addr{grid-area:addr}
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

  const [allCustomers, statsMap] = await Promise.all([
    getCustomers(tenant.id, filters),
    getCustomerStats(tenant.id),
  ]);

  // 後端再篩 has_orders / 排序(這些用 supabase 查詢成本高,小規模 in-memory 比較簡單)
  let customers = allCustomers;
  if (filters.has_orders === 'yes') {
    customers = customers.filter((c) => (statsMap.get(c.id)?.order_count ?? 0) > 0);
  } else if (filters.has_orders === 'no') {
    customers = customers.filter((c) => !statsMap.has(c.id));
  }

  if (filters.sort === 'spent') {
    customers = [...customers].sort(
      (a, b) => (statsMap.get(b.id)?.total_spent ?? 0) - (statsMap.get(a.id)?.total_spent ?? 0),
    );
  } else if (filters.sort === 'orders') {
    customers = [...customers].sort(
      (a, b) => (statsMap.get(b.id)?.order_count ?? 0) - (statsMap.get(a.id)?.order_count ?? 0),
    );
  }
  // 預設按 added_at 降序(已在 SQL order by 排過)

  const hasAnyFilter = !!(filters.q || filters.status || filters.has_orders || filters.sort);

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
              {!hasAnyFilter && ' · 加 LINE 好友或進會員專區就會自動建檔'}
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
              {hasAnyFilter ? '沒有符合條件的客戶。' : '還沒有客戶。客人加 LINE 好友或進會員專區後會自動建檔。'}
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
                <span>加入</span>
              </div>
              {customers.map((c) => {
                const stats = statsMap.get(c.id);
                const st = STATUS[c.status] ?? { label: c.status, cls: 'cs-left' };
                return (
                  <div key={c.id} className="cs-row">
                    <div className="c-name" style={{ minWidth: 0 }}>
                      <Link href={`/admin/${tenant.slug}/customers/${c.id}`} className="cs-name">
                        {c.display_name ?? '(沒有名稱)'}
                      </Link>
                      {c.full_name && <div className="cs-sub">{c.full_name}</div>}
                    </div>
                    <div className="c-phone muted">{c.phone ?? '—'}</div>
                    <div className="c-addr muted trunc" title={c.address ?? undefined}>{c.address ?? '—'}</div>
                    <div className="c-bday muted">{c.birthday ?? '—'}</div>
                    <div className="c-orders r">
                      {stats?.order_count ?? 0}
                      <span className="ui-only-mobile muted"> 筆訂單{stats?.total_spent ? ` · NT$ ${stats.total_spent.toLocaleString()}` : ''}</span>
                    </div>
                    <div className="c-spent r" style={{ fontWeight: stats?.total_spent ? 600 : 400 }}>
                      {stats?.total_spent ? `NT$ ${stats.total_spent.toLocaleString()}` : '—'}
                    </div>
                    <div className="c-st">
                      <span className={`ui-badge ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="c-added muted">{formatTw(c.added_at)}</div>
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
