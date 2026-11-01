import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { markOrderPaid, markOrderShipped } from '../../actions';
import { ConfirmButton } from '../../_components/confirm-button';
import { FlashToast } from '../../../_components/toast';
import { IconCheck, IconDownload, IconMessage, IconPackage, IconSearch } from '@/lib/icons';

/**
 * 訂單列表(2026-11-01 換成後台新設計系統:lib/ui 元件 + 卡片式清單,不再用 <table>)。
 * 資料查詢、篩選、快速動作的邏輯不變。
 */

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  source: string;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_method: string | null; // 2026-10-06:自取訂單快速鍵顯示「標已備貨」
  shipping_fee_twd: number | null;
  payment_reported_at: string | null;
  payment_last5: string | null;
  payment_method: string | null; // 2026-10-16:標示 LINE Pay 未完成付款的單
  created_at: string;
  users: { display_name: string | null; full_name: string | null } | null;
};

type Filters = {
  status?: string;
  payment?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
  saved?: string; // 來自 markOrderPaid / markOrderShipped redirect 的訂單 id
};

async function getOrders(tenantId: string, f: Filters): Promise<OrderRow[]> {
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, total_twd, source, shipping_recipient, shipping_phone, shipping_method, shipping_fee_twd, payment_reported_at, payment_last5, payment_method, created_at, users(display_name, full_name)',
    )
    .eq('tenant_id', tenantId);

  if (f.status) query = query.eq('status', f.status);
  if (f.payment) query = query.eq('payment_status', f.payment);
  if (f.source) query = query.eq('source', f.source);
  if (f.from) query = query.gte('created_at', `${f.from}T00:00:00+08:00`);
  if (f.to) {
    // 含當天(2026-09-02 修):原本 lt 當天 00:00 會漏掉 to 當日的訂單
    const end = new Date(new Date(`${f.to}T00:00:00+08:00`).getTime() + 86400000);
    query = query.lt('created_at', end.toISOString());
  }
  if (f.q) {
    // 搜尋:order_no 或 shipping_recipient 或 shipping_phone(任一 ilike 命中)
    const q = f.q.replace(/[%,]/g, ''); // 防 supabase or syntax 被亂寫
    query = query.or(
      `order_no.ilike.%${q}%,shipping_recipient.ilike.%${q}%,shipping_phone.ilike.%${q}%`,
    );
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as OrderRow[];
}

const STATUS_LABEL: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};
const PAY_LABEL: Record<string, string> = { pending: '未付款', paid: '已付款', failed: '付款失敗', refunded: '已退款' };
const SOURCE_LABEL: Record<string, string> = { web: '網站', liff: 'LINE', manual: '手動', line_chat: 'LINE 對話' };

function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const CSS = `
.od-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.od-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.od-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.od-filter{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:14px}
.od-filter .q{flex:1 1 220px;min-width:160px;position:relative}
.od-filter .q svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#a1a1aa;pointer-events:none}
.od-filter .q input{padding-left:32px}
.od-filter select.ui-input{width:auto;min-width:0}
.od-filter .date{width:136px}
.od-filter .tilde{color:#a1a1aa;font-size:13px}
.od-filter .sp{flex:1}
.od-list{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.od-row{display:grid;grid-template-columns:190px 1.2fr 120px 100px 140px 150px;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.od-row:first-child{border-top:0}
.od-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px}
.od-row .r{text-align:right}
.od-no{font-weight:600;color:#18181b;text-decoration:none;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:-.01em}
.od-no:hover{text-decoration:underline}
.od-sub{font-size:12px;color:#71717a;margin-top:2px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.od-amt{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.od-amt .od-sub{display:block;font-weight:400}
.ob-pay-paid{color:#15803d}
.ob-pay-pending{color:#71717a}
.ob-pay-failed,.ob-pay-refunded{color:#b91c1c}
.ob-note{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:1px 7px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:600;white-space:nowrap}
.ob-wait{display:inline-flex;align-items:center;margin-top:4px;padding:1px 7px;border-radius:999px;background:#f4f4f5;color:#71717a;font-size:11px;font-weight:600;white-space:nowrap}
.od-act{display:flex;gap:4px;justify-content:flex-end}
.od-empty{padding:48px 16px;text-align:center;color:#71717a;font-size:14px}
@media (max-width:767px){
  .od-head{align-items:flex-start;flex-direction:column}
  .od-filter{padding:10px}
  .od-filter select.ui-input,.od-filter .date{width:100%;flex:1 1 45%}
  .od-list{border-radius:10px}
  .od-row{grid-template-columns:1fr auto;grid-template-areas:"no amt" "cust cust" "st pay" "act act";gap:6px 12px;padding:12px 14px}
  .od-row.head{display:none}
  .c-no{grid-area:no}.c-cust{grid-area:cust}.c-amt{grid-area:amt}.c-st{grid-area:st}.c-pay{grid-area:pay;text-align:right}.c-act{grid-area:act;justify-self:end;margin-top:4px}
}
`;

export default async function OrdersListPage({
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
  const orders = await getOrders(tenant.id, filters);

  const hasAnyFilter = !!(
    filters.status ||
    filters.payment ||
    filters.source ||
    filters.q ||
    filters.from ||
    filters.to
  );
  const savedId = filters.saved;

  const exportHref = `/admin/${tenant.slug}/orders/export?${new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        status: filters.status ?? '',
        payment: filters.payment ?? '',
        source: filters.source ?? '',
        q: filters.q ?? '',
        from: filters.from ?? '',
        to: filters.to ?? '',
      }).filter(([, v]) => v !== ''),
    ),
  ).toString()}`;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 1120 }}>
        {savedId && <FlashToast key={savedId} message="已更新訂單狀態" />}

        <header className="od-head">
          <div>
            <h1>訂單</h1>
            <p>
              {hasAnyFilter ? '符合條件 ' : '最近 '}
              {orders.length}
              {orders.length >= 200 ? '+ 筆,只顯示最近 200 筆' : ' 筆'}
            </p>
          </div>
          {/* 匯出 CSV(2026-09-02):帶目前套用的篩選條件 */}
          <a className="ui-btn ui-btn-outline ui-btn-sm" href={exportHref}>
            <IconDownload size={14} />
            匯出 CSV
          </a>
        </header>

        {/* 篩選列:GET 表單,網址可分享 */}
        <form method="GET" action={`/admin/${tenant.slug}/orders`} className="od-filter">
          <label className="q">
            <IconSearch size={15} />
            <input
              name="q"
              className="ui-input ui-input-sm"
              defaultValue={filters.q ?? ''}
              placeholder="搜尋訂單編號、姓名、電話"
              aria-label="搜尋"
            />
          </label>
          <select name="status" className="ui-input ui-input-sm" defaultValue={filters.status ?? ''} aria-label="訂單狀態">
            <option value="">所有狀態</option>
            <option value="open">待付款</option>
            <option value="paid">已付款</option>
            <option value="shipped">已出貨</option>
            <option value="delivered">已送達</option>
            <option value="cancelled">已取消</option>
            <option value="refunded">已退款</option>
          </select>
          <select name="payment" className="ui-input ui-input-sm" defaultValue={filters.payment ?? ''} aria-label="付款狀態">
            <option value="">所有付款</option>
            <option value="pending">未付款</option>
            <option value="paid">已付款</option>
            <option value="failed">付款失敗</option>
            <option value="refunded">已退款</option>
          </select>
          <select name="source" className="ui-input ui-input-sm" defaultValue={filters.source ?? ''} aria-label="來源">
            <option value="">所有來源</option>
            <option value="web">網站</option>
            <option value="liff">LINE</option>
            <option value="manual">手動</option>
            <option value="line_chat">LINE 對話</option>
          </select>
          {/* 2026-09-11:iPadOS Safari 空值 date 輸入框會塌陷,給明確高度 + 關原生外觀 */}
          <input
            name="from"
            type="date"
            className="ui-input ui-input-sm date"
            defaultValue={filters.from ?? ''}
            style={{ WebkitAppearance: 'none', appearance: 'none' }}
            aria-label="起始日期"
          />
          <span className="tilde">~</span>
          <input
            name="to"
            type="date"
            className="ui-input ui-input-sm date"
            defaultValue={filters.to ?? ''}
            style={{ WebkitAppearance: 'none', appearance: 'none' }}
            aria-label="結束日期"
          />
          <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">查詢</button>
          {hasAnyFilter && (
            <Link href={`/admin/${tenant.slug}/orders`} className="ui-btn ui-btn-ghost ui-btn-sm">
              清除
            </Link>
          )}
        </form>

        <div className="od-list">
          {orders.length === 0 ? (
            <div className="od-empty">{hasAnyFilter ? '沒有符合條件的訂單。' : '還沒有訂單。'}</div>
          ) : (
            <>
              <div className="od-row head" aria-hidden>
                <span>訂單</span>
                <span>客戶</span>
                <span className="r">金額</span>
                <span>狀態</span>
                <span>付款</span>
                <span className="r">動作</span>
              </div>
              {orders.map((o) => (
                <div key={o.id} className="od-row">
                  <div className="c-no">
                    <Link href={`/admin/${tenant.slug}/orders/${o.id}`} className="od-no">
                      {o.order_no}
                    </Link>
                    <div className="od-sub">
                      <span>{formatTw(o.created_at)}</span>
                      <span>·</span>
                      <span>{SOURCE_LABEL[o.source] ?? o.source}</span>
                    </div>
                  </div>

                  <div className="c-cust">
                    {o.users?.display_name ? (
                      <>
                        <div style={{ fontWeight: 500 }}>{o.users.display_name}</div>
                        {o.users.full_name && <div className="od-sub">收件人 {o.users.full_name}</div>}
                      </>
                    ) : o.shipping_recipient ? (
                      <>
                        <div style={{ fontWeight: 500 }}>{o.shipping_recipient}</div>
                        <div className="od-sub">訪客</div>
                      </>
                    ) : (
                      <div style={{ color: '#a1a1aa' }}>沒有客戶資料</div>
                    )}
                  </div>

                  <div className="c-amt od-amt">
                    NT$ {(o.total_twd + (o.shipping_fee_twd ?? 0)).toLocaleString()}
                    {(o.shipping_fee_twd ?? 0) > 0 && <span className="od-sub">含運 {o.shipping_fee_twd}</span>}
                  </div>

                  <div className="c-st">
                    <span className={`ui-badge ob-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                  </div>

                  <div className="c-pay">
                    <span className={`ob-pay-${o.payment_status}`} style={{ fontWeight: 500 }}>
                      {PAY_LABEL[o.payment_status] ?? o.payment_status}
                    </span>
                    {/* D#14:客人已自助回報後五碼,提醒核帳 */}
                    {o.payment_status === 'pending' && o.payment_reported_at && (
                      <div>
                        <span className="ob-note">
                          <IconMessage size={11} />
                          {o.payment_method === 'qr' ? '已回報掃碼付款' : `回報後五碼 ${o.payment_last5}`}
                        </span>
                      </div>
                    )}
                    {/* 2026-10-16:客人選了線上付款但還沒付完 — 不是等你核帳的單,付完會自動變已收款;
                        逾期排程會自動取消並退庫存,標出來免得被當成待辦 */}
                    {o.payment_status === 'pending' &&
                      (o.payment_method === 'line_pay' || o.payment_method === 'ecpay_credit' || o.payment_method === 'ecpay_atm') && (
                        <div>
                          <span className="ob-wait">
                            {o.payment_method === 'line_pay' ? 'LINE Pay 未完成' : o.payment_method === 'ecpay_credit' ? '信用卡未完成' : 'ATM 待轉帳'}
                          </span>
                        </div>
                      )}
                  </div>

                  <div className="c-act od-act">
                    <QuickAction order={o} tenantSlug={tenant.slug} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * 訂單列表 inline quick action:
 * - 待付款 → 「已收款」(直接呼叫 markOrderPaid,跳轉回此頁 ?saved=id)
 * - 已付款未出貨 → 「已出貨」(自取訂單顯示「已備貨」)
 * - 其他 → 只有「詳細」
 */
function QuickAction({ order, tenantSlug }: { order: OrderRow; tenantSlug: string }) {
  const linkBtn = (
    <Link href={`/admin/${tenantSlug}/orders/${order.id}`} className="ui-btn ui-btn-outline ui-btn-xs">
      詳細
    </Link>
  );

  if (order.status === 'open') {
    return (
      <form action={markOrderPaid} style={{ display: 'flex', gap: 4 }}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="tenant_slug" value={tenantSlug} />
        <input type="hidden" name="return_to" value="list" />
        <ConfirmButton bg="#16a34a" confirmText={`確定把訂單 ${order.order_no} 標記為「已收款」?`}>
          <IconCheck size={12} /> 已收款
        </ConfirmButton>
        {linkBtn}
      </form>
    );
  }

  if (order.status === 'paid') {
    // 2026-10-06:自取訂單沒有「出貨」,按鈕改「已備貨」(DB 狀態仍是 shipped,只換文案)
    const isPickup = order.shipping_method === 'pickup';
    return (
      <form action={markOrderShipped} style={{ display: 'flex', gap: 4 }}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="tenant_slug" value={tenantSlug} />
        <input type="hidden" name="return_to" value="list" />
        <ConfirmButton bg="#2563eb" confirmText={`確定把訂單 ${order.order_no} 標記為「${isPickup ? '已備貨(待自取)' : '已出貨'}」?`}>
          <IconPackage size={12} /> {isPickup ? '已備貨' : '已出貨'}
        </ConfirmButton>
        {linkBtn}
      </form>
    );
  }

  return linkBtn;
}
