import { supabaseAdmin } from '@/lib/supabase';
import { createProduct, deleteProduct, updateProduct } from '../actions';

const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price_twd: number;
  cost_twd: number | null;
  stock: number;
  image_url: string | null;
  category: string | null;
  status: string;
};

async function getProducts(): Promise<Product[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, sku, name, description, price_twd, cost_twd, stock, image_url, category, status')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });
  return (data ?? []) as Product[];
}

const section: React.CSSProperties = {
  marginBottom: 32,
  padding: 16,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fafafa',
};
const h2: React.CSSProperties = { fontSize: 16, marginBottom: 12 };
const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
};
const label: React.CSSProperties = { fontSize: 13 };
const labelText: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  color: '#444',
};
const input: React.CSSProperties = {
  width: '100%',
  padding: 6,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 4,
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  padding: 10,
  background: '#000',
  color: '#fff',
  border: 0,
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 4,
};
const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: 'none',
  color: '#d00',
  border: '1px solid #d00',
  cursor: 'pointer',
  fontSize: 12,
  borderRadius: 4,
};
const listItem: React.CSSProperties = {
  padding: 14,
  border: '1px solid #e5e5e5',
  marginBottom: 10,
  borderRadius: 6,
  background: '#fff',
};

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>商品管理</h1>

      <section style={section}>
        <h2 style={h2}>新增商品</h2>
        <form action={createProduct} style={formGrid}>
          <label style={label}>
            <span style={labelText}>商品名稱 *</span>
            <input name="name" required style={input} />
          </label>
          <label style={label}>
            <span style={labelText}>SKU 品號</span>
            <input name="sku" style={input} />
          </label>
          <label style={label}>
            <span style={labelText}>分類</span>
            <input
              name="category"
              list="categories"
              style={input}
              placeholder="精油 / 保養品 / 保健 / 配件"
            />
            <datalist id="categories">
              <option value="精油" />
              <option value="保養品" />
              <option value="保健" />
              <option value="配件" />
            </datalist>
          </label>
          <label style={label}>
            <span style={labelText}>售價 TWD *</span>
            <input name="price_twd" type="number" required style={input} />
          </label>
          <label style={label}>
            <span style={labelText}>成本 TWD(內部)</span>
            <input name="cost_twd" type="number" style={input} />
          </label>
          <label style={label}>
            <span style={labelText}>庫存</span>
            <input name="stock" type="number" defaultValue={0} style={input} />
          </label>
          <label style={{ ...label, gridColumn: '1 / -1' }}>
            <span style={labelText}>圖片 URL</span>
            <input name="image_url" type="url" style={input} />
          </label>
          <label style={{ ...label, gridColumn: '1 / -1' }}>
            <span style={labelText}>描述</span>
            <textarea name="description" rows={3} style={{ ...input, fontFamily: 'inherit' }} />
          </label>
          <button type="submit" style={{ ...btn, gridColumn: '1 / -1' }}>
            新增
          </button>
        </form>
      </section>

      <section style={section}>
        <h2 style={h2}>現有商品 ({products.length})</h2>
        {products.length === 0 && <p style={{ color: '#666' }}>(尚無資料)</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {products.map((p) => (
            <li key={p.id} style={listItem}>
              <form action={updateProduct} style={formGrid}>
                <input type="hidden" name="id" value={p.id} />
                <label style={label}>
                  <span style={labelText}>名稱</span>
                  <input name="name" defaultValue={p.name} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>SKU</span>
                  <input name="sku" defaultValue={p.sku ?? ''} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>分類</span>
                  <input name="category" defaultValue={p.category ?? ''} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>售價</span>
                  <input name="price_twd" type="number" defaultValue={p.price_twd} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>成本</span>
                  <input name="cost_twd" type="number" defaultValue={p.cost_twd ?? ''} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>庫存</span>
                  <input name="stock" type="number" defaultValue={p.stock} style={input} />
                </label>
                <label style={{ ...label, gridColumn: '1 / 3' }}>
                  <span style={labelText}>圖片 URL</span>
                  <input name="image_url" type="url" defaultValue={p.image_url ?? ''} style={input} />
                </label>
                <label style={label}>
                  <span style={labelText}>狀態</span>
                  <select name="status" defaultValue={p.status} style={input}>
                    <option value="active">上架</option>
                    <option value="discontinued">下架</option>
                  </select>
                </label>
                <label style={{ ...label, gridColumn: '1 / -1' }}>
                  <span style={labelText}>描述</span>
                  <textarea
                    name="description"
                    defaultValue={p.description ?? ''}
                    rows={2}
                    style={{ ...input, fontFamily: 'inherit' }}
                  />
                </label>
                <button type="submit" style={{ ...btn, gridColumn: '1 / 3' }}>
                  儲存
                </button>
              </form>
              <form action={deleteProduct} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" style={btnDanger}>
                  刪除
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
