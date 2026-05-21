import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { CopyButton } from './copy-button';

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
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  note: string | null;
  guest_email: string | null;
  created_at: string;
  items: OrderItemRow[];
};

async function getOrder(tenantId: string, orderNo: string): Promise<OrderDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, total_twd, shipping_recipient, shipping_phone, shipping_address, note, guest_email, created_at, order_items(qty, price_at_purchase, subtotal_twd, products(name), product_variants(variant_name))',
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
    shipping_recipient: row.shipping_recipient,
    shipping_phone: row.shipping_phone,
    shipping_address: row.shipping_address,
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

  // 額外拉 tenant.contact_info + payment_info(沒在 getTenantPublic)
  const { data: tenantExtra } = await supabaseAdmin
    .from('tenants')
    .select('contact_info, payment_info')
    .eq('id', tenant.id)
    .maybeSingle();
  type ExtraRow = { contact_info: string | null; payment_info: string | null } | null;
  const contactInfo = (tenantExtra as ExtraRow)?.contact_info ?? null;
  const paymentInfo = (tenantExtra as ExtraRow)?.payment_info ?? null;

  const createdAt = new Date(order.created_at).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div>
      <div
        style={{
          padding: '1.5rem',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#166534', marginBottom: '0.25rem' }}>
          ✓ 訂單已成立
        </div>
        <div style={{ color: '#15803d', fontSize: '0.875rem' }}>
          訂單編號 <strong>{order.order_no}</strong>
          <CopyButton text={order.order_no} />
        </div>
        <div style={{ marginTop: '0.5rem', color: '#15803d', fontSize: '0.75rem', opacity: 0.85 }}>
          請保留此編號,日後可在「查我的訂單」查詢狀態
        </div>
      </div>

      {paymentInfo ? (
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
            💡 建議截圖此頁,匯款後告知賣家後 5 碼。訂單編號 <strong>{order.order_no}</strong>。
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
        <div
          style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          <span>應付總額</span>
          <span>NT$ {order.total_twd.toLocaleString()}</span>
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
