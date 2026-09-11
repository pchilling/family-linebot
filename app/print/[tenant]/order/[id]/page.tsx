import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 訂單 A4 出貨單(批次 B #18)。
 * 2026-09-08 v3:參考 Shopify 系出貨單重設計 — 排版取代色塊:
 * 大量留白、細線分隔、單一品牌色點綴、無圓角卡片。黑白列印同樣專業。
 * 獨立路徑 /print/*(脫離 admin 版型),middleware 要求登入。
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabaseAdmin.from('orders').select('order_no').eq('id', id).maybeSingle();
  const orderNo = (data as { order_no?: string } | null)?.order_no;
  return { title: orderNo ? `出貨單 ${orderNo}` : '出貨單' };
}

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
  shipping_method: string | null;
  invoice_tax_id: string | null;
  invoice_title: string | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  note: string | null;
  created_at: string;
  order_items: OrderItem[];
};

function formatDateTw(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const statusMap: Record<string, string> = {
  open: '待付款', paid: '已付款', shipped: '已出貨',
  delivered: '已送達', cancelled: '已取消', refunded: '已退款',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.16em',
  color: '#9ca3af',
  fontWeight: 700,
  marginBottom: 8,
};

export default async function OrderPrintPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const { data: tExtra } = await supabaseAdmin
    .from('tenants')
    .select('brand_color, contact_info, shipping_rules')
    .eq('id', tenant.id)
    .maybeSingle();
  type TExtra = {
    brand_color: string | null;
    contact_info: string | null;
    shipping_rules: { options?: { key: string; label: string }[] } | null;
  } | null;
  const brand = (tExtra as TExtra)?.brand_color ?? '#111827';
  const contactInfo = (tExtra as TExtra)?.contact_info ?? null;

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_no, status, payment_status, payment_method, total_twd, shipping_fee_twd, shipping_method,
       invoice_tax_id, invoice_title,
       shipping_recipient, shipping_phone, shipping_address, note, created_at,
       order_items(id, qty, price_at_purchase, subtotal_twd, products(name, sku), product_variants(variant_name, sku))`,
    )
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .maybeSingle();
  const o = (data ?? null) as unknown as OrderDetail | null;
  if (!o) notFound();

  const shipLabel =
    ((tExtra as TExtra)?.shipping_rules?.options ?? []).find((opt) => opt.key === o.shipping_method)
      ?.label ?? null;
  const grand = o.total_twd + (o.shipping_fee_twd ?? 0);

  return (
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '40px 32px',
        background: '#fff',
        color: '#111827',
        fontSize: 13,
        lineHeight: 1.7,
        fontFamily: '-apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: A4; margin: 14mm; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.items th {
  text-align: left; font-size: 10px; letter-spacing: 0.14em; color: #9ca3af; font-weight: 700;
  padding: 0 0 8px; border-bottom: 1px solid #111827;
}
.items td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.num { font-variant-numeric: tabular-nums; font-family: inherit; }
          `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });`,
        }}
      />

      <div className="no-print" style={{ marginBottom: 24, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13 }}>
        🖨 列印視窗應會自動開啟;若沒有,請按 <strong>Ctrl + P</strong>(Mac:⌘ + P)。
        建議在列印設定關閉「頁首及頁尾」。
      </div>

      {/* ── 表頭:左 logo+店名,右 文件名+單號 ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tenant.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt=""
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.01em' }}>{tenant.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.22em', color: '#9ca3af', fontWeight: 700 }}>出貨單</div>
          <div className="num" style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{o.order_no}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDateTw(o.created_at)}</div>
        </div>
      </header>
      <div style={{ height: 2, background: brand, marginBottom: 28 }} />

      {/* ── 收件 / 訂單資訊 兩欄 ── */}
      <section style={{ display: 'flex', gap: 40, marginBottom: 32 }}>
        <div style={{ flex: 1 }}>
          <div style={sectionLabel}>寄送至</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{o.shipping_recipient ?? '—'}</div>
          <div>{o.shipping_phone ?? ''}</div>
          <div style={{ color: '#374151' }}>{o.shipping_address ?? ''}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={sectionLabel}>訂單資訊</div>
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', rowGap: 2, fontSize: 12.5 }}>
            <span style={{ color: '#9ca3af' }}>狀態</span>
            <span>{statusMap[o.status] ?? o.status}</span>
            <span style={{ color: '#9ca3af' }}>付款</span>
            <span>{o.payment_status === 'paid' ? '已收款' : '待付款'}</span>
            <span style={{ color: '#9ca3af' }}>配送</span>
            <span>{shipLabel ?? '—'}</span>
            {o.invoice_tax_id && (
              <>
                <span style={{ color: '#9ca3af' }}>統一編號</span>
                <span className="num">{o.invoice_tax_id}</span>
              </>
            )}
            {o.invoice_title && (
              <>
                <span style={{ color: '#9ca3af' }}>發票抬頭</span>
                <span>{o.invoice_title}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 品項 ── */}
      <table className="items" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <thead>
          <tr>
            <th>品項</th>
            <th style={{ textAlign: 'right', width: 90 }}>單價</th>
            <th style={{ textAlign: 'right', width: 56 }}>數量</th>
            <th style={{ textAlign: 'right', width: 100 }}>小計</th>
          </tr>
        </thead>
        <tbody>
          {o.order_items.map((it) => {
            const vn = it.product_variants?.variant_name;
            const sku = it.product_variants?.sku ?? it.products?.sku;
            return (
              <tr key={it.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    {it.products?.name ?? '(已刪)'}
                    {vn && vn !== 'default' && <span style={{ fontWeight: 400, color: '#6b7280' }}> · {vn}</span>}
                  </div>
                  {sku && (
                    <div className="num" style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sku}</div>
                  )}
                </td>
                <td className="num" style={{ textAlign: 'right', color: '#374151' }}>
                  NT$ {it.price_at_purchase.toLocaleString()}
                </td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{it.qty}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                  NT$ {it.subtotal_twd.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── 金額 ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 36 }}>
        <div style={{ width: 250, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#374151' }}>
            <span>小計</span>
            <span className="num">NT$ {o.total_twd.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 10px', color: '#374151' }}>
            <span>運費{shipLabel ? `(${shipLabel})` : ''}</span>
            <span className="num">
              {(o.shipping_fee_twd ?? 0) === 0 ? '免運' : `NT$ ${(o.shipping_fee_twd ?? 0).toLocaleString()}`}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: `2px solid ${brand}`, fontSize: 16, fontWeight: 700 }}>
            <span>總計</span>
            <span className="num">NT$ {grand.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {o.note && (
        <section style={{ marginBottom: 32 }}>
          <div style={sectionLabel}>備註</div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{o.note}</div>
        </section>
      )}

      {/* ── 簽名欄(2026-09-11:只留出貨一格)── */}
      <section style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40, marginTop: 8 }}>
        <div style={{ width: 260, textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #d1d5db', height: 44 }} />
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#9ca3af', marginTop: 6, fontWeight: 700 }}>出貨簽名</div>
        </div>
      </section>

      {/* ── 頁尾 ── */}
      <footer style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>感謝您的訂購!</div>
        {contactInfo && (
          <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 6 }}>
            {contactInfo}
          </div>
        )}
      </footer>
    </div>
  );
}
