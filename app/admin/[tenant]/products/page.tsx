import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  updateProduct,
  updateVariant,
} from '../../actions';
import { ProductImageUploader } from './image-uploader';

type Variant = {
  id: string;
  sku: string;
  variant_name: string;
  price_twd: number;
  cost_twd: number | null;
  stock: number;
  image_url: string | null;
  status: string;
};

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
  product_variants: Variant[];
};

async function getProductsWithVariants(tenantId: string): Promise<Product[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select(
      `id, sku, name, description, price_twd, cost_twd, stock, image_url, category, status,
       product_variants(id, sku, variant_name, price_twd, cost_twd, stock, image_url, status)`,
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as Product[];
}

const section: React.CSSProperties = { marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 6, background: '#fafafa' };
const h2: React.CSSProperties = { fontSize: 16, marginBottom: 12 };
const h3: React.CSSProperties = { fontSize: 13, marginBottom: 8, marginTop: 16, color: '#444' };
const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 };
const label: React.CSSProperties = { fontSize: 12 };
const labelText: React.CSSProperties = { display: 'block', marginBottom: 3, color: '#555' };
const input: React.CSSProperties = { width: '100%', padding: 5, fontSize: 13, border: '1px solid #ccc', borderRadius: 3, boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: 8, background: '#000', color: '#fff', border: 0, cursor: 'pointer', fontSize: 13, borderRadius: 3 };
const btnSmall: React.CSSProperties = { padding: '4px 10px', background: '#000', color: '#fff', border: 0, cursor: 'pointer', fontSize: 12, borderRadius: 3 };
const btnDanger: React.CSSProperties = { padding: '4px 10px', background: 'none', color: '#d00', border: '1px solid #d00', cursor: 'pointer', fontSize: 11, borderRadius: 3 };
const productCard: React.CSSProperties = { padding: 16, border: '1px solid #e5e5e5', marginBottom: 16, borderRadius: 6, background: '#fff' };
const variantRow: React.CSSProperties = { padding: 10, border: '1px solid #eee', marginBottom: 6, borderRadius: 4, background: '#fafafa' };
const variantGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 1fr auto auto', gap: 6, alignItems: 'end' };

export default async function ProductsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const products = await getProductsWithVariants(tenant.id);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 商品管理</h1>

      <section style={section}>
        <h2 style={h2}>新增商品(系統會自動建一個 default variant)</h2>
        <form action={createProduct} style={formGrid}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <label style={label}><span style={labelText}>商品名稱 *</span><input name="name" required style={input} /></label>
          <label style={label}><span style={labelText}>SKU(default variant 用)</span><input name="sku" style={input} /></label>
          <label style={label}><span style={labelText}>分類</span><input name="category" list="cats" style={input} /></label>
          <datalist id="cats"><option value="精油" /><option value="保養品" /><option value="保健" /><option value="配件" /><option value="童裝" /></datalist>
          <label style={label}><span style={labelText}>售價 *</span><input name="price_twd" type="number" required style={input} /></label>
          <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" style={input} /></label>
          <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={0} style={input} /></label>
          <label style={{ ...label, gridColumn: '1 / -1' }}><span style={labelText}>描述</span><textarea name="description" rows={2} style={{ ...input, fontFamily: 'inherit' }} /></label>
          <p style={{ ...label, gridColumn: '1 / -1', color: '#71717a', margin: 0 }}>
            建立後在下方商品卡片有「上傳商品圖」按鈕(4:5 直式 + 裁切)
          </p>
          <button type="submit" style={{ ...btn, gridColumn: '1 / -1' }}>新增商品 + default variant</button>
        </form>
      </section>

      <h2 style={{ ...h2, fontSize: 18 }}>現有商品 ({products.length})</h2>
      {products.length === 0 && <p style={{ color: '#666' }}>(尚無商品)</p>}

      {products.map((p) => (
        <article key={p.id} style={productCard}>
          {/* 商品圖上傳器(獨立於文字表單,即傳即儲存) */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
            <ProductImageUploader
              entity="product"
              entityId={p.id}
              tenantSlug={tenant.slug}
              currentImageUrl={p.image_url}
              productName={p.name}
            />
          </div>

          {/* product-level edit form(image_url 隱藏帶舊值給 updateProduct,實際更新走 uploader) */}
          <form action={updateProduct} style={formGrid}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <input type="hidden" name="image_url" value={p.image_url ?? ''} />
            <label style={label}><span style={labelText}>商品名稱</span><input name="name" defaultValue={p.name} style={input} /></label>
            <label style={label}><span style={labelText}>SKU(legacy)</span><input name="sku" defaultValue={p.sku ?? ''} style={input} /></label>
            <label style={label}><span style={labelText}>分類</span><input name="category" defaultValue={p.category ?? ''} style={input} /></label>
            <label style={label}><span style={labelText}>售價(legacy)</span><input name="price_twd" type="number" defaultValue={p.price_twd} style={input} /></label>
            <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" defaultValue={p.cost_twd ?? ''} style={input} /></label>
            <label style={label}><span style={labelText}>庫存(legacy)</span><input name="stock" type="number" defaultValue={p.stock} style={input} /></label>
            <label style={label}><span style={labelText}>狀態</span>
              <select name="status" defaultValue={p.status} style={input}>
                <option value="active">上架</option>
                <option value="inactive">暫停</option>
                <option value="discontinued">下架</option>
              </select>
            </label>
            <label style={{ ...label, gridColumn: '1 / -1' }}><span style={labelText}>描述</span><textarea name="description" defaultValue={p.description ?? ''} rows={2} style={{ ...input, fontFamily: 'inherit' }} /></label>
            <button type="submit" style={{ ...btnSmall, gridColumn: '1 / 2' }}>儲存商品</button>
          </form>

          <form action={deleteProduct} style={{ marginTop: 6 }}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <button type="submit" style={btnDanger}>刪除整個商品 + 所有變體</button>
          </form>

          {/* variants subsection */}
          <h3 style={h3}>變體 ({p.product_variants.length})</h3>
          {p.product_variants.map((v) => (
            <div key={v.id} style={variantRow}>
              <form action={updateVariant} style={variantGrid}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="tenant_slug" value={tenant.slug} />
                <label style={label}><span style={labelText}>SKU</span><input name="sku" defaultValue={v.sku} required style={input} /></label>
                <label style={label}><span style={labelText}>變體名(例 藍 M / 50ml)</span><input name="variant_name" defaultValue={v.variant_name} required style={input} /></label>
                <label style={label}><span style={labelText}>售價</span><input name="price_twd" type="number" defaultValue={v.price_twd} required style={input} /></label>
                <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" defaultValue={v.cost_twd ?? ''} style={input} /></label>
                <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={v.stock} style={input} /></label>
                <label style={label}><span style={labelText}>狀態</span>
                  <select name="status" defaultValue={v.status} style={input}>
                    <option value="active">上架</option>
                    <option value="inactive">暫停</option>
                    <option value="discontinued">下架</option>
                  </select>
                </label>
                <button type="submit" style={btnSmall}>存</button>
              </form>
              <form action={deleteVariant} style={{ marginTop: 6 }}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="tenant_slug" value={tenant.slug} />
                <button type="submit" style={btnDanger}>刪變體</button>
              </form>
              {/* 變體圖(沒設則 fallback 用 product 的圖) */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #eee' }}>
                <div style={{ fontSize: 11, color: '#71717a', marginBottom: 6 }}>
                  變體圖 — 沒設就用 product 圖(色 / 尺寸款式才需要各自圖)
                </div>
                <ProductImageUploader
                  entity="variant"
                  entityId={v.id}
                  tenantSlug={tenant.slug}
                  currentImageUrl={v.image_url}
                  productName={`${p.name} ${v.variant_name}`}
                />
              </div>
            </div>
          ))}

          {/* 新增 variant form */}
          <form action={createVariant} style={{ ...variantGrid, marginTop: 12, padding: 10, background: '#eef7ff', border: '1px dashed #6cf', borderRadius: 4 }}>
            <input type="hidden" name="product_id" value={p.id} />
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <label style={label}><span style={labelText}>SKU *</span><input name="sku" required style={input} /></label>
            <label style={label}><span style={labelText}>變體名 * (例 粉 L)</span><input name="variant_name" required style={input} /></label>
            <label style={label}><span style={labelText}>售價 *</span><input name="price_twd" type="number" required style={input} defaultValue={p.price_twd} /></label>
            <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" style={input} /></label>
            <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={0} style={input} /></label>
            <span /> {/* spacer for status column alignment */}
            <button type="submit" style={btnSmall}>+ 新增</button>
          </form>
        </article>
      ))}
    </main>
  );
}
