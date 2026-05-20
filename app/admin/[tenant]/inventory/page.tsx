import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type VariantStock = {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string;
  stock: number;
  price_twd: number;
  status: string;
  products: { name: string; category: string | null; status: string } | null;
};

type RecentMovement = {
  id: string;
  qty_delta: number;
  reason: string;
  note: string | null;
  created_at: string;
  products: { name: string; sku: string | null } | null;
  product_variants: { variant_name: string; sku: string } | null;
};

async function getVariants(tenantId: string): Promise<VariantStock[]> {
  const { data } = await supabaseAdmin
    .from('product_variants')
    .select('id, product_id, variant_name, sku, stock, price_twd, status, products(name, category, status)')
    .eq('tenant_id', tenantId)
    .order('stock', { ascending: true });
  return (data ?? []) as unknown as VariantStock[];
}

async function getRecentMovements(tenantId: string): Promise<RecentMovement[]> {
  const { data } = await supabaseAdmin
    .from('stock_movements')
    .select('id, qty_delta, reason, note, created_at, products(name, sku), product_variants(variant_name, sku)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as RecentMovement[];
}

function reasonLabel(r: string): string {
  return ({
    order: '出貨(訂單)',
    order_cancel: '退回(取消)',
    restock: '進貨',
    damage: '損耗',
    manual_adjust: '手動調整',
    inventory_count: '盤點',
  }[r]) ?? r;
}

function statusLabel(s: string): string {
  return ({ active: '上架', inactive: '暫停', discontinued: '下架' }[s]) ?? s;
}

function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const section: React.CSSProperties = { marginBottom: 32 };
const h2: React.CSSProperties = { fontSize: 16, marginBottom: 12 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontWeight: 600, fontSize: 13, color: '#444' };
const td: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle', fontSize: 14 };

export default async function InventoryPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // Free 不開放 inventory(Pro / Enterprise 才有)
  if (tenant.plan === 'free') {
    return (
      <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 庫存追蹤</h1>
        <div
          style={{
            padding: '3rem 1.5rem',
            background: '#fff8e1',
            border: '1px solid #ffd54f',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#92400e' }}>
            庫存追蹤是 Pro / Enterprise 功能
          </h2>
          <p style={{ color: '#78350f', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            升級即可解鎖:variant 級庫存、低庫存警告、進出貨歷史。<br />
            目前方案 <strong>Free</strong>,適合個人 / 二手 / 偶爾代購。
          </p>
          <p style={{ color: '#9a7400', fontSize: 13 }}>需要升級請聯繫 Peter / NEO。</p>
        </div>
      </main>
    );
  }

  const [variants, movements] = await Promise.all([
    getVariants(tenant.id),
    getRecentMovements(tenant.id),
  ]);

  // 低庫存:variant active + product active + stock <= 3
  const lowStock = variants.filter(
    (v) => v.stock <= 3 && v.status === 'active' && v.products?.status === 'active',
  );

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 庫存追蹤</h1>

      {lowStock.length > 0 && (
        <section style={{ ...section, padding: 16, background: '#fff8e1', border: '1px solid #ffd54f', borderRadius: 6 }}>
          <h2 style={{ ...h2, color: '#9a7400' }}>⚠️ 低庫存警告 ({lowStock.length} 個 variant 庫存 ≤ 3)</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
            {lowStock.map((v) => (
              <li key={v.id} style={{ marginBottom: 4 }}>
                <strong>{v.products?.name ?? '(未知)'}</strong>
                {v.variant_name !== 'default' && (
                  <span style={{ marginLeft: 6, padding: '1px 6px', background: '#fff', border: '1px solid #ffd54f', borderRadius: 3, fontSize: 12 }}>
                    {v.variant_name}
                  </span>
                )}
                <span style={{ marginLeft: 6, color: '#999', fontSize: 12 }}>{v.sku}</span>
                {' — 庫存 '}
                <strong style={{ color: '#d00' }}>{v.stock}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={section}>
        <h2 style={h2}>商品規格庫存 ({variants.length})</h2>
        {variants.length === 0 && <p style={{ color: '#666' }}>(尚無 variant)</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
              <th style={th}>商品 / 規格</th>
              <th style={th}>SKU</th>
              <th style={th}>分類</th>
              <th style={{ ...th, textAlign: 'right' }}>單價</th>
              <th style={{ ...th, textAlign: 'right' }}>庫存</th>
              <th style={th}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{v.products?.name ?? '(已刪)'}</div>
                  {v.variant_name !== 'default' && (
                    <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', background: '#eef2ff', color: '#4338ca', borderRadius: 3, fontSize: 12, fontWeight: 500 }}>
                      {v.variant_name}
                    </span>
                  )}
                </td>
                <td style={{ ...td, fontSize: 13, color: '#666' }}>{v.sku}</td>
                <td style={td}>{v.products?.category ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>NT$ {v.price_twd.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: v.stock <= 3 ? '#d00' : v.stock === 0 ? '#999' : '#000' }}>
                  {v.stock}
                </td>
                <td style={{ ...td, fontSize: 13 }}>{statusLabel(v.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={section}>
        <h2 style={h2}>近 30 筆庫存異動</h2>
        {movements.length === 0 && <p style={{ color: '#666' }}>(尚無異動)</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
              <th style={th}>時間</th>
              <th style={th}>商品 / 規格</th>
              <th style={{ ...th, textAlign: 'right' }}>數量變動</th>
              <th style={th}>原因</th>
              <th style={th}>備註</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const displaySku = m.product_variants?.sku ?? m.products?.sku ?? null;
              const variantName = m.product_variants?.variant_name;
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...td, fontSize: 13, color: '#666' }}>{formatTw(m.created_at)}</td>
                  <td style={td}>
                    {m.products?.name ?? '(已刪)'}
                    {variantName && variantName !== 'default' && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', background: '#eef2ff', color: '#4338ca', borderRadius: 3, fontSize: 12 }}>
                        {variantName}
                      </span>
                    )}
                    {displaySku && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>{displaySku}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: m.qty_delta > 0 ? '#0a7038' : '#d00' }}>
                    {m.qty_delta > 0 ? '+' : ''}{m.qty_delta}
                  </td>
                  <td style={{ ...td, fontSize: 13 }}>{reasonLabel(m.reason)}</td>
                  <td style={{ ...td, fontSize: 12, color: '#666' }}>{m.note ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
