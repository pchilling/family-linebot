import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { updateOrder, markOrderPaid, markOrderShipped, refundEcpayOrder, refundLinePayOrder } from '../../../actions';
import { SubmitButton } from '../../../_components/submit-button';
import { FlashToast } from '../../../../_components/toast';
import { IconCheck, IconChevronLeft, IconMessage, IconPrinter, IconReceipt } from '@/lib/icons';

/**
 * 訂單明細(2026-11-01 換成後台新設計系統:左邊明細 / 客戶 / 訂單資料,右邊收款與出貨、退款)。
 * 查詢、對帳、出貨、退款的邏輯與 action 都不變。
 */

type OrderItem = {
  id: string;
  qty: number;
  price_at_purchase: number;
  subtotal_twd: number;
  products: { name: string; sku: string | null } | null;
  product_variants: { variant_name: string; sku: string } | null;
};

type OrderDetail = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_last5: string | null;
  payment_reported_at: string | null; // D#14:客人自助回報時間
  payment_note: string | null; // Phase 27:掃碼付款回報的備註
  linepay_transaction_id: string | null; // Phase 17:LINE Pay 交易序號(退款要用)
  linepay_refunded_twd: number | null; // Phase 17:已退款金額(部分退款累計)
  ecpay_merchant_trade_no: string | null; // Phase 21:我們送給綠界的特店交易編號(退款要一起帶)
  ecpay_trade_no: string | null; // Phase 21:綠界交易編號(對帳 / 退款用)
  ecpay_refunded_twd: number | null; // Phase 21.1:綠界已退款金額(部分退款累計)
  refund_note: string | null; // Phase 21.2:退款原因(LINE Pay / 綠界共用,客人在退款卡看得到)
  atm_bank_code: string | null; // Phase 21:綠界 ATM 虛擬帳號
  atm_vaccount: string | null;
  atm_expire_at: string | null;
  invoice_tax_id: string | null; // Phase 15.4:統編發票
  invoice_title: string | null;
  total_twd: number;
  shipping_method: string | null;
  shipping_fee_twd: number;
  source: string;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  note: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
  users: {
    line_user_id: string;
    display_name: string | null;
    full_name: string | null;
    phone: string | null;
  } | null;
  order_items: OrderItem[];
};

async function getOrder(tenantId: string, id: string): Promise<OrderDetail | null> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      // payment_last5 / payment_reported_at / shipping_*:Phase 14-15 SQL(2026-09-02)已加
      `id, order_no, status, payment_status, payment_method, payment_last5, payment_reported_at, payment_note,
       linepay_transaction_id, linepay_refunded_twd,
       ecpay_merchant_trade_no, ecpay_trade_no, ecpay_refunded_twd, refund_note, atm_bank_code, atm_vaccount, atm_expire_at,
       invoice_tax_id, invoice_title,
       total_twd, shipping_method, shipping_fee_twd, source,
       shipping_recipient, shipping_phone, shipping_address, note,
       guest_email, guest_phone, paid_at, shipped_at, created_at, updated_at,
       users(line_user_id, display_name, full_name, phone),
       order_items(id, qty, price_at_purchase, subtotal_twd, products(name, sku), product_variants(variant_name, sku))`,
    )
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as unknown as OrderDetail | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨', delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};
const SOURCE_LABEL: Record<string, string> = { web: '網站', liff: 'LINE', manual: '手動', line_chat: 'LINE 對話' };

// 2026-10-22:退款原因常用選項(可自由改寫;客人會在 LINE 退款卡看到)
const REFUND_REASONS = [
  '商品暫時缺貨,已為您全額退款',
  '依您的要求取消訂單',
  '重複下單,多的那筆已退款',
  '商品有瑕疵,已退款並致歉',
  '運費多收,退還差額',
];

// 2026-09-08:付款方式代碼 → 中文(原本直接顯示 'bank' 讓人看不懂)
const PAY_METHODS: { value: string; label: string }[] = [
  { value: 'bank', label: '銀行轉帳' },
  { value: 'cash', label: '現金' },
  { value: 'line_pay', label: 'LINE Pay' },
  { value: 'ecpay_credit', label: '信用卡(綠界)' },
  { value: 'ecpay_atm', label: 'ATM 轉帳(綠界)' },
  { value: 'qr', label: '掃碼付款' },
];
function payMethodLabel(s: string): string {
  return PAY_METHODS.find((m) => m.value === s)?.label ?? s;
}

function formatTw(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
const money = (n: number) => `NT$ ${n.toLocaleString()}`;

const CSS = `
.odd-back{display:inline-flex;align-items:center;gap:2px;font-size:13px;color:#71717a;text-decoration:none;margin-bottom:10px}
.odd-back:hover{color:#18181b}
.odd-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.odd-top h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.odd-top .sp{flex:1}
.odd-meta{font-size:13px;color:#71717a;margin:6px 0 18px}
.odd-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}
.odd-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:18px 20px;margin-bottom:16px}
.odd-card h2{margin:0 0 12px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
.odd-card h2 .hint{margin-left:auto;font-size:12px;font-weight:400;color:#a1a1aa}
.odd-card.warn{border-color:#fde68a;background:#fffbeb}
.odd-card.ok{border-color:#bbf7d0;background:#f0fdf4}
.odd-card.warn h2{color:#92400e}.odd-card.ok h2{color:#15803d}
.odd-card.orange{border-color:#fed7aa;background:#fff7ed}.odd-card.orange h2{color:#9a3412}
.odd-card.teal{border-color:#99f6e4;background:#f0fdfa}.odd-card.teal h2{color:#115e59}
.odd-note{font-size:12.5px;line-height:1.65;color:#52525b}
.odd-callout{display:flex;gap:8px;align-items:flex-start;padding:10px 14px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:13px;font-weight:600;margin-bottom:16px}
.odd-reported{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:8px;background:#fef3c7;border:1px solid #fbbf24;color:#92400e;font-size:13px;font-weight:600;margin-bottom:12px;line-height:1.55}
.odd-items .row{display:grid;grid-template-columns:1fr 96px 48px 104px;gap:10px;padding:10px 0;border-top:1px solid #f4f4f5;font-size:13.5px;align-items:center}
.odd-items .row.head{border-top:0;padding:0 0 6px;font-size:11.5px;color:#71717a}
.odd-items .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.odd-items .sku{font-size:12px;color:#a1a1aa;margin-top:2px}
.odd-items .sum{display:flex;justify-content:space-between;gap:12px;padding:6px 0 0;font-size:13px;color:#71717a}
.odd-items .sum.total{padding-top:10px;margin-top:6px;border-top:1px solid #e4e4e7;color:#18181b;font-weight:600}
.odd-items .sum.total b{font-size:17px}
.odd-kv{display:grid;grid-template-columns:92px 1fr;gap:8px 12px;font-size:13.5px;margin:0}
.odd-kv dt{color:#71717a;margin:0}.odd-kv dd{margin:0;min-width:0;word-break:break-all}
.odd-code{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;padding:1px 8px;background:#f4f4f5;border-radius:4px;font-size:13px;user-select:all}
.odd-form{display:grid;gap:12px}
.odd-form .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.odd-form .ui-label{margin-bottom:4px}
.odd-times{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:#71717a}
.odd-sep{border:0;border-top:1px dashed #d4d4d8;margin:14px 0}
.odd-refund{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
.odd-refund .amt{flex:0 1 150px}.odd-refund .why{flex:1 1 220px}
@media (max-width:1023px){.odd-grid{grid-template-columns:1fr}}
@media (max-width:767px){
  .odd-card{padding:14px 14px;border-radius:10px}
  .odd-items .row{grid-template-columns:1fr 72px 36px 84px;font-size:13px;gap:6px}
  .odd-form .two{grid-template-columns:1fr}
  .odd-kv{grid-template-columns:80px 1fr}
}
`;

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; id: string }>;
  searchParams: Promise<{ saved?: string; msg?: string }>;
}) {
  const { tenant: slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const o = await getOrder(tenant.id, id);
  if (!o) notFound();

  const justPaid = sp.saved === 'paid';
  const justShipped = sp.saved === 'shipped';
  const justEdit = sp.saved === 'edit';
  // Phase 17:LINE Pay 退款結果
  // Phase 21.1:綠界退款多兩種結果(放棄授權免手續費 / 批次請款時段不能退),失敗原因用 msg 帶回
  const refundDetail = sp.msg ? decodeURIComponent(String(sp.msg)).slice(0, 300) : '';
  const refundMsg =
    sp.saved === 'refunded' ? '退款已送出,客人會收到 LINE 通知'
    : sp.saved === 'refunded_void' ? '已取消授權(這筆還沒請款,不收手續費),客人會收到 LINE 通知'
    : sp.saved === 'refund_over' ? '退款失敗:金額超過可退金額'
    : sp.saved === 'refund_closing' ? '綠界每天 20:15–20:30 批次請款中,請 20:35 後再退'
    : sp.saved === 'refund_failed' ? `退款失敗,款項未退出${refundDetail ? `:${refundDetail}` : ' — 請看 Vercel log 或到金流商後台確認'}`
    : null;
  const isPaid = o.payment_status === 'paid';
  const isShipped = o.status === 'shipped' || o.status === 'delivered';
  // 2026-10-06:自取訂單的「出貨」其實是「備貨」,相關文案依配送方式切換
  const isPickup = o.shipping_method === 'pickup';
  const grandTotal = o.total_twd + (o.shipping_fee_twd ?? 0);
  // 付款方式下拉:資料裡若是沒列的代碼也要顯示出來,不然存檔會被改掉
  const methodOptions =
    o.payment_method && !PAY_METHODS.some((m) => m.value === o.payment_method)
      ? [...PAY_METHODS, { value: o.payment_method, label: o.payment_method }]
      : PAY_METHODS;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 1120 }}>
        {/* 2026-09-11:對帳回饋改頂部滑入通知(shadcn Sonner 風格) */}
        {(justPaid || justShipped || justEdit || refundMsg) && (
          <FlashToast
            tone={refundMsg && /失敗|不能/.test(refundMsg) ? 'error' : 'success'}
            message={refundMsg ?? (justPaid ? '已標記為已收款' : justShipped ? (isPickup ? '已標記為已備貨' : '已標記為已出貨') : '已儲存訂單資料')}
          />
        )}

        <Link href={`/admin/${tenant.slug}/orders`} className="odd-back">
          <IconChevronLeft size={14} /> 訂單
        </Link>
        <div className="odd-top">
          <h1>{o.order_no}</h1>
          <span className={`ui-badge ob-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
          <span className="ui-badge">{SOURCE_LABEL[o.source] ?? o.source}</span>
          <span className="sp" />
          <a href={`/print/${tenant.slug}/order/${o.id}`} target="_blank" rel="noopener" className="ui-btn ui-btn-outline ui-btn-sm">
            <IconPrinter size={14} /> 列印出貨單
          </a>
        </div>
        <p className="odd-meta">
          建立 {formatTw(o.created_at)} · 最後更新 {formatTw(o.updated_at)}
        </p>

        <div className="odd-grid">
          {/* ── 左:明細、客戶、訂單資料 ── */}
          <div>
            {/* Phase 15.4:客人要求開統編發票 → 醒目提示 */}
            {o.invoice_tax_id && (
              <div className="odd-callout">
                <IconReceipt size={15} style={{ marginTop: 2 }} />
                <span>
                  需開發票,統編 <span className="odd-code">{o.invoice_tax_id}</span>
                  {o.invoice_title && <> · 抬頭「{o.invoice_title}」</>}
                </span>
              </div>
            )}

            <div className="odd-card odd-items">
              <h2>訂單明細</h2>
              <div className="row head" aria-hidden>
                <span>商品</span>
                <span className="r">單價</span>
                <span className="r">數量</span>
                <span className="r">小計</span>
              </div>
              {o.order_items.map((it) => {
                // 優先顯示 variant SKU(更精準,出貨對得到);只有 variant 不存在時 fallback 到 product.sku
                const displaySku = it.product_variants?.sku ?? it.products?.sku ?? null;
                const variantName = it.product_variants?.variant_name;
                return (
                  <div key={it.id} className="row">
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{it.products?.name ?? '(已刪除的商品)'}</span>
                        {variantName && variantName !== 'default' && <span className="ui-badge">{variantName}</span>}
                      </div>
                      {displaySku && <div className="sku">SKU {displaySku}</div>}
                    </div>
                    <span className="r">{money(it.price_at_purchase)}</span>
                    <span className="r">{it.qty}</span>
                    <span className="r" style={{ fontWeight: 500 }}>{money(it.subtotal_twd)}</span>
                  </div>
                );
              })}
              {(o.shipping_fee_twd ?? 0) > 0 && (
                <>
                  <div className="sum" style={{ paddingTop: 12 }}>
                    <span>商品小計</span>
                    <span>{money(o.total_twd)}</span>
                  </div>
                  <div className="sum">
                    <span>運費{o.shipping_method ? `(${o.shipping_method})` : ''}</span>
                    <span>{money(o.shipping_fee_twd)}</span>
                  </div>
                </>
              )}
              <div className="sum total">
                <span>總計</span>
                <b>{money(grandTotal)}</b>
              </div>
            </div>

            <div className="odd-card">
              <h2>客戶</h2>
              {o.users ? (
                <dl className="odd-kv">
                  <dt>LINE 名稱</dt>
                  <dd>
                    <span className="odd-code">{o.users.display_name ?? '—'}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#71717a' }}>到 LINE 官方帳號用這個名字找對話</span>
                  </dd>
                  <dt>填寫姓名</dt>
                  <dd>{o.users.full_name ?? '—'}</dd>
                  <dt>會員電話</dt>
                  <dd>{o.users.phone ?? '—'}</dd>
                </dl>
              ) : (
                <dl className="odd-kv">
                  <dt>身分</dt>
                  <dd>訪客結帳,聯絡方式看下面的收件資料</dd>
                  {o.guest_email && (
                    <>
                      <dt>Email</dt>
                      <dd><span className="odd-code">{o.guest_email}</span></dd>
                    </>
                  )}
                  {o.guest_phone && (
                    <>
                      <dt>聯絡電話</dt>
                      <dd>{o.guest_phone}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>

            <div className="odd-card">
              <h2>
                訂單資料
                <span className="hint">狀態、收件、備註都能改</span>
              </h2>
              <form action={updateOrder} className="odd-form">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="tenant_slug" value={tenant.slug} />

                <div className="two">
                  <div>
                    <label className="ui-label" htmlFor="f-status">訂單狀態</label>
                    <select id="f-status" name="status" defaultValue={o.status} className="ui-input">
                      <option value="open">待付款</option>
                      <option value="paid">已付款</option>
                      <option value="shipped">{isPickup ? '已備貨(自取)' : '已出貨'}</option>
                      <option value="delivered">{isPickup ? '已取貨' : '已送達'}</option>
                      <option value="cancelled">已取消(自動退庫存)</option>
                      <option value="refunded">已退款(自動退庫存)</option>
                    </select>
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="f-pay">付款狀態</label>
                    <select id="f-pay" name="payment_status" defaultValue={o.payment_status} className="ui-input">
                      <option value="pending">未付款</option>
                      <option value="paid">已付款</option>
                      <option value="failed">付款失敗</option>
                      <option value="refunded">已退款</option>
                    </select>
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="f-method">付款方式</label>
                    <select id="f-method" name="payment_method" defaultValue={o.payment_method ?? ''} className="ui-input">
                      <option value="">未指定</option>
                      {methodOptions.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="f-recipient">收件人</label>
                    <input id="f-recipient" name="shipping_recipient" defaultValue={o.shipping_recipient ?? ''} className="ui-input" />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="f-phone">電話</label>
                    <input id="f-phone" name="shipping_phone" defaultValue={o.shipping_phone ?? ''} className="ui-input" />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="f-address">地址</label>
                    <input id="f-address" name="shipping_address" defaultValue={o.shipping_address ?? ''} className="ui-input" />
                  </div>
                </div>
                <div>
                  <label className="ui-label" htmlFor="f-note">備註</label>
                  <textarea id="f-note" name="note" defaultValue={o.note ?? ''} rows={3} className="ui-input" />
                </div>

                <div className="odd-times">
                  <span>付款時間 {formatTw(o.paid_at)}</span>
                  <span>出貨時間 {formatTw(o.shipped_at)}</span>
                  <span style={{ marginLeft: 'auto', color: '#a1a1aa' }}>狀態改成已付款、已出貨時會自動填時間</span>
                </div>

                <div>
                  <SubmitButton pendingText="儲存中…" confirmText="確定儲存這些訂單變更?">儲存變更</SubmitButton>
                </div>
              </form>
            </div>
          </div>

          {/* ── 右:收款與出貨、退款 ── */}
          <div>
            {/* 對帳 quick actions(2026-05-22 加,未付 / 已付 / 已出貨 三狀態顯示) */}
            <div className={`odd-card ${isPaid ? 'ok' : 'warn'}`}>
              {!isPaid ? (
                <>
                  <h2>確認收款</h2>
                  {/* D#14:客人在訂單頁自助回報的後五碼直接帶入 */}
                  {o.payment_reported_at && (
                    <div className="odd-reported">
                      <IconMessage size={14} style={{ marginTop: 2 }} />
                      <span>
                        {o.payment_method === 'qr'
                          ? <>客人已回報掃碼付款({formatTw(o.payment_reported_at)}){o.payment_note ? <>,備註「{o.payment_note}」</> : null}。到收款 App 核對入帳後按下方確認。</>
                          : <>客人已回報後五碼「{o.payment_last5}」({formatTw(o.payment_reported_at)})。核對入帳後按下方確認。</>}
                      </span>
                    </div>
                  )}
                  <p className="odd-note" style={{ margin: '0 0 14px', color: '#78350f' }}>
                    核對入帳後標記為已收款,訂單會變成已付款、算進今日營收。
                    {(o.shipping_fee_twd ?? 0) > 0 && (
                      <> 應收 <strong>{money(grandTotal)}</strong>(含運費 {o.shipping_fee_twd})。</>
                    )}
                  </p>
                  <form action={markOrderPaid} className="odd-form">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="tenant_slug" value={tenant.slug} />
                    <div className="two">
                      <div>
                        <label className="ui-label" htmlFor="p-last5">後五碼<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></label>
                        <input
                          id="p-last5"
                          name="payment_last5"
                          maxLength={5}
                          pattern="[0-9]*"
                          inputMode="numeric"
                          className="ui-input"
                          defaultValue={o.payment_last5 ?? ''}
                          placeholder="12345"
                        />
                      </div>
                      <div>
                        <label className="ui-label" htmlFor="p-method">付款方式</label>
                        <select id="p-method" name="payment_method" defaultValue={o.payment_method ?? 'bank'} className="ui-input">
                          {PAY_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <SubmitButton pendingText="標記中…" confirmText="確定標記這筆訂單為「已收款」?">確認已收款</SubmitButton>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h2>
                    <IconCheck size={15} /> 已收款
                  </h2>
                  <div className="odd-note" style={{ color: '#15803d' }}>
                    {formatTw(o.paid_at)}
                    {o.payment_method && <> · {payMethodLabel(o.payment_method)}</>}
                    {o.payment_last5 && <> · 後五碼 <span className="odd-code">{o.payment_last5}</span></>}
                  </div>
                </>
              )}

              {/* 已付款 → 顯示「標已出貨」按鈕(2026-09-11:追蹤單號功能移除,改一鍵標出貨) */}
              {isPaid && !isShipped && (
                <form action={markOrderShipped} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #bbf7d0' }}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="tenant_slug" value={tenant.slug} />
                  <SubmitButton
                    pendingText="標記中…"
                    confirmText={isPickup ? '確定標記這筆自取訂單為「已備貨」?(客人訂單頁會顯示可取貨)' : '確定標記這筆訂單為「已出貨」?'}
                  >
                    {isPickup ? '標記已備貨(待自取)' : '標記已出貨'}
                  </SubmitButton>
                </form>
              )}

              {isShipped && (
                <div className="odd-note" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #bbf7d0', color: '#0a7038' }}>
                  {isPickup ? '已備貨,等待取貨' : '已出貨'} · {formatTw(o.shipped_at)}
                </div>
              )}
            </div>

            {/* Phase 17(2026-10-15):LINE Pay 退款 — 半自動,要填金額 + 二次確認。
                全額退會順便標訂單已退款並自動退庫存;部分退只退錢,狀態不動。 */}
            {o.payment_method === 'line_pay' && o.linepay_transaction_id && (() => {
              const alreadyRefunded = o.linepay_refunded_twd ?? 0;
              const remaining = grandTotal - alreadyRefunded;
              return (
                <div className="odd-card orange">
                  <h2>LINE Pay 退款</h2>
                  <div className="odd-note" style={{ color: '#7c2d12', marginBottom: 12 }}>
                    交易序號 <span className="odd-code">{o.linepay_transaction_id}</span>
                    <br />
                    實收 {money(grandTotal)}
                    {alreadyRefunded > 0 && <> · 已退 {money(alreadyRefunded)}</>}
                    {' '}· 可退 <strong>{money(remaining)}</strong>
                  </div>
                  {remaining <= 0 ? (
                    <div style={{ fontSize: 13, color: '#9a3412', fontWeight: 600 }}>
                      此筆已全額退款完畢。{o.refund_note && <span style={{ fontWeight: 400 }}> 退款原因:{o.refund_note}</span>}
                    </div>
                  ) : (
                    <form action={refundLinePayOrder} className="odd-refund">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="tenant_slug" value={tenant.slug} />
                      <div className="amt">
                        <label className="ui-label" htmlFor="lp-amount">退款金額</label>
                        <input id="lp-amount" name="refund_amount" type="number" min="1" max={remaining} defaultValue={remaining} className="ui-input" />
                      </div>
                      <div className="why">
                        <label className="ui-label" htmlFor="lp-note">退款原因<span style={{ color: '#71717a', fontWeight: 400 }}>(客人會在 LINE 通知看到)</span></label>
                        <input id="lp-note" name="refund_note" list="refund-reasons-linepay" maxLength={100} required className="ui-input" placeholder="例:商品暫時缺貨,已為您全額退款" />
                        <datalist id="refund-reasons-linepay">
                          {REFUND_REASONS.map((r) => <option key={r} value={r} />)}
                        </datalist>
                      </div>
                      <SubmitButton
                        variant="danger"
                        pendingText="退款中…"
                        confirmText={`確定要退款給客人嗎?退款不可取消,確認後款項會立刻退回客人的 LINE Pay。(訂單 ${o.order_no})`}
                      >
                        送出退款
                      </SubmitButton>
                    </form>
                  )}
                  <div className="odd-note" style={{ color: '#9a3412', marginTop: 10, fontSize: 12 }}>
                    預設帶全額。要部分退款(例如只退一項或扣掉運費)就改小金額,可以分次退到額滿。
                    全額退完會自動把訂單標成「已退款」並退回庫存。
                  </div>
                </div>
              );
            })()}

            {/* Phase 21(2026-10-22):綠界(信用卡 / ATM 虛擬帳號)資訊 — 收款由綠界通知自動標,
                退款在綠界廠商後台操作(信用卡可線上退刷;ATM 要人工匯回),這裡只看不動。 */}
            {(o.payment_method === 'ecpay_atm' || o.payment_method === 'ecpay_credit') && (
              <div className="odd-card teal">
                <h2>綠界 {o.payment_method === 'ecpay_atm' ? 'ATM 轉帳' : '信用卡'}</h2>
                <div className="odd-note" style={{ color: '#134e4a', lineHeight: 1.8 }}>
                  綠界交易編號{' '}
                  <span className="odd-code">{o.ecpay_trade_no ?? '—(尚未付款 / 取號)'}</span>
                  {o.payment_method === 'ecpay_atm' && (
                    <>
                      <br />
                      虛擬帳號 {o.atm_bank_code ?? '—'} /{' '}
                      <span className="odd-code">{o.atm_vaccount ?? '尚未取號'}</span>
                      {o.atm_expire_at && (
                        <> · 繳費期限 {new Date(o.atm_expire_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </>
                  )}
                  <br />
                  {o.payment_status === 'paid'
                    ? '綠界已通知收款,訂單自動標為已收款。'
                    : '客人付款後綠界會自動通知,這筆會自己變成已收款,不用人工核帳。'}
                </div>
                {/* Phase 21.1:信用卡可以直接在這裡退(跟 LINE Pay 同一套);ATM 要人工匯回 */}
                {o.payment_method === 'ecpay_credit' && o.ecpay_merchant_trade_no && o.ecpay_trade_no &&
                (o.payment_status === 'paid' || (o.ecpay_refunded_twd ?? 0) > 0) ? (() => {
                  const alreadyRefunded = o.ecpay_refunded_twd ?? 0;
                  const remaining = grandTotal - alreadyRefunded;
                  return (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #99f6e4' }}>
                      <div className="odd-note" style={{ color: '#134e4a', marginBottom: 10 }}>
                        實收 {money(grandTotal)}
                        {alreadyRefunded > 0 && <> · 已退 {money(alreadyRefunded)}</>}
                        {' '}· 可退 <strong>{money(Math.max(0, remaining))}</strong>
                      </div>
                      {remaining <= 0 || o.payment_status !== 'paid' ? (
                        <div style={{ fontSize: 13, color: '#115e59', fontWeight: 600 }}>
                          此筆已全額退款完畢。{o.refund_note && <span style={{ fontWeight: 400 }}> 退款原因:{o.refund_note}</span>}
                        </div>
                      ) : (
                        <form action={refundEcpayOrder} className="odd-refund">
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="tenant_slug" value={tenant.slug} />
                          <div className="amt">
                            <label className="ui-label" htmlFor="ec-amount">退款金額</label>
                            <input id="ec-amount" name="refund_amount" type="number" min="1" max={remaining} defaultValue={remaining} className="ui-input" />
                          </div>
                          <div className="why">
                            <label className="ui-label" htmlFor="ec-note">退款原因<span style={{ color: '#71717a', fontWeight: 400 }}>(客人會在 LINE 通知看到)</span></label>
                            <input id="ec-note" name="refund_note" list="refund-reasons-ecpay" maxLength={100} required className="ui-input" placeholder="例:商品暫時缺貨,已為您全額退款" />
                            <datalist id="refund-reasons-ecpay">
                              {REFUND_REASONS.map((r) => <option key={r} value={r} />)}
                            </datalist>
                          </div>
                          <SubmitButton
                            variant="danger"
                            pendingText="退款中…"
                            confirmText={`確定要退款給客人嗎?退款不可取消,確認後會立刻向綠界送出退款。(訂單 ${o.order_no})`}
                          >
                            送出退款
                          </SubmitButton>
                        </form>
                      )}
                      <div className="odd-note" style={{ color: '#115e59', marginTop: 10, fontSize: 12 }}>
                        預設帶全額。今天剛刷、還沒請款的單會用「放棄授權」退,不收任何手續費;已請款的用「退刷」,綠界退回 2.75% 手續費、扣 NT$1 處理費。
                        部分退款要等請款後(隔天早上 6 點後)才做得到。每天 20:15–20:30 綠界批次請款中不能退。
                        全額退完會自動把訂單標成「已退款」並退回庫存。
                      </div>
                    </div>
                  );
                })() : (
                  <div className="odd-note" style={{ color: '#115e59', marginTop: 10, fontSize: 12 }}>
                    {o.payment_method === 'ecpay_atm'
                      ? 'ATM 轉帳要退款請人工匯回客人帳戶,退完再把左邊訂單狀態改成「已退款」。'
                      : '這筆還沒收到綠界的付款通知,收款後這裡會出現退款功能。'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
