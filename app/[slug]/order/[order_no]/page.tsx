import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { CopyButton } from './copy-button';
import { reportPaymentLast5 } from './actions';

type Props = {
  params: Promise<{ slug: string; order_no: string }>;
};

type OrderItemRow = {
  qty: number;
  price_at_purchase: number;
  subtotal_twd: number;
  variant_name: string | null;
  product_name: string;
};

type OrderDetail = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  shipping_method: string | null;
  shipping_fee_twd: number;
  payment_last5: string | null;
  payment_reported_at: string | null;
  invoice_tax_id: string | null;
  invoice_title: string | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  tracking_no: string | null;
  note: string | null;
  guest_email: string | null;
  created_at: string;
  items: OrderItemRow[];
};

async function getOrder(tenantId: string, orderNo: string): Promise<OrderDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, total_twd, shipping_method, shipping_fee_twd, payment_last5, payment_reported_at, invoice_tax_id, invoice_title, shipping_recipient, shipping_phone, shipping_address, tracking_no, note, guest_email, created_at, order_items(qty, price_at_purchase, subtotal_twd, products(name), product_variants(variant_name))',
    )
    .eq('tenant_id', tenantId)
    .eq('order_no', orderNo)
    .maybeSingle();

  if (error || !data) return null;

  // DB 回傳結構跟 OrderDetail 不同(有 order_items 而非 items),用 Omit 拆掉
  type Row = Omit<OrderDetail, 'items'> & {
    order_items: {
      qty: number;
      price_at_purchase: number;
      subtotal_twd: number;
      products: { name: string } | null;
      product_variants: { variant_name: string } | null;
    }[] | null;
  };
  const row = data as unknown as Row;
  const items: OrderItemRow[] = (row.order_items ?? []).map((i) => ({
    qty: i.qty,
    price_at_purchase: i.price_at_purchase,
    subtotal_twd: i.subtotal_twd,
    product_name: i.products?.name ?? '(已下架商品)',
    variant_name: i.product_variants?.variant_name ?? null,
  }));

  return {
    id: row.id,
    order_no: row.order_no,
    status: row.status,
    payment_status: row.payment_status,
    total_twd: row.total_twd,
    shipping_method: row.shipping_method ?? null,
    shipping_fee_twd: row.shipping_fee_twd ?? 0,
    payment_last5: row.payment_last5 ?? null,
    payment_reported_at: row.payment_reported_at ?? null,
    invoice_tax_id: row.invoice_tax_id ?? null,
    invoice_title: row.invoice_title ?? null,
    shipping_recipient: row.shipping_recipient,
    shipping_phone: row.shipping_phone,
    shipping_address: row.shipping_address,
    tracking_no: row.tracking_no ?? null,
    note: row.note,
    guest_email: row.guest_email,
    created_at: row.created_at,
    items,
  };
}

const STATUS_LABEL: Record<string, string> = {
  open: '待處理',
  paid: '已付款',
  shipped: '已寄出',
  delivered: '已送達',
  cancelled: '已取消',
  refunded: '已退款',
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: '等待匯款',
  paid: '已收款',
  failed: '付款失敗',
  refunded: '已退款',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { order_no } = await params;
  return { title: `訂單 ${order_no}` };
}

export default async function OrderPage({ params }: Props) {
  const { slug, order_no } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const order = await getOrder(tenant.id, order_no);
  if (!order) notFound();

  // 額外拉 tenant.contact_info + payment_info + shipping_rules(沒在 getTenantPublic)
  const { data: tenantExtra } = await supabaseAdmin
    .from('tenants')
    .select('contact_info, payment_info, shipping_rules')
    .eq('id', tenant.id)
    .maybeSingle();
  type ExtraRow = {
    contact_info: string | null;
    payment_info: string | null;
    shipping_rules: { options?: { key: string; label: string }[] } | null;
  } | null;
  const contactInfo = (tenantExtra as ExtraRow)?.contact_info ?? null;
  const paymentInfo = (tenantExtra as ExtraRow)?.payment_info ?? null;
  const shipLabel =
    ((tenantExtra as ExtraRow)?.shipping_rules?.options ?? []).find(
      (o) => o.key === order.shipping_method,
    )?.label ?? null;
  const grandTotal = order.total_twd + order.shipping_fee_twd;

  const createdAt = new Date(order.created_at).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 2026-09-08:狀態感知頁首 — 回頭查單第一眼就看到目前進度(原本永遠顯示「訂單已成立」)
  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  const stage =
    order.status === 'delivered' ? 3 : order.status === 'shipped' ? 2 : order.payment_status === 'paid' ? 1 : 0;
  const banner = isCancelled
    ? {
        icon: order.status === 'cancelled' ? '✕' : '↩',
        title: order.status === 'cancelled' ? '訂單已取消' : '訂單已退款',
        bg: '#f4f4f5', border: '#e4e4e7', color: '#52525b',
      }
    : stage === 0
      ? order.payment_reported_at
        ? { icon: '🕐', title: '已回報匯款,等待賣家核帳', bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
        : { icon: '🕐', title: '訂單成立,等待匯款', bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
      : stage === 1
        ? { icon: '✓', title: '已收款,商品準備中', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' }
        : stage === 2
          ? { icon: '📦', title: '已出貨', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' }
          : { icon: '🎉', title: '已送達,感謝您的訂購', bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' };
  const steps = ['下單', '付款', '出貨', '送達'];

  return (
    <div>
      <div
        style={{
          padding: '1.5rem 1.25rem 1.25rem',
          background: banner.bg,
          border: `1px solid ${banner.border}`,
          borderRadius: 8,
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: banner.color, marginBottom: '0.25rem' }}>
          {banner.icon} {banner.title}
        </div>
        <div style={{ color: banner.color, fontSize: '0.875rem' }}>
          訂單編號 <strong>{order.order_no}</strong>
          <CopyButton text={order.order_no} />
        </div>

        {/* 進度條(取消/退款不顯示) */}
        {!isCancelled && (
          <div style={{ display: 'flex', alignItems: 'center', maxWidth: 340, margin: '1rem auto 0' }}>
            {steps.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i === 0 ? '0 0 auto' : 1 }}>
                {i > 0 && (
                  <div style={{ flex: 1, height: 2, background: i <= stage ? banner.color : '#e5e7eb', margin: '0 4px', marginBottom: 16 }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: i <= stage ? banner.color : '#fff',
                      border: `2px solid ${i <= stage ? banner.color : '#d1d5db'}`,
                      color: '#fff', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {i < stage || (i === stage && stage > 0) ? '✓' : i === stage ? '•' : ''}
                  </div>
                  <span style={{ fontSize: 11, color: i <= stage ? banner.color : '#9ca3af', fontWeight: i === stage ? 700 : 400 }}>
                    {s}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {stage === 0 && !isCancelled && (paymentInfo ? (
        <section
          style={{
            padding: '1.25rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.5rem', fontSize: '1rem' }}>
            💰 下一步:匯款
          </div>
          <div
            style={{
              color: '#78350f',
              fontSize: '0.9375rem',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              padding: '0.75rem 1rem',
              background: '#fff',
              border: '1px solid #fde68a',
              borderRadius: 6,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              marginTop: '0.5rem',
            }}
          >
            {paymentInfo}
          </div>
          <div style={{ marginTop: '0.75rem', color: '#92400e', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            💡 匯款完成後,直接在下方填寫帳號<strong>後 5 碼</strong>,不用另外聯絡客服。
          </div>
        </section>
      ) : (
        <div
          style={{
            padding: '1.25rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.5rem' }}>
            下一步:等候匯款資訊
          </div>
          <div style={{ color: '#78350f', fontSize: '0.875rem', lineHeight: 1.6 }}>
            賣家會主動私訊您匯款方式。請保留此訂單編號,完成匯款後通知賣家對帳。
          </div>
        </div>
      ))}

      {/* D#14(2026-09-02):匯款後 5 碼自助回報
          2026-09-08 改版:id=report 錨點(LINE 卡片按鈕直接跳到這)+ 醒目大卡設計 */}
      {isCancelled ? null : order.payment_status === 'paid' ? (
        <section id="report" style={{ scrollMarginTop: 16, padding: '1rem 1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, marginBottom: '1rem', fontSize: '0.9375rem', color: '#15803d', fontWeight: 600 }}>
          ✓ 已收到您的款項,無需再回報。
        </section>
      ) : order.payment_reported_at ? (
        <section id="report" style={{ scrollMarginTop: 16, padding: '1.25rem', background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, marginBottom: '1rem' }}>
          <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#15803d' }}>
            ✓ 已回報後 5 碼
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.3em', color: '#166534' }}>
              {order.payment_last5}
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              {new Date(order.payment_reported_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 送出 · 等待賣家核帳
            </span>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: '0.8125rem', color: '#6b7280', cursor: 'pointer' }}>填錯了?重新回報</summary>
            <form action={reportPaymentLast5} style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <input type="hidden" name="tenant_slug" value={slug} />
              <input type="hidden" name="order_no" value={order.order_no} />
              <input
                name="last5"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                required
                placeholder="•••••"
                style={{ flex: '1 1 150px', padding: '0.75rem', border: '2px solid #d1d5db', borderRadius: 10, fontSize: '1.25rem', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.3em', textAlign: 'center' }}
              />
              <button type="submit" style={{ flex: '0 0 auto', padding: '0.75rem 1.5rem', background: '#1f2937', color: '#fff', border: 0, borderRadius: 10, fontSize: '0.9375rem', fontWeight: 700, cursor: 'pointer' }}>
                更新
              </button>
            </form>
          </details>
        </section>
      ) : (
        <section
          id="report"
          style={{
            scrollMarginTop: 16,
            padding: '1.5rem 1.25rem',
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: 12,
            marginBottom: '1rem',
            boxShadow: '0 2px 10px rgba(245, 158, 11, 0.18)',
          }}
        >
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#92400e' }}>
            ✏️ 匯款完成了嗎?
          </div>
          <p style={{ margin: '6px 0 14px', fontSize: '0.875rem', color: '#78350f', lineHeight: 1.6 }}>
            填入您匯出帳戶的<strong>後 5 碼數字</strong>並送出,賣家核帳後就會把訂單標為已付款——不用另外聯絡客服。
          </p>
          <form action={reportPaymentLast5} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="hidden" name="tenant_slug" value={slug} />
            <input type="hidden" name="order_no" value={order.order_no} />
            <input
              name="last5"
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              required
              placeholder="•••••"
              aria-label="匯款帳號後 5 碼"
              style={{
                flex: '1 1 160px',
                minWidth: 0,
                padding: '0.875rem',
                border: '2px solid #f59e0b',
                borderRadius: 10,
                fontSize: '1.375rem',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                letterSpacing: '0.35em',
                textAlign: 'center',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              style={{
                flex: '1 0 auto',
                minHeight: 52,
                padding: '0.875rem 1.5rem',
                background: '#b45309',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                fontSize: '1rem',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(180, 83, 9, 0.3)',
              }}
            >
              送出回報 ✓
            </button>
          </form>
        </section>
      )}

      {contactInfo && (
        <section
          style={{
            padding: '1.25rem',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', color: '#6b7280', fontWeight: 500 }}>
            聯絡賣家
          </h3>
          <div
            style={{
              fontSize: '0.875rem',
              color: '#374151',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
            }}
          >
            {contactInfo}
          </div>
        </section>
      )}

      <section
        style={{
          padding: '1.25rem',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', color: '#6b7280', fontWeight: 500 }}>
          訂單明細
        </h3>
        {order.items.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              padding: '0.5rem 0',
              borderBottom: idx < order.items.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}
          >
            <div style={{ flex: 1, paddingRight: '0.5rem' }}>
              <div style={{ color: '#111827' }}>{item.product_name}</div>
              <div style={{ color: '#9ca3af', fontSize: '0.8125rem', marginTop: 2 }}>
                {item.variant_name && <>{item.variant_name} · </>}NT$ {item.price_at_purchase.toLocaleString()} × {item.qty}
              </div>
            </div>
            <div style={{ fontWeight: 500 }}>NT$ {item.subtotal_twd.toLocaleString()}</div>
          </div>
        ))}
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {(order.shipping_fee_twd > 0 || order.shipping_method) && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
                <span>商品小計</span>
                <span>NT$ {order.total_twd.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
                <span>運費{shipLabel ? `(${shipLabel})` : ''}</span>
                <span style={{ color: order.shipping_fee_twd === 0 ? '#15803d' : undefined }}>
                  {order.shipping_fee_twd === 0 ? '免運' : `NT$ ${order.shipping_fee_twd.toLocaleString()}`}
                </span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600 }}>
            <span>應付總額</span>
            <span style={{ color: '#b45309' }}>NT$ {grandTotal.toLocaleString()}</span>
          </div>
        </div>
      </section>

      <section
        style={{
          padding: '1.25rem',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', color: '#6b7280', fontWeight: 500 }}>
          寄送資訊
        </h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '5rem 1fr', gap: '0.5rem 1rem', margin: 0, fontSize: '0.875rem' }}>
          <dt style={{ color: '#9ca3af' }}>收件人</dt>
          <dd style={{ margin: 0 }}>{order.shipping_recipient}</dd>
          <dt style={{ color: '#9ca3af' }}>電話</dt>
          <dd style={{ margin: 0 }}>{order.shipping_phone}</dd>
          <dt style={{ color: '#9ca3af' }}>地址</dt>
          <dd style={{ margin: 0 }}>{order.shipping_address}</dd>
          {order.guest_email && (
            <>
              <dt style={{ color: '#9ca3af' }}>Email</dt>
              <dd style={{ margin: 0 }}>{order.guest_email}</dd>
            </>
          )}
          {order.invoice_tax_id && (
            <>
              <dt style={{ color: '#9ca3af' }}>統一編號</dt>
              <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>{order.invoice_tax_id}</dd>
            </>
          )}
          {order.invoice_title && (
            <>
              <dt style={{ color: '#9ca3af' }}>發票抬頭</dt>
              <dd style={{ margin: 0 }}>{order.invoice_title}</dd>
            </>
          )}
          {order.note && (
            <>
              <dt style={{ color: '#9ca3af' }}>備註</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{order.note}</dd>
            </>
          )}
        </dl>
      </section>

      <section
        style={{
          padding: '1.25rem',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9375rem', color: '#6b7280', fontWeight: 500 }}>
          狀態
        </h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '5rem 1fr', gap: '0.5rem 1rem', margin: 0, fontSize: '0.875rem' }}>
          <dt style={{ color: '#9ca3af' }}>訂單</dt>
          <dd style={{ margin: 0 }}>{STATUS_LABEL[order.status] ?? order.status}</dd>
          <dt style={{ color: '#9ca3af' }}>付款</dt>
          <dd style={{ margin: 0 }}>{PAYMENT_LABEL[order.payment_status] ?? order.payment_status}</dd>
          {order.tracking_no && (
            <>
              <dt style={{ color: '#9ca3af' }}>追蹤單號</dt>
              <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>{order.tracking_no}</dd>
            </>
          )}
          <dt style={{ color: '#9ca3af' }}>下單時間</dt>
          <dd style={{ margin: 0 }}>{createdAt}</dd>
        </dl>
      </section>

      <a
        href={`/${slug}`}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '0.75rem',
          color: '#6b7280',
          textDecoration: 'none',
          fontSize: '0.9375rem',
        }}
      >
        回攤位
      </a>
    </div>
  );
}
