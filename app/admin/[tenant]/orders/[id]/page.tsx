import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { updateOrder, markOrderPaid, markOrderShipped, refundEcpayOrder, refundLinePayOrder } from '../../../actions';
import { SubmitButton } from '../../../_components/submit-button';
import { FlashToast } from '../../../../_components/toast';

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
  linepay_transaction_id: string | null; // Phase 17:LINE Pay 交易序號(退款要用)
  linepay_refunded_twd: number | null; // Phase 17:已退款金額(部分退款累計)
  ecpay_merchant_trade_no: string | null; // Phase 21:我們送給綠界的特店交易編號(退款要一起帶)
  ecpay_trade_no: string | null; // Phase 21:綠界交易編號(對帳 / 退款用)
  ecpay_refunded_twd: number | null; // Phase 21.1:綠界已退款金額(部分退款累計)
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
      `id, order_no, status, payment_status, payment_method, payment_last5, payment_reported_at,
       linepay_transaction_id, linepay_refunded_twd,
       ecpay_merchant_trade_no, ecpay_trade_no, ecpay_refunded_twd, atm_bank_code, atm_vaccount, atm_expire_at,
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

function sourceLabel(s: string): string {
  return ({ web: '網站', liff: 'LIFF', manual: '手動', line_chat: 'LINE 對話' }[s]) ?? s;
}
// 2026-09-08:付款方式代碼 → 中文(原本直接顯示 'bank' 讓人看不懂)
function payMethodLabel(s: string): string {
  return ({ bank: '銀行轉帳', cash: '現金', line_pay: 'LINE Pay', ecpay_credit: '信用卡(綠界)', ecpay_atm: 'ATM 轉帳(綠界)' }[s]) ?? s;
}
function sourceColor(s: string): string {
  return ({ web: '#7c3aed', liff: '#06c755', manual: '#9ca3af', line_chat: '#f59e0b' }[s]) ?? '#666';
}

function formatTw(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const section: React.CSSProperties = { marginBottom: 28, padding: 16, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' };
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '10px 8px' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', marginBottom: 4 };
const input: React.CSSProperties = { padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, width: '100%', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: 12, background: '#000', color: '#fff', border: 0, borderRadius: 4, fontSize: 14, cursor: 'pointer' };

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

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Link href={`/admin/${tenant.slug}/orders`} style={{ color: '#666', fontSize: 13 }}>
        ← 返回 {tenant.name} 訂單列表
      </Link>

      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        訂單 {o.order_no}
        <span style={{ display: 'inline-block', padding: '2px 10px', background: sourceColor(o.source) + '22', color: sourceColor(o.source), borderRadius: 3, fontSize: 13, fontWeight: 500 }}>
          {sourceLabel(o.source)}
        </span>
        <a
          href={`/print/${tenant.slug}/order/${o.id}`}
          target="_blank"
          rel="noopener"
          style={{ marginLeft: 'auto', padding: '6px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          🖨 列印出貨單(A4)
        </a>
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: o.invoice_tax_id ? 8 : 24 }}>
        建立 {formatTw(o.created_at)} · 最後更新 {formatTw(o.updated_at)}
      </p>
      {/* Phase 15.4:客人要求開統編發票 → 醒目提示 */}
      {o.invoice_tax_id && (
        <div style={{ marginBottom: 24, padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
          🧾 需開發票 — 統編 <span style={{ fontFamily: 'ui-monospace, monospace' }}>{o.invoice_tax_id}</span>
          {o.invoice_title && <> · 抬頭「{o.invoice_title}」</>}
        </div>
      )}

      <section style={section}>
        <h2 style={h2}>訂單明細</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={th}>商品</th>
              <th style={{ ...th, textAlign: 'right' }}>單價</th>
              <th style={{ ...th, textAlign: 'right' }}>數量</th>
              <th style={{ ...th, textAlign: 'right' }}>小計</th>
            </tr>
          </thead>
          <tbody>
            {o.order_items.map((it) => {
              // 優先顯示 variant SKU(更精準,出貨對得到);只有 variant 不存在時 fallback 到 product.sku
              const displaySku = it.product_variants?.sku ?? it.products?.sku ?? null;
              const variantName = it.product_variants?.variant_name;
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>
                    <div>
                      {it.products?.name ?? '(已刪)'}
                      {variantName && variantName !== 'default' && (
                        <span style={{ marginLeft: 8, padding: '2px 8px', background: '#eef2ff', color: '#4338ca', borderRadius: 3, fontSize: 12, fontWeight: 500 }}>
                          {variantName}
                        </span>
                      )}
                    </div>
                    {displaySku && <span style={{ color: '#999', fontSize: 12 }}>SKU {displaySku}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>NT$ {it.price_at_purchase.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>NT$ {it.subtotal_twd.toLocaleString()}</td>
                </tr>
              );
            })}
            {(o.shipping_fee_twd ?? 0) > 0 && (
              <>
                <tr>
                  <td colSpan={3} style={{ ...td, textAlign: 'right', color: '#666', fontSize: 13 }}>商品小計</td>
                  <td style={{ ...td, textAlign: 'right', color: '#666', fontSize: 13 }}>NT$ {o.total_twd.toLocaleString()}</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ ...td, textAlign: 'right', color: '#666', fontSize: 13 }}>運費{o.shipping_method ? `(${o.shipping_method})` : ''}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#666', fontSize: 13 }}>NT$ {o.shipping_fee_twd.toLocaleString()}</td>
                </tr>
              </>
            )}
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: 'right', fontWeight: 600 }}>總計</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: 16 }}>
                NT$ {(o.total_twd + (o.shipping_fee_twd ?? 0)).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={section}>
        <h2 style={h2}>客戶</h2>
        {o.users ? (
          <div style={{ fontSize: 14, display: 'grid', gap: 6 }}>
            <div>姓名(填):{o.users.full_name ?? '—'}</div>
            <div>
              <strong>LINE 顯示名:</strong>
              <code style={{ marginLeft: 6, padding: '2px 8px', background: '#fff7d6', borderRadius: 3, fontSize: 14, userSelect: 'all' }}>
                {o.users.display_name ?? '—'}
              </code>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>← LINE@ Manager 用這個搜尋對話</span>
            </div>
            <div>會員電話:{o.users.phone ?? '—'}</div>
          </div>
        ) : (
          <div style={{ fontSize: 14, display: 'grid', gap: 6 }}>
            <div style={{ color: '#888', fontSize: 12 }}>(訪客結帳,無 LINE 會員資料 — 客人聯絡資料看下方寄送資訊)</div>
            {o.guest_email && <div>Email:<code style={{ marginLeft: 6, padding: '2px 8px', background: '#fff7d6', borderRadius: 3, fontSize: 14, userSelect: 'all' }}>{o.guest_email}</code></div>}
            {o.guest_phone && <div>聯絡電話:{o.guest_phone}</div>}
          </div>
        )}
      </section>

      {/* 2026-09-11:對帳回饋改頂部滑入通知(shadcn Sonner 風格) */}
      {(justPaid || justShipped || justEdit || refundMsg) && (
        <FlashToast message={refundMsg ?? (justPaid ? '已標已付款' : justShipped ? (isPickup ? '已標已備貨' : '已標已出貨') : '已儲存訂單資料')} />
      )}

      {/* 對帳 quick actions(2026-05-22 加,未付/已付/已出貨 三狀態顯示) */}
      <section
        style={{
          marginBottom: 28,
          padding: 16,
          border: `1px solid ${isPaid ? '#bbf7d0' : '#fde68a'}`,
          background: isPaid ? '#f0fdf4' : '#fffbeb',
          borderRadius: 8,
        }}
      >
        {!isPaid ? (
          <>
            <h2 style={{ fontSize: 15, marginBottom: 4, color: '#92400e' }}>💰 確認收款</h2>
            {/* D#14:客人在訂單頁自助回報的後五碼直接帶入 */}
            {o.payment_reported_at && (
              <div style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, fontSize: 13, color: '#92400e', marginBottom: 10, fontWeight: 600 }}>
                💬 客人已回報後 5 碼「{o.payment_last5}」({formatTw(o.payment_reported_at)}),核對入帳後按下方確認。
              </div>
            )}
            <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 14px', lineHeight: 1.6 }}>
              核對銀行入帳後標記為已付款。標完訂單變綠、Dashboard 今日營收會算進去。
              {(o.shipping_fee_twd ?? 0) > 0 && (
                <> 應收金額 <strong>NT$ {(o.total_twd + o.shipping_fee_twd).toLocaleString()}</strong>(含運費 {o.shipping_fee_twd})。</>
              )}
            </p>
            <form action={markOrderPaid} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="tenant_slug" value={tenant.slug} />
              <label style={{ ...label, flex: '1 1 160px' }}>
                <span style={labelText}>後 5 碼(選填)</span>
                <input
                  name="payment_last5"
                  maxLength={5}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  style={input}
                  defaultValue={o.payment_last5 ?? ''}
                  placeholder="12345"
                />
              </label>
              <label style={{ ...label, flex: '1 1 140px' }}>
                <span style={labelText}>付款方式</span>
                <select name="payment_method" defaultValue={o.payment_method ?? 'bank'} style={input}>
                  <option value="bank">銀行轉帳</option>
                  <option value="cash">現金</option>
                  <option value="line_pay">LINE Pay</option>
                  <option value="ecpay_credit">信用卡(綠界)</option>
                  <option value="ecpay_atm">ATM 轉帳(綠界)</option>
                </select>
              </label>
              <SubmitButton pendingText="標記中…" confirmText="確定標記這筆訂單為「已收款」?">✓ 確認已收款</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 15, marginBottom: 8, color: '#15803d' }}>
              ✓ 已收款
              {o.payment_last5 && (
                <code style={{ marginLeft: 10, padding: '2px 8px', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
                  後 5 碼: {o.payment_last5}
                </code>
              )}
            </h2>
            <div style={{ fontSize: 13, color: '#15803d', lineHeight: 1.6 }}>
              收款時間 <strong>{formatTw(o.paid_at)}</strong>
              {o.payment_method && <> · 方式 {payMethodLabel(o.payment_method)}</>}
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
              {isPickup ? '標已備貨(待自取)' : '標已出貨'}
            </SubmitButton>
          </form>
        )}

        {isShipped && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #bbf7d0', fontSize: 13, color: '#0a7038' }}>
            {isPickup ? '已備貨(等待取貨)' : '已出貨'} {formatTw(o.shipped_at)}
          </div>
        )}
      </section>

      {/* Phase 17(2026-10-15):LINE Pay 退款 — 半自動,要填金額 + 二次確認。
          全額退會順便標訂單已退款並自動退庫存;部分退只退錢,狀態不動。 */}
      {o.payment_method === 'line_pay' && o.linepay_transaction_id && (() => {
        const grandTotal = o.total_twd + (o.shipping_fee_twd ?? 0);
        const alreadyRefunded = o.linepay_refunded_twd ?? 0;
        const remaining = grandTotal - alreadyRefunded;
        return (
          <section style={{ ...section, background: '#fff7ed', borderColor: '#fed7aa' }}>
            <h2 style={{ ...h2, color: '#9a3412' }}>LINE Pay 退款</h2>
            <div style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.7, marginBottom: 12 }}>
              交易序號 <code style={{ fontFamily: 'ui-monospace, monospace' }}>{o.linepay_transaction_id}</code>
              <br />
              實收 NT$ {grandTotal.toLocaleString()}
              {alreadyRefunded > 0 && <> · 已退 NT$ {alreadyRefunded.toLocaleString()}</>}
              {' '}· 可退 <strong>NT$ {remaining.toLocaleString()}</strong>
            </div>
            {remaining <= 0 ? (
              <div style={{ fontSize: 13, color: '#9a3412', fontWeight: 600 }}>此筆已全額退款完畢。</div>
            ) : (
              <form action={refundLinePayOrder} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="tenant_slug" value={tenant.slug} />
                <label style={{ ...label, flex: '0 1 160px' }}>
                  <span style={labelText}>退款金額(NT$)</span>
                  <input
                    name="refund_amount"
                    type="number"
                    min="1"
                    max={remaining}
                    defaultValue={remaining}
                    style={input}
                  />
                </label>
                <SubmitButton
                  variant="danger"
                  pendingText="退款中…"
                  confirmText={`確定要退款給客人嗎?退款不可取消,確認後款項會立刻退回客人的 LINE Pay。(訂單 ${o.order_no})`}
                >
                  送出退款
                </SubmitButton>
              </form>
            )}
            <div style={{ fontSize: 12, color: '#9a3412', marginTop: 10, lineHeight: 1.6 }}>
              預設帶全額。要部分退款(例如只退一項或扣掉運費)就改小金額,可以分次退到額滿。
              全額退完會自動把訂單標成「已退款」並退回庫存。
            </div>
          </section>
        );
      })()}

      {/* Phase 21(2026-10-22):綠界(信用卡 / ATM 虛擬帳號)資訊 — 收款由綠界通知自動標,
          退款在綠界廠商後台操作(信用卡可線上退刷;ATM 要人工匯回),這裡只看不動。 */}
      {(o.payment_method === 'ecpay_atm' || o.payment_method === 'ecpay_credit') && (
        <section style={{ ...section, background: '#f0fdfa', borderColor: '#99f6e4' }}>
          <h2 style={{ ...h2, color: '#115e59' }}>綠界 {o.payment_method === 'ecpay_atm' ? 'ATM 轉帳' : '信用卡'}</h2>
          <div style={{ fontSize: 13, color: '#134e4a', lineHeight: 1.8 }}>
            綠界交易編號{' '}
            <code style={{ fontFamily: 'ui-monospace, monospace' }}>{o.ecpay_trade_no ?? '—(尚未付款 / 取號)'}</code>
            {o.payment_method === 'ecpay_atm' && (
              <>
                <br />
                虛擬帳號 {o.atm_bank_code ?? '—'} /{' '}
                <code style={{ fontFamily: 'ui-monospace, monospace' }}>{o.atm_vaccount ?? '尚未取號'}</code>
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
            const grandTotal = o.total_twd + (o.shipping_fee_twd ?? 0);
            const alreadyRefunded = o.ecpay_refunded_twd ?? 0;
            const remaining = grandTotal - alreadyRefunded;
            return (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #99f6e4' }}>
                <div style={{ fontSize: 13, color: '#134e4a', lineHeight: 1.7, marginBottom: 10 }}>
                  實收 NT$ {grandTotal.toLocaleString()}
                  {alreadyRefunded > 0 && <> · 已退 NT$ {alreadyRefunded.toLocaleString()}</>}
                  {' '}· 可退 <strong>NT$ {Math.max(0, remaining).toLocaleString()}</strong>
                </div>
                {remaining <= 0 || o.payment_status !== 'paid' ? (
                  <div style={{ fontSize: 13, color: '#115e59', fontWeight: 600 }}>此筆已全額退款完畢。</div>
                ) : (
                  <form action={refundEcpayOrder} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="tenant_slug" value={tenant.slug} />
                    <label style={{ ...label, flex: '0 1 160px' }}>
                      <span style={labelText}>退款金額(NT$)</span>
                      <input
                        name="refund_amount"
                        type="number"
                        min="1"
                        max={remaining}
                        defaultValue={remaining}
                        style={input}
                      />
                    </label>
                    <SubmitButton
                      variant="danger"
                      pendingText="退款中…"
                      confirmText={`確定要退款給客人嗎?退款不可取消,確認後會立刻向綠界送出退款。(訂單 ${o.order_no})`}
                    >
                      送出退款
                    </SubmitButton>
                  </form>
                )}
                <div style={{ fontSize: 12, color: '#115e59', marginTop: 10, lineHeight: 1.6 }}>
                  預設帶全額。今天剛刷、還沒請款的單會用「放棄授權」退,不收任何手續費;已請款的用「退刷」,綠界退回 2.75% 手續費、扣 NT$1 處理費。
                  部分退款要等請款後(隔天早上 6 點後)才做得到。每天 20:15–20:30 綠界批次請款中不能退。
                  全額退完會自動把訂單標成「已退款」並退回庫存。
                </div>
              </div>
            );
          })() : (
            <div style={{ fontSize: 12, color: '#115e59', marginTop: 10, lineHeight: 1.6 }}>
              {o.payment_method === 'ecpay_atm'
                ? 'ATM 轉帳要退款請人工匯回客人帳戶,退完再把下方訂單狀態改成「已退款」。'
                : '這筆還沒收到綠界的付款通知,收款後這裡會出現退款功能。'}
            </div>
          )}
        </section>
      )}

      <section style={section}>
        <h2 style={h2}>狀態 / 出貨 / 備註(進階)</h2>
        <form action={updateOrder} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={label}>
              <span style={labelText}>訂單狀態</span>
              <select name="status" defaultValue={o.status} style={input}>
                <option value="open">待付款</option>
                <option value="paid">已付款</option>
                <option value="shipped">{isPickup ? '已備貨(自取)' : '已出貨'}</option>
                <option value="delivered">{isPickup ? '已取貨' : '已送達'}</option>
                <option value="cancelled">已取消(自動退庫存)</option>
                <option value="refunded">已退款(自動退庫存)</option>
              </select>
            </label>
            <label style={label}>
              <span style={labelText}>付款狀態</span>
              <select name="payment_status" defaultValue={o.payment_status} style={input}>
                <option value="pending">未付</option>
                <option value="paid">已付</option>
                <option value="failed">失敗</option>
                <option value="refunded">已退</option>
              </select>
            </label>
            <label style={label}>
              <span style={labelText}>付款方式</span>
              <input name="payment_method" defaultValue={o.payment_method ?? ''} list="payment_methods" style={input} placeholder="bank / cash / line_pay / ecpay_credit / ecpay_atm" />
              <datalist id="payment_methods">
                <option value="bank">銀行轉帳</option>
                <option value="cash">現金</option>
                <option value="line_pay">LINE Pay</option>
                <option value="ecpay_credit">信用卡(綠界)</option>
                <option value="ecpay_atm">ATM 轉帳(綠界)</option>
              </datalist>
            </label>
          </div>

          <label style={label}><span style={labelText}>收件人</span><input name="shipping_recipient" defaultValue={o.shipping_recipient ?? ''} style={input} /></label>
          <label style={label}><span style={labelText}>電話</span><input name="shipping_phone" defaultValue={o.shipping_phone ?? ''} style={input} /></label>
          <label style={label}><span style={labelText}>地址</span><input name="shipping_address" defaultValue={o.shipping_address ?? ''} style={input} /></label>
          <label style={label}><span style={labelText}>備註</span><textarea name="note" defaultValue={o.note ?? ''} rows={3} style={{ ...input, fontFamily: 'inherit' }} /></label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#666' }}>
            <span>付款時間:{formatTw(o.paid_at)}</span>
            <span>出貨時間:{formatTw(o.shipped_at)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>(狀態改 paid / shipped 時 trigger 自動填)</span>
          </div>

          <SubmitButton pendingText="儲存中…" confirmText="確定儲存這些訂單變更?">儲存</SubmitButton>
        </form>
      </section>
    </main>
  );
}
