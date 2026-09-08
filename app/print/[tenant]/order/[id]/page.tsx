import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 訂單 A4 列印頁(2026-09-02,批次 B #18)。
 * 2026-09-08 改版:品牌化設計 — 攤位 logo + 店名 + 主題色點綴、
 * 輕量表格、簽收欄、感謝語、聯絡資訊。黑白列印也清晰。
 * 2026-09-08 v2:搬出 /admin 版型(原本後台手機版 CSS 會把表格拆直排、
 * ☰ 鈕也被印出來)。獨立路徑 /print/*,middleware 一樣要求登入。
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

  // 品牌資訊(logo_url 在 getTenantBySlug 已有;主題色 / 聯絡資訊 / 運費規則另拉)
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
  const brand = (tExtra as TExtra)?.brand_color ?? '#1f2937';
  const contactInfo = (tExtra as TExtra)?.contact_info ?? null;

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_no, status, payment_status, payment_method, total_twd, shipping_fee_twd, shipping_method,
       shipping_recipient, shipping_phone, shipping_address, tracking_no, note, created_at,
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
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 28, background: '#fff', color: '#1c1917', fontSize: 13, lineHeight: 1.65, fontFamily: '-apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: A4; margin: 12mm; }
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.slip-table { width: 100%; border-collapse: collapse; }
.slip-table th {
  text-align: left; font-size: 11px; letter-spacing: 0.06em; color: #78716c;
  padding: 8px 10px; border-bottom: 2px solid #1c1917; font-weight: 700;
}
.slip-table td { padding: 9px 10px; border-bottom: 1px solid #e7e5e4; font-size: 13px; }
.slip-table tr:last-child td { border-bottom: 0; }
          `,
        }}
      />
      {/* 開頁自動跳列印(稍等 render 完) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });`,
        }}
      />

      <div className="no-print" style={{ marginBottom: 18, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13 }}>
        🖨 列印視窗應會自動開啟;若沒有,請按 <strong>Ctrl + P</strong>(Mac:⌘ + P)。
      </div>

      {/* ── 表頭:logo + 店名 + 單號 ── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16 }}>
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={tenant.name}
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${brand}`, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, flexShrink: 0 }}>
            {tenant.name.slice(0, 1)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: brand, letterSpacing: '0.02em' }}>{tenant.name}</div>
          <div style={{ fontSize: 11, color: '#78716c', letterSpacing: '0.18em', fontWeight: 600, marginTop: 2 }}>
            出貨單 · PACKING SLIP
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{o.order_no}</div>
          <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>{formatTw(o.created_at)}</div>
          <div style={{ display: 'inline-block', marginTop: 4, padding: '2px 10px', border: `1.5px solid ${brand}`, borderRadius: 999, fontSize: 11, fontWeight: 700, color: brand }}>
            {statusMap[o.status] ?? o.status}
          </div>
        </div>
      </header>
      <div style={{ height: 3, background: brand, borderRadius: 2, marginBottom: 18 }} />

      {/* ── 收件資訊 ── */}
      <section style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', background: '#fafaf9', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#78716c', fontWeight: 700, marginBottom: 6 }}>收件資訊 SHIP TO</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{o.shipping_recipient ?? '—'}</div>
          <div style={{ marginTop: 2 }}>{o.shipping_phone ?? '—'}</div>
          <div style={{ marginTop: 2, color: '#44403c' }}>{o.shipping_address ?? '—'}</div>
        </div>
        <div style={{ flex: '1 1 200px', background: '#fafaf9', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#78716c', fontWeight: 700, marginBottom: 6 }}>配送 DELIVERY</div>
          <div>{shipLabel ?? '—'}</div>
          {o.tracking_no && (
            <div style={{ marginTop: 4 }}>
              單號:<span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{o.tracking_no}</span>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 12, color: '#78716c' }}>
            付款:{o.payment_status === 'paid' ? '✓ 已收款' : '待付款'}
          </div>
        </div>
      </section>

      {/* ── 品項明細 ── */}
      <table className="slip-table" style={{ marginBottom: 6 }}>
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>品名 / 規格</th>
            <th style={{ width: 90 }}>SKU</th>
            <th style={{ width: 80, textAlign: 'right' }}>單價</th>
            <th style={{ width: 50, textAlign: 'right' }}>數量</th>
            <th style={{ width: 90, textAlign: 'right' }}>小計</th>
          </tr>
        </thead>
        <tbody>
          {o.order_items.map((it, i) => {
            const vn = it.product_variants?.variant_name;
            return (
              <tr key={it.id}>
                <td style={{ color: '#a8a29e' }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>
                  {it.products?.name ?? '(已刪)'}
                  {vn && vn !== 'default' ? <span style={{ color: '#78716c' }}>({vn})</span> : ''}
                </td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#78716c' }}>
                  {it.product_variants?.sku ?? it.products?.sku ?? '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{it.price_at_purchase.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{it.qty}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{it.subtotal_twd.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── 金額 ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
        <div style={{ width: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 12.5, color: '#57534e' }}>
            <span>商品小計</span>
            <span>NT$ {o.total_twd.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 12.5, color: '#57534e' }}>
            <span>運費{shipLabel ? `(${shipLabel})` : ''}</span>
            <span>{(o.shipping_fee_twd ?? 0) === 0 ? '免運' : `NT$ ${(o.shipping_fee_twd ?? 0).toLocaleString()}`}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', marginTop: 4, background: '#1c1917', color: '#fff', borderRadius: 8, fontWeight: 800, fontSize: 15 }}>
            <span>應付總額</span>
            <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>NT$ {grand.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {o.note && (
        <div style={{ marginBottom: 22, padding: '10px 14px', background: '#fffbeb', border: '1px dashed #d6b25e', borderRadius: 8 }}>
          <strong>備註:</strong>{o.note}
        </div>
      )}

      {/* ── 簽收欄 ── */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 22 }}>
        {['揀貨確認', '出貨確認', '收件簽收'].map((t) => (
          <div key={t} style={{ flex: 1 }}>
            <div style={{ borderBottom: '1.5px solid #a8a29e', height: 40 }} />
            <div style={{ fontSize: 11, color: '#78716c', marginTop: 4, textAlign: 'center' }}>{t}</div>
          </div>
        ))}
      </div>

      {/* ── 頁尾 ── */}
      <footer style={{ borderTop: `2px solid ${brand}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, color: '#78716c', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {contactInfo ?? ''}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand }}>感謝您的訂購!</div>
          <div style={{ fontSize: 10, color: '#a8a29e', marginTop: 2 }}>列印時間 {formatTw(new Date().toISOString())}</div>
        </div>
      </footer>
    </div>
  );
}
