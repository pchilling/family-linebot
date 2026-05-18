import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { updateOrder } from '../../actions';

const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

type OrderItem = {
  id: string;
  qty: number;
  price_at_purchase: number;
  subtotal_twd: number;
  products: { name: string; sku: string | null } | null;
};

type OrderDetail = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_twd: number;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  tracking_no: string | null;
  note: string | null;
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

async function getOrder(id: string): Promise<OrderDetail | null> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_no, status, payment_status, payment_method, total_twd,
       shipping_recipient, shipping_phone, shipping_address, tracking_no, note,
       paid_at, shipped_at, created_at, updated_at,
       users(line_user_id, display_name, full_name, phone),
       order_items(id, qty, price_at_purchase, subtotal_twd, products(name, sku))`,
    )
    .eq('tenant_id', TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as unknown as OrderDetail | null;
}

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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const o = await getOrder(id);
  if (!o) notFound();

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Link href="/admin/orders" style={{ color: '#666', fontSize: 13 }}>
        ← 返回訂單列表
      </Link>

      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 4 }}>
        訂單 {o.order_no}
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
            {o.order_items.map((it) => (
              <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  {it.products?.name ?? '(已刪)'}
                  {it.products?.sku && (
                    <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                      SKU {it.products.sku}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  NT$ {it.price_at_purchase.toLocaleString()}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>
                  NT$ {it.subtotal_twd.toLocaleString()}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                總計
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: 16 }}>
                NT$ {o.total_twd.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={section}>
        <h2 style={h2}>客戶</h2>
        <div style={{ fontSize: 14, display: 'grid', gap: 6 }}>
          <div>姓名:{o.users?.full_name ?? o.users?.display_name ?? '—'}</div>
          <div>LINE 顯示名:{o.users?.display_name ?? '—'}</div>
          <div>會員電話:{o.users?.phone ?? '—'}</div>
          <div style={{ paddingTop: 6, borderTop: '1px dashed #ddd', marginTop: 4 }}>
            LINE userId:
            <code
              style={{
                marginLeft: 8,
                padding: '2px 6px',
                background: '#f0f0f0',
                borderRadius: 3,
                fontSize: 12,
                userSelect: 'all',
              }}
            >
              {o.users?.line_user_id ?? '—'}
            </code>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
              (LINE@ Manager 搜尋此 ID 找到對話)
            </span>
          </div>
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>狀態 / 出貨 / 備註</h2>
        <form action={updateOrder} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="id" value={o.id} />

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
              <input
                name="payment_method"
                defaultValue={o.payment_method ?? ''}
                list="payment_methods"
                style={input}
                placeholder="bank / cash / line_pay"
              />
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

          <label style={label}>
            <span style={labelText}>收件人</span>
            <input
              name="shipping_recipient"
              defaultValue={o.shipping_recipient ?? ''}
              style={input}
            />
          </label>
          <label style={label}>
            <span style={labelText}>電話</span>
            <input
              name="shipping_phone"
              defaultValue={o.shipping_phone ?? ''}
              style={input}
            />
          </label>
          <label style={label}>
            <span style={labelText}>地址</span>
            <input
              name="shipping_address"
              defaultValue={o.shipping_address ?? ''}
              style={input}
            />
          </label>
          <label style={label}>
            <span style={labelText}>備註</span>
            <textarea
              name="note"
              defaultValue={o.note ?? ''}
              rows={3}
              style={{ ...input, fontFamily: 'inherit' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#666' }}>
            <span>付款時間:{formatTw(o.paid_at)}</span>
            <span>出貨時間:{formatTw(o.shipped_at)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>
              (狀態改 paid / shipped 時 trigger 自動填)
            </span>
          </div>

          <button type="submit" style={btn}>儲存</button>
        </form>
      </section>
    </main>
  );
}

const section: React.CSSProperties = {
  marginBottom: 28,
  padding: 16,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fafafa',
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12 };
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  fontWeight: 600,
  fontSize: 13,
  color: '#444',
};
const td: React.CSSProperties = { padding: '10px 8px' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', marginBottom: 4 };
const input: React.CSSProperties = {
  padding: 8,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  padding: 12,
  background: '#000',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  fontSize: 14,
  cursor: 'pointer',
};
