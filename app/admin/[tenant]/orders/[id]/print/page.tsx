import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 訂單 A4 列印頁(2026-09-02,批次 B #18)。
 * 出貨單 / 訂單明細,開頁自動跳列印對話框。
 * @media print 藏掉 admin sidebar,@page 設 A4。
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
  total_twd: number;
  shipping_fee_twd: number | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  tracking_no: string | null;
  note: string | null;
  created_at: string;
  order_items: OrderItem[];
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

const statusMap: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨',
  delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};

export default async function OrderPrintPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_no, status, payment_status, payment_method, total_twd, shipping_fee_twd,
       shipping_recipient, shipping_phone, shipping_address, tracking_no, note, created_at,
       order_items(id, qty, price_at_purchase, subtotal_twd, products(name, sku), product_variants(variant_name, sku))`,
    )
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .maybeSingle();
  const o = (data ?? null) as unknown as OrderDetail | null;
  if (!o) notFound();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, background: '#fff', color: '#111', fontSize: 13, lineHeight: 1.6 }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: A4; margin: 14mm; }
@media print {
  .admin-sidebar, .no-print { display: none !important; }
  .admin-content { margin: 0 !important; padding: 0 !important; }
  body { background: #fff !important; }
}
.print-table { width: 100%; border-collapse: collapse; }
.print-table th, .print-table td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; }
.print-table th { background: #f3f3f3; text-align: left; }
          `,
        }}
      />
      {/* 開頁自動跳列印(稍等 render 完) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });`,
        }}
      />

      <div className="no-print" style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13 }}>
        🖨 列印視窗應會自動開啟;若沒有,請按 <strong>Ctrl + P</strong>(Mac:⌘ + P)。
      </div>

      {/* 表頭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{tenant.name} · 出貨單</div>
          <div style={{ color: '#555', marginTop: 2 }}>訂單編號:{o.order_no}</div>
        </div>
        <div style={{ textAlign: 'right', color: '#555' }}>
          <div>建立:{formatTw(o.created_at)}</div>
          <div>狀態:{statusMap[o.status] ?? o.status}</div>
        </div>
      </div>

      {/* 收件資訊 */}
      <table className="print-table" style={{ marginBottom: 16 }}>
        <tbody>
          <tr>
            <th style={{ width: 90 }}>收件人</th>
            <td>{o.shipping_recipient ?? '—'}</td>
            <th style={{ width: 90 }}>電話</th>
            <td>{o.shipping_phone ?? '—'}</td>
          </tr>
          <tr>
            <th>地址</th>
            <td colSpan={3}>{o.shipping_address ?? '—'}</td>
          </tr>
          {o.tracking_no && (
            <tr>
              <th>追蹤單號</th>
              <td colSpan={3}>{o.tracking_no}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 品項明細 */}
      <table className="print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>品名 / 規格</th>
            <th>SKU</th>
            <th style={{ textAlign: 'right' }}>單價</th>
            <th style={{ textAlign: 'right' }}>數量</th>
            <th style={{ textAlign: 'right' }}>小計</th>
          </tr>
        </thead>
        <tbody>
          {o.order_items.map((it, i) => {
            const vn = it.product_variants?.variant_name;
            return (
              <tr key={it.id}>
                <td style={{ width: 30, textAlign: 'center' }}>{i + 1}</td>
                <td>
                  {it.products?.name ?? '(已刪)'}
                  {vn && vn !== 'default' ? `(${vn})` : ''}
                </td>
                <td>{it.product_variants?.sku ?? it.products?.sku ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>NT$ {it.price_at_purchase.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{it.qty}</td>
                <td style={{ textAlign: 'right' }}>NT$ {it.subtotal_twd.toLocaleString()}</td>
              </tr>
            );
          })}
          {(o.shipping_fee_twd ?? 0) > 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'right', color: '#555' }}>運費</td>
              <td style={{ textAlign: 'right', color: '#555' }}>NT$ {(o.shipping_fee_twd ?? 0).toLocaleString()}</td>
            </tr>
          )}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>總計</td>
            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
              NT$ {(o.total_twd + (o.shipping_fee_twd ?? 0)).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>

      {o.note && (
        <div style={{ marginTop: 16, padding: '10px 12px', border: '1px dashed #999', borderRadius: 4 }}>
          <strong>備註:</strong>{o.note}
        </div>
      )}

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', color: '#555' }}>
        <span>揀貨確認:_____________</span>
        <span>出貨確認:_____________</span>
        <span>列印時間:{formatTw(new Date().toISOString())}</span>
      </div>
    </div>
  );
}
