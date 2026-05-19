import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type ProductStock = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price_twd: number;
  stock: number;
  status: string;
};

type RecentMovement = {
  id: string;
  qty_delta: number;
  reason: string;
  note: string | null;
  created_at: string;
  products: { name: string; sku: string | null } | null;
};

async function getProducts(tenantId: string): Promise<ProductStock[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, category, price_twd, stock, status')
    .eq('tenant_id', tenantId)
    .order('stock', { ascending: true })
    .order('name');
  return (data ?? []) as ProductStock[];
}

async function getRecentMovements(tenantId: string): Promise<RecentMovement[]> {
  const { data } = await supabaseAdmin
    .from('stock_movements')
    .select('id, qty_delta, reason, note, created_at, products(name, sku)')
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
  const [products, movements] = await Promise.all([getProducts(tenant.id), getRecentMovements(tenant.id)]);

  const lowStock = products.filter((p) => p.stock <= 3 && p.status === 'active');

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 庫存追蹤</h1>

      {lowStock.length > 0 && (
        <section style={{ ...section, padding: 16, background: '#fff8e1', border: '1px solid #ffd54f', borderRadius: 6 }}>
          <h2 style={{ ...h2, color: '#9a7400' }}>⚠️ 低庫存警告 ({lowStock.length} 個商品庫存 ≤ 3)</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
            {lowStock.map((p) => (
              <li key={p.id} style={{ marginBottom: 4 }}>
                <strong>{p.name}</strong>{p.sku && ` (${p.sku})`} — 庫存 <strong style={{ color: '#d00' }}>{p.stock}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={section}>
        <h2 style={h2}>商品庫存 ({products.length})</h2>
        {products.length === 0 && <p style={{ color: '#666' }}>(尚無商品)</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', background: '#fafafa' }}>
              <th style={th}>商品</th>
              <th style={th}>SKU</th>
              <th style={th}>分類</th>
              <th style={{ ...th, textAlign: 'right' }}>單價</th>
              <th style={{ ...th, textAlign: 'right' }}>庫存</th>
              <th style={th}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                <td style={{ ...td, fontSize: 13, color: '#666' }}>{p.sku ?? '—'}</td>
                <td style={td}>{p.category ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>NT$ {p.price_twd.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: p.stock <= 3 ? '#d00' : p.stock === 0 ? '#999' : '#000' }}>
                  {p.stock}
                </td>
                <td style={{ ...td, fontSize: 13 }}>{statusLabel(p.status)}</td>
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
              <th style={th}>商品</th>
              <th style={{ ...th, textAlign: 'right' }}>數量變動</th>
              <th style={th}>原因</th>
              <th style={th}>備註</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ ...td, fontSize: 13, color: '#666' }}>{formatTw(m.created_at)}</td>
                <td style={td}>
                  {m.products?.name ?? '(已刪)'}
                  {m.products?.sku && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>{m.products.sku}</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: m.qty_delta > 0 ? '#0a7038' : '#d00' }}>
                  {m.qty_delta > 0 ? '+' : ''}{m.qty_delta}
                </td>
                <td style={{ ...td, fontSize: 13 }}>{reasonLabel(m.reason)}</td>
                <td style={{ ...td, fontSize: 12, color: '#666' }}>{m.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
