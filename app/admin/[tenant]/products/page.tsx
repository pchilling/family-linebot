/**
 * 商品列表(2026-10-20 改版)
 *
 * 原本每個商品是一張展開卡,七個區塊、六七顆儲存全塞在裡面,很亂。
 * 改成「列表歸列表、編輯歸編輯」:這頁只做三件事 —
 *   找商品(搜尋 / 分類 / 特性篩選)、看狀態、直接改庫存與上下架。
 * 其他一律點進 /products/[id] 編輯頁。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compareVariantOrder, getTenantBySlug, isSaleActive, supabaseAdmin } from '@/lib/supabase';
import { createProduct } from '../../actions';
import { CategoryOrderManager } from './category-order';
import { StockCell } from './stock-cell';
import { ProductStatusToggle } from './status-toggle';
import { SubmitButton } from '../../_components/submit-button';
import { FlashToast } from '../../../_components/toast';

type Variant = {
  id: string;
  variant_name: string;
  price_twd: number;
  stock: number;
  status: string;
  sort_order: number | null;
};
type MediaItem = { type: 'image' | 'video'; url: string };
type Product = {
  id: string;
  sku: string | null;
  name: string;
  price_twd: number;
  image_url: string | null;
  media: MediaItem[] | null;
  sale_discount_pct: number | null;
  sale_start_at: string | null;
  sale_end_at: string | null;
  category: string | null;
  badge: string | null;
  status: string;
  product_variants: Variant[];
};

const BADGE_COLORS: { value: string; label: string }[] = [
  { value: '', label: '預設(橙棕)' },
  { value: '#dc2626', label: '紅' },
  { value: '#ea580c', label: '橘' },
  { value: '#eab308', label: '黃' },
  { value: '#16a34a', label: '綠' },
  { value: '#2563eb', label: '藍' },
  { value: '#7c3aed', label: '紫' },
  { value: '#18181b', label: '黑' },
];

async function getProducts(tenantId: string): Promise<Product[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select(
      `id, sku, name, price_twd, image_url, media, sale_discount_pct, sale_start_at, sale_end_at, category, badge, status,
       product_variants(id, variant_name, price_twd, stock, status, sort_order)`,
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as unknown as Product[];
  for (const p of rows) {
    p.product_variants = (p.product_variants ?? []).slice().sort(compareVariantOrder);
  }
  return rows;
}

const c = {
  card: '#ffffff',
  border: '#e4e4e7',
  borderSubtle: '#f4f4f5',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  accent: '#18181b',
};

const label: React.CSSProperties = { fontSize: 12, color: c.textSec };
const labelText: React.CSSProperties = { display: 'block', marginBottom: 4 };
const input: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
  border: `1px solid ${c.border}`, borderRadius: 7, fontFamily: 'inherit', background: c.card, color: c.text,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: c.textMuted,
  background: '#fafafa', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${c.borderSubtle}`, verticalAlign: 'middle' };

function priceRange(p: Product): string {
  const prices = p.product_variants.filter((v) => v.status === 'active').map((v) => v.price_twd);
  if (prices.length === 0) return `NT$ ${p.price_twd.toLocaleString()}`;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? `NT$ ${lo.toLocaleString()}` : `NT$ ${lo.toLocaleString()} – ${hi.toLocaleString()}`;
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    cats?: string;
    q?: string;
    pg?: string;
    cat?: string | string[];
    flag?: string | string[];
  }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const products = await getProducts(tenant.id);

  // C#8:分類顯示順序(有設定照設定,沒設定照筆劃,跟商城前台一致)
  const { data: catRow } = await supabaseAdmin
    .from('tenants')
    .select('category_order')
    .eq('id', tenant.id)
    .maybeSingle();
  const savedOrder: string[] = Array.isArray((catRow as { category_order?: string[] } | null)?.category_order)
    ? (catRow as { category_order: string[] }).category_order
    : [];
  const foundCats = [...new Set(products.map((p) => p.category).filter((cat): cat is string => !!cat))];
  const orderedCats = [
    ...savedOrder.filter((cat) => foundCats.includes(cat)),
    ...foundCats.filter((cat) => !savedOrder.includes(cat)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ];

  // 搜尋 + 分類 + 特性篩選 + 分頁(列表變輕了,一頁改 20 個)
  const q = (sp.q ?? '').trim();
  const selCats = Array.isArray(sp.cat) ? sp.cat : sp.cat ? [sp.cat] : [];
  const selFlags = Array.isArray(sp.flag) ? sp.flag : sp.flag ? [sp.flag] : [];
  const PER_PAGE = 20;
  const now = new Date();
  let filtered = products;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? '').toLowerCase().includes(needle) ||
        (p.category ?? '').toLowerCase().includes(needle),
    );
  }
  if (selCats.length > 0) filtered = filtered.filter((p) => p.category && selCats.includes(p.category));
  if (selFlags.includes('badge')) filtered = filtered.filter((p) => !!p.badge);
  if (selFlags.includes('sale')) filtered = filtered.filter((p) => isSaleActive(p, now));
  if (selFlags.includes('out')) {
    filtered = filtered.filter((p) => p.product_variants.length > 0 && p.product_variants.every((v) => (v.stock ?? 0) <= 0));
  }
  if (selFlags.includes('off')) filtered = filtered.filter((p) => p.status !== 'active');
  const hasFilter = !!q || selCats.length > 0 || selFlags.length > 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, parseInt(sp.pg ?? '1', 10) || 1));
  const pageProducts = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const buildHref = (cats: string[], flags: string[], pg?: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    for (const cat of cats) params.append('cat', cat);
    for (const fl of flags) params.append('flag', fl);
    if (pg && pg > 1) params.set('pg', String(pg));
    const s = params.toString();
    return `/admin/${tenant.slug}/products${s ? `?${s}` : ''}`;
  };
  const pageHref = (n: number) => buildHref(selCats, selFlags, n);
  const toggleCatHref = (cat: string) =>
    buildHref(selCats.includes(cat) ? selCats.filter((x) => x !== cat) : [...selCats, cat], selFlags);
  const toggleFlagHref = (fl: string) =>
    buildHref(selCats, selFlags.includes(fl) ? selFlags.filter((x) => x !== fl) : [...selFlags, fl]);
  const chip = (on: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '7px 13px', border: `1px solid ${on ? c.accent : c.border}`, borderRadius: 999,
    fontSize: 12.5, color: on ? '#fff' : c.textSec, background: on ? c.accent : c.card, fontWeight: on ? 600 : 400,
    textDecoration: 'none', userSelect: 'none',
  });

  const activeCount = products.filter((p) => p.status === 'active').length;

  return (
    // 2026-10-20:桌機寬度放寬到 1500,表格有空間就用(手機版由 layout 的 CSS 壓成 100%)
    <main style={{ padding: '24px 32px 48px', maxWidth: 1500, margin: '0 auto', color: c.text }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus, select:focus { outline: none; border-color: ${c.accent} !important; }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
details[open] .chev { transform: rotate(90deg); }
.chev { display: inline-block; transition: transform 150ms ease; }
.prow:hover { background: #fafafa; }
/* 手機版:layout 的全域 CSS 會把表格拆成卡片、藏表頭;這裡補欄位小標、名稱置頂、拿掉最小寬度 */
@media (max-width: 767px) {
  .rtable { min-width: 0 !important; }
  .rtable tr { display: flex !important; flex-direction: column; gap: 6px; }
  .rtable td:first-child { font-weight: 400 !important; font-size: 13px !important; }
  .rtable td.rt-title { order: -1; font-weight: 600 !important; font-size: 15px !important; color: #18181b !important; }
  .rtable td[data-label]::before { content: attr(data-label); display: block; font-size: 11px; color: #71717a; margin-bottom: 3px; }
  .rtable td:last-child { font-size: 13px !important; color: inherit !important; }
}
          `,
        }}
      />
      {sp.saved && <FlashToast message="已儲存" />}
      {sp.deleted && <FlashToast message="商品已刪除" />}

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>商品</h1>
          <span style={{ fontSize: 13, color: c.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {products.length} 個 · 上架 {activeCount}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/admin/${tenant.slug}/products/sort`} style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 14px', border: `1px solid ${c.border}`, borderRadius: 8, background: c.card, fontSize: 13, fontWeight: 600, color: c.text, textDecoration: 'none' }}>
            排序商品
          </a>
          <a href="#new-product" style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 16px', border: 0, borderRadius: 8, background: c.accent, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            + 新增商品
          </a>
        </div>
      </header>

      {/* 搜尋 + 篩選 */}
      {products.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <form method="GET" action={`/admin/${tenant.slug}/products`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {selCats.map((cat) => <input key={cat} type="hidden" name="cat" value={cat} />)}
            {selFlags.map((fl) => <input key={fl} type="hidden" name="flag" value={fl} />)}
            <input type="search" name="q" defaultValue={q} placeholder="搜尋商品名稱、SKU、分類" aria-label="搜尋商品" style={{ ...input, width: 'auto', flex: '1 1 220px', maxWidth: 360 }} />
            <button type="submit" style={{ padding: '8px 16px', background: c.accent, color: '#fff', border: 0, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>搜尋</button>
            {hasFilter && (
              <a href={`/admin/${tenant.slug}/products`} style={{ padding: '8px 12px', fontSize: 13, color: c.textSec, textDecoration: 'none', border: `1px solid ${c.border}`, borderRadius: 7, background: c.card }}>清除篩選</a>
            )}
          </form>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {orderedCats.map((cat) => <a key={cat} href={toggleCatHref(cat)} style={chip(selCats.includes(cat))}>{cat}</a>)}
            {orderedCats.length > 0 && <span aria-hidden style={{ width: 1, height: 18, background: c.border, margin: '0 4px' }} />}
            <a href={toggleFlagHref('out')} style={chip(selFlags.includes('out'))}>缺貨</a>
            <a href={toggleFlagHref('sale')} style={chip(selFlags.includes('sale'))}>特價中</a>
            <a href={toggleFlagHref('badge')} style={chip(selFlags.includes('badge'))}>有角標</a>
            <a href={toggleFlagHref('off')} style={chip(selFlags.includes('off'))}>已下架</a>
          </div>
        </div>
      )}

      {/* 列表 */}
      {products.length === 0 ? (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>還沒有商品,從下方「新增商品」開始。</p>
      ) : pageProducts.length === 0 ? (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>沒有符合條件的商品。</p>
      ) : (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="rtable" style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, width: '40%' }}>商品</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>售價</th>
                  <th scope="col" style={{ ...th, width: '26%' }}>庫存(直接改,離開欄位就存)</th>
                  <th scope="col" style={th}>狀態</th>
                  <th scope="col" style={th}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>操作</span></th>
                </tr>
              </thead>
              <tbody>
                {pageProducts.map((p) => {
                  const cover = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url;
                  const active = p.product_variants.filter((v) => v.status === 'active');
                  const stockRows = (active.length > 0 ? active : p.product_variants).map((v) => ({
                    id: v.id,
                    label: v.variant_name === 'default' ? '庫存' : v.variant_name,
                    stock: v.stock ?? 0,
                  }));
                  const onSale = isSaleActive(p, now);
                  const editHref = `/admin/${tenant.slug}/products/${p.id}`;
                  return (
                    <tr key={p.id} id={`product-${p.id}`} className="prow">
                      <td className="rt-title" style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6, border: `1px solid ${c.borderSubtle}`, flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 44, height: 56, borderRadius: 6, background: c.borderSubtle, flexShrink: 0 }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <Link href={editHref} style={{ display: 'block', fontSize: 14, fontWeight: 600, color: c.text, textDecoration: 'none', lineHeight: 1.35 }}>
                              {p.name}
                            </Link>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: c.textMuted, marginTop: 3 }}>
                              <span>{p.category ?? '未分類'}</span>
                              <span>·</span>
                              <span>{p.product_variants.length} 規格</span>
                              {onSale && <span style={{ padding: '1px 6px', borderRadius: 3, background: '#fee2e2', color: '#b91c1c', fontWeight: 600, fontSize: 11 }}>特價 {p.sale_discount_pct}% off</span>}
                              {p.badge && <span style={{ padding: '1px 6px', borderRadius: 3, background: '#f4f4f5', color: c.textSec, fontSize: 11 }}>{p.badge}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label="售價" style={{ ...td, textAlign: 'right', fontSize: 13.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{priceRange(p)}</td>
                      <td data-label="庫存" style={{ ...td, padding: '10px 14px' }}>
                        <StockCell tenantSlug={tenant.slug} variants={stockRows} />
                      </td>
                      <td data-label="狀態" style={td}>
                        <ProductStatusToggle tenantSlug={tenant.slug} productId={p.id} initialActive={p.status === 'active'} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={editHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', border: `1px solid ${c.border}`, borderRadius: 7, background: c.card, fontSize: 12.5, fontWeight: 600, color: c.text, textDecoration: 'none' }}>
                          編輯 ›
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${c.borderSubtle}`, fontSize: 12.5, color: c.textMuted }}>
            <span>
              {hasFilter ? `${filtered.length} 個符合 · ` : ''}第 {page} / {totalPages} 頁
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {page > 1 && <a href={pageHref(page - 1)} style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 6, textDecoration: 'none', color: c.text, background: c.card }}>‹ 上一頁</a>}
              {page < totalPages && <a href={pageHref(page + 1)} style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 6, textDecoration: 'none', color: c.text, background: c.card }}>下一頁 ›</a>}
            </div>
          </div>
        </div>
      )}

      {/* 新增商品 */}
      <details id="new-product" style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
        <summary style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
          <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
          新增商品
          <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>建立後點進去補規格、圖片</span>
        </summary>
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${c.borderSubtle}` }}>
          <form action={createProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <label style={label}><span style={labelText}>商品名稱 *</span><input name="name" required style={input} /></label>
            <label style={label}><span style={labelText}>分類</span><input name="category" list="cats" style={input} /></label>
            <datalist id="cats">{orderedCats.map((cat) => <option key={cat} value={cat} />)}</datalist>
            <label style={label}><span style={labelText}>售價 *</span><input name="price_twd" type="number" min={0} required style={input} /></label>
            <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" min={0} style={input} /></label>
            <label style={label}><span style={labelText}>初始庫存</span><input name="stock" type="number" min={0} defaultValue={0} style={input} /></label>
            <label style={label}><span style={labelText}>角標(選填)</span><input name="badge" maxLength={8} style={input} placeholder="HOT" /></label>
            <label style={label}>
              <span style={labelText}>角標顏色</span>
              <select name="badge_color" defaultValue="" style={input}>
                {BADGE_COLORS.map((bc) => <option key={bc.value || 'default'} value={bc.value}>{bc.label}</option>)}
              </select>
            </label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>
              <span style={labelText}>商品說明</span>
              <textarea name="description" rows={2} style={{ ...input, fontFamily: 'inherit' }} />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <SubmitButton pendingText="建立中…">建立商品</SubmitButton>
            </div>
          </form>
        </div>
      </details>

      {/* 分類顯示順序 */}
      {orderedCats.length > 1 && (
        <details open={sp.cats === 'open'} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <summary style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
            <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
            分類顯示順序
            <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>商城前台的分類排法</span>
          </summary>
          <div style={{ padding: '4px 18px 16px', borderTop: `1px solid ${c.borderSubtle}` }}>
            <CategoryOrderManager tenantId={tenant.id} tenantSlug={tenant.slug} initial={orderedCats} />
          </div>
        </details>
      )}
    </main>
  );
}
