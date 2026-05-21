import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { updateOrder, markOrderPaid, markOrderShipped } from '../../../actions';

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
  total_twd: number;
  source: string;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  tracking_no: string | null;
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
      `id, order_no, status, payment_status, payment_method, payment_last5, total_twd, source,
       shipping_recipient, shipping_phone, shipping_address, tracking_no, note,
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
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const o = await getOrder(tenant.id, id);
  if (!o) notFound();

  const justPaid = sp.saved === 'paid';
  const justShipped = sp.saved === 'shipped';
  const isPaid = o.payment_status === 'paid';
  const isShipped = o.status === 'shipped' || o.status === 'delivered';

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Link href={`/admin/${tenant.slug}/orders`} style={{ color: '#666', fontSize: 13 }}>
        ← 返回 {tenant.name} 訂單列表
      </Link>

      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
        訂單 {o.order_no}
        <span style={{ display: 'inline-block', padding: '2px 10px', background: sourceColor(o.source) + '22', color: sourceColor(o.source), borderRadius: 3, fontSize: 13, fontWeight: 500 }}>
          {sourceLabel(o.source)}
        </span>
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        建立 {formatTw(o.created_at)} · 最後更新 {formatTw(o.updated_at)}
      </p>

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
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: 'right', fontWeight: 600 }}>總計</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: 16 }}>NT$ {o.total_twd.toLocaleString()}</td>
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

      {/* 對帳 banner(剛確認後顯示) */}
      {(justPaid || justShipped) && (
        <div
          style={{
            padding: '10px 16px',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          ✓ {justPaid ? '已標已付款' : '已標已出貨'}
        </div>
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
            <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 14px', lineHeight: 1.6 }}>
              客人匯款後告知後 5 碼,在這裡標記為已付款。標完訂單變綠、Dashboard 今日營收會算進去。
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
                  placeholder="12345"
                />
              </label>
              <label style={{ ...label, flex: '1 1 140px' }}>
                <span style={labelText}>付款方式</span>
                <select name="payment_method" defaultValue={o.payment_method ?? 'bank'} style={input}>
                  <option value="bank">銀行轉帳</option>
                  <option value="cash">現金</option>
                  <option value="line_pay">LINE Pay</option>
                </select>
              </label>
              <button
                type="submit"
                style={{
                  padding: '10px 18px',
                  background: '#16a34a',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✓ 確認已收款
              </button>
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
              {o.payment_method && <> · 方式 {o.payment_method}</>}
            </div>
          </>
        )}

        {/* 已付款 → 顯示「標已出貨」按鈕 */}
        {isPaid && !isShipped && (
          <form action={markOrderShipped} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #bbf7d0', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <label style={{ ...label, flex: '1 1 200px' }}>
              <span style={labelText}>📦 標已出貨(選填追蹤單號)</span>
              <input name="tracking_no" defaultValue={o.tracking_no ?? ''} style={input} placeholder="例:7-11 取貨號 / 黑貓單號" />
            </label>
            <button
              type="submit"
              style={{
                padding: '10px 18px',
                background: '#0070f3',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              📦 標已出貨
            </button>
          </form>
        )}

        {isShipped && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #bbf7d0', fontSize: 13, color: '#0a7038' }}>
            📦 已出貨 {formatTw(o.shipped_at)} {o.tracking_no && <>· 追蹤單號 <code style={{ padding: '2px 6px', background: '#fff', borderRadius: 3 }}>{o.tracking_no}</code></>}
          </div>
        )}
      </section>

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
                <option value="shipped">已出貨</option>
                <option value="delivered">已送達</option>
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
              <input name="payment_method" defaultValue={o.payment_method ?? ''} list="payment_methods" style={input} placeholder="bank / cash / line_pay" />
              <datalist id="payment_methods">
                <option value="bank">銀行轉帳</option>
                <option value="cash">現金</option>
                <option value="line_pay">LINE Pay</option>
              </datalist>
            </label>
            <label style={label}>
              <span style={labelText}>追蹤單號</span>
              <input name="tracking_no" defaultValue={o.tracking_no ?? ''} style={input} />
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

          <button type="submit" style={btn}>儲存</button>
        </form>
      </section>
    </main>
  );
}
