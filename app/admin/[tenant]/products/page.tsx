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

const c = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  borderSubtle: '#f4f4f5',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  textDisabled: '#a1a1aa',
  accent: '#18181b',
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  warning: '#f59e0b',
};

function statusLabel(s: string): string {
  return ({ active: '上架', inactive: '暫停', discontinued: '下架' }[s]) ?? s;
}
function statusColor(s: string): string {
  return ({ active: c.success, inactive: c.warning, discontinued: c.textDisabled }[s]) ?? c.textMuted;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: c.textMuted,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 12,
};

const label: React.CSSProperties = { fontSize: 12, color: c.textSec };
const labelText: React.CSSProperties = { display: 'block', marginBottom: 4 };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: `1px solid ${c.border}`,
  borderRadius: 5,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: c.card,
  color: c.text,
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px',
  background: c.accent,
  color: '#fff',
  border: 0,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  fontFamily: 'inherit',
};
const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: c.card,
  color: c.danger,
  border: `1px solid ${c.dangerBorder}`,
  cursor: 'pointer',
  fontSize: 12,
  borderRadius: 5,
  fontFamily: 'inherit',
};

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const products = await getProductsWithVariants(tenant.id);

  const savedId = sp.saved ?? '';
  const savedIsVariant = savedId.startsWith('variant_');
  const savedProductId = savedIsVariant ? null : savedId;

  return (
    <main style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', color: c.text }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus, select:focus { outline: none; border-color: ${c.accent} !important; }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
details[open] .chev { transform: rotate(90deg); }
.chev { display: inline-block; transition: transform 150ms ease; }
@keyframes fadein { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
          `,
        }}
      />

      {savedId && (
        <div
          style={{
            padding: '10px 16px',
            background: c.successBg,
            border: `1px solid ${c.successBorder}`,
            color: c.success,
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 16,
            animation: 'fadein 0.25s ease',
          }}
        >
          ✓ 已儲存{savedIsVariant ? ' (變體)' : ''}
        </div>
      )}

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>{tenant.name} · 商品管理</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>
          {products.length} 個商品 · {products.reduce((sum, p) => sum + p.product_variants.length, 0)} 個變體
        </p>
      </header>

      {/* 新增商品 折疊 */}
      <details
        style={{
          background: c.card,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        <summary
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
          + 新增商品
          <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
            建立後可在卡片內上傳圖片
          </span>
        </summary>
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${c.borderSubtle}` }}>
          <form action={createProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <label style={label}><span style={labelText}>商品名稱 *</span><input name="name" required style={input} /></label>
            <label style={label}><span style={labelText}>分類</span><input name="category" list="cats" style={input} /></label>
            <datalist id="cats"><option value="精油" /><option value="保養品" /><option value="保健" /><option value="配件" /><option value="童裝" /></datalist>
            <label style={label}><span style={labelText}>售價 *</span><input name="price_twd" type="number" required style={input} /></label>
            <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" style={input} /></label>
            <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={0} style={input} /></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>
              <span style={labelText}>描述</span>
              <textarea name="description" rows={2} style={{ ...input, fontFamily: 'inherit' }} />
            </label>
            <button type="submit" style={{ ...btnPrimary, gridColumn: '1 / -1' }}>建立商品</button>
          </form>
        </div>
      </details>

      {products.length === 0 && (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>
          (尚無商品)
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {products.map((p) => {
          const isExpanded = p.id === savedProductId;
          const variantCount = p.product_variants.length;
          const totalStock = p.product_variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);

          return (
            <details
              key={p.id}
              id={`product-${p.id}`}
              open={isExpanded}
              style={{
                background: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11, flexShrink: 0 }}>▶</span>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    style={{
                      width: 56,
                      height: 70,
                      objectFit: 'cover',
                      borderRadius: 5,
                      border: `1px solid ${c.borderSubtle}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 56,
                      height: 70,
                      background: c.borderSubtle,
                      borderRadius: 5,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: c.textDisabled,
                      fontSize: 10,
                    }}
                  >
                    無圖
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        background: statusColor(p.status) + '22',
                        color: statusColor(p.status),
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {statusLabel(p.status)}
                    </span>
                    {p.category && (
                      <span style={{ fontSize: 11, color: c.textMuted }}>{p.category}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: c.textMuted }}>
                    NT$ {p.price_twd.toLocaleString()} · {variantCount} 變體 · 庫存 {totalStock}
                  </div>
                </div>
              </summary>

              <div style={{ borderTop: `1px solid ${c.borderSubtle}` }}>
                {/* 商品圖 */}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>商品圖</div>
                  <ProductImageUploader
                    entity="product"
                    entityId={p.id}
                    tenantSlug={tenant.slug}
                    currentImageUrl={p.image_url}
                    productName={p.name}
                  />
                </section>

                {/* 分享卡 v0(Phase 9,2026-05-26)*/}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>📤 分享卡(IG Story)</div>
                  <a
                    href={`/api/og/product/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 14px',
                      background: '#05C878',
                      color: '#fff',
                      border: 0,
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    開分享圖(1080×1920)
                  </a>
                  <p style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                    {p.image_url ? (
                      <>圖開啟後右鍵儲存,直接上傳 IG Story / Threads / FB。</>
                    ) : (
                      <span style={{ color: '#d97706' }}>⚠️ 先上傳商品圖再分享(沒圖會變純黑底)</span>
                    )}
                  </p>
                </section>

                {/* 基本資料 */}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>基本資料</div>
                  <form action={updateProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="tenant_id" value={tenant.id} />
                    <input type="hidden" name="tenant_slug" value={tenant.slug} />
                    <input type="hidden" name="image_url" value={p.image_url ?? ''} />
                    <label style={label}><span style={labelText}>商品名稱</span><input name="name" defaultValue={p.name} style={input} /></label>
                    <label style={label}><span style={labelText}>SKU(系統自動)</span><input name="sku" defaultValue={p.sku ?? ''} readOnly style={{ ...input, background: '#f4f4f5', color: '#71717a', cursor: 'not-allowed' }} /></label>
                    <label style={label}><span style={labelText}>分類</span><input name="category" defaultValue={p.category ?? ''} style={input} /></label>
                    <label style={label}><span style={labelText}>售價(legacy)</span><input name="price_twd" type="number" defaultValue={p.price_twd} style={input} /></label>
                    <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" defaultValue={p.cost_twd ?? ''} style={input} /></label>
                    <label style={label}><span style={labelText}>庫存(legacy)</span><input name="stock" type="number" defaultValue={p.stock} style={input} /></label>
                    <label style={label}>
                      <span style={labelText}>狀態</span>
                      <select name="status" defaultValue={p.status} style={input}>
                        <option value="active">上架</option>
                        <option value="inactive">暫停</option>
                        <option value="discontinued">下架</option>
                      </select>
                    </label>
                    <label style={{ ...label, gridColumn: '1 / -1' }}>
                      <span style={labelText}>描述</span>
                      <textarea name="description" defaultValue={p.description ?? ''} rows={2} style={{ ...input, fontFamily: 'inherit' }} />
                    </label>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <button type="submit" style={btnPrimary}>儲存基本資料</button>
                    </div>
                  </form>
                </section>

                {/* 變體 */}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>變體 ({variantCount})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {p.product_variants.map((v) => {
                      const variantSaved = savedId === `variant_${v.id}`;
                      return (
                        <div
                          key={v.id}
                          id={`variant-${v.id}`}
                          style={{
                            padding: 12,
                            background: variantSaved ? c.successBg : '#fafafa',
                            border: `1px solid ${variantSaved ? c.successBorder : c.borderSubtle}`,
                            borderRadius: 6,
                          }}
                        >
                          <form action={updateVariant} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="tenant_slug" value={tenant.slug} />
                            <label style={label}><span style={labelText}>SKU(自動)</span><input name="sku" defaultValue={v.sku} readOnly style={{ ...input, background: '#f4f4f5', color: '#71717a', cursor: 'not-allowed' }} /></label>
                            <label style={label}><span style={labelText}>變體名</span><input name="variant_name" defaultValue={v.variant_name} required style={input} /></label>
                            <label style={label}><span style={labelText}>售價</span><input name="price_twd" type="number" defaultValue={v.price_twd} required style={input} /></label>
                            <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" defaultValue={v.cost_twd ?? ''} style={input} /></label>
                            <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={v.stock} style={input} /></label>
                            <label style={label}>
                              <span style={labelText}>狀態</span>
                              <select name="status" defaultValue={v.status} style={input}>
                                <option value="active">上架</option>
                                <option value="inactive">暫停</option>
                                <option value="discontinued">下架</option>
                              </select>
                            </label>
                            <button type="submit" style={{ ...btnPrimary, padding: '8px 14px', fontSize: 12 }}>儲存</button>
                          </form>

                          <details style={{ marginTop: 10 }}>
                            <summary style={{ fontSize: 11, color: c.textMuted, padding: '4px 0' }}>
                              <span className="chev" aria-hidden style={{ marginRight: 4 }}>▶</span>
                              變體圖 / 刪除
                            </summary>
                            <div style={{ marginTop: 8, padding: 10, background: c.card, borderRadius: 4 }}>
                              <ProductImageUploader
                                entity="variant"
                                entityId={v.id}
                                tenantSlug={tenant.slug}
                                currentImageUrl={v.image_url}
                                productName={`${p.name} ${v.variant_name}`}
                              />
                              <form action={deleteVariant} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${c.border}` }}>
                                <input type="hidden" name="id" value={v.id} />
                                <input type="hidden" name="tenant_slug" value={tenant.slug} />
                                <button type="submit" style={btnDanger}>刪除這個變體</button>
                              </form>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary
                      style={{
                        padding: '8px 12px',
                        background: '#eef7ff',
                        border: '1px dashed #6cf',
                        borderRadius: 5,
                        fontSize: 12,
                        color: '#0070f3',
                        fontWeight: 500,
                      }}
                    >
                      <span className="chev" aria-hidden style={{ marginRight: 6 }}>▶</span>
                      + 新增變體
                    </summary>
                    <form action={createVariant} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end', marginTop: 10, padding: 12, background: '#eef7ff', borderRadius: 5 }}>
                      <input type="hidden" name="product_id" value={p.id} />
                      <input type="hidden" name="tenant_id" value={tenant.id} />
                      <input type="hidden" name="tenant_slug" value={tenant.slug} />
                      <label style={label}><span style={labelText}>變體名 *</span><input name="variant_name" required style={input} placeholder="例 粉 L" /></label>
                      <label style={label}><span style={labelText}>售價 *</span><input name="price_twd" type="number" required style={input} defaultValue={p.price_twd} /></label>
                      <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" style={input} /></label>
                      <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={0} style={input} /></label>
                      <button type="submit" style={{ ...btnPrimary, padding: '8px 14px', fontSize: 12 }}>新增</button>
                    </form>
                  </details>
                </section>

                {/* 危險區 */}
                <section style={{ padding: '14px 18px', background: '#fafafa' }}>
                  <details>
                    <summary style={{ fontSize: 11, color: c.danger, fontWeight: 500, padding: '4px 0' }}>
                      <span className="chev" aria-hidden style={{ marginRight: 4 }}>▶</span>
                      危險區
                    </summary>
                    <div style={{ marginTop: 10, padding: 12, background: c.dangerBg, border: `1px solid ${c.dangerBorder}`, borderRadius: 5 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: c.danger }}>
                        刪除商品會連同它的 {variantCount} 個變體全部刪除。訂單 / 庫存紀錄不受影響但這個商品再也找不到。
                      </p>
                      <form action={deleteProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="tenant_slug" value={tenant.slug} />
                        <button type="submit" style={{ ...btnDanger, padding: '8px 14px' }}>確認刪除整個商品</button>
                      </form>
                    </div>
                  </details>
                </section>
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}
