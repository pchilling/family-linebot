/**
 * 商品列表(2026-10-20 改版)
 *
 * 原本每個商品是一張展開卡,七個區塊、六七顆儲存全塞在裡面,很亂。
 * 改成「列表歸列表、編輯歸編輯」:這頁只做三件事 —
 *   找商品(搜尋 / 分類 / 特性篩選)、看狀態、直接改庫存與上下架。
 * 其他一律點進 /products/[id] 編輯頁。
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { compareVariantOrder, getTenantBySlug, isSaleActive, supabaseAdmin } from '@/lib/supabase';
import { CategoryOrderManager } from './category-order';
import { NewProductModal } from './new-product-modal';
import { StockCell } from './stock-cell';
import { ProductStatusToggle } from './status-toggle';
import { PRODUCTS_VIEW_COOKIE, ProductViewToggle, type ProductsView } from './view-toggle';
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
  channel: 'stall' | 'groupbuy' | null; // Phase 35:賣在哪裡
  track_stock: boolean | null; // Phase 35:管理庫存開關
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
      `id, sku, name, price_twd, image_url, media, sale_discount_pct, sale_start_at, sale_end_at, category, badge, status, channel, track_stock,
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
  // 2026-11-09:兩種檢視 — 表格(原本的,預設)/ 卡片;右上角切換,存 cookie
  const view: ProductsView = (await cookies()).get(PRODUCTS_VIEW_COOKIE)?.value === 'cards' ? 'cards' : 'table';

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
    // Phase 35:不管理庫存的商品不算缺貨
    filtered = filtered.filter((p) => p.track_stock !== false && p.product_variants.length > 0 && p.product_variants.every((v) => (v.stock ?? 0) <= 0));
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

  // 表格與卡片共用的每列資料
  const rowOf = (p: Product) => {
    const active = p.product_variants.filter((v) => v.status === 'active');
    return {
      cover: (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url,
      stockRows: (active.length > 0 ? active : p.product_variants).map((v) => ({
        id: v.id,
        label: v.variant_name === 'default' ? '庫存' : v.variant_name,
        stock: v.stock ?? 0,
      })),
      onSale: isSaleActive(p, now),
      editHref: `/admin/${tenant.slug}/products/${p.id}`,
    };
  };
  const pager = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: 12.5, color: c.textMuted }}>
      <span>
        {hasFilter ? `${filtered.length} 個符合 · ` : ''}第 {page} / {totalPages} 頁
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        {page > 1 && <a href={pageHref(page - 1)} className="ui-btn ui-btn-outline ui-btn-xs">上一頁</a>}
        {page < totalPages && <a href={pageHref(page + 1)} className="ui-btn ui-btn-outline ui-btn-xs">下一頁</a>}
      </div>
    </div>
  );

  return (
    // 2026-10-20:不設寬度上限,螢幕多寬就用多寬(手機版由 layout 的 CSS 另外處理)
    <main style={{ padding: '28px 32px 48px', color: c.text }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus, select:focus { outline: none; border-color: ${c.accent} !important; }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
details[open] .chev { transform: rotate(90deg); }
.chev { display: inline-block; transition: transform 150ms ease; }
.prow:hover { background: #fafafa; }
/* 卡片檢視(2026-11-09):格狀、圖大;電腦一排 5 到 6 張,手機一欄 */
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(236px, 1fr)); gap: 14px; margin-bottom: 14px; }
.pc-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.pc-cv { position: relative; aspect-ratio: 4 / 3; background: #f4f4f5; overflow: hidden; }
.pc-cv img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pc-cv[data-off="true"] img { opacity: .5; }
.pc-bd { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; flex-wrap: wrap; }
.pc-bo { padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.pc-nm { font-weight: 600; font-size: 14px; line-height: 1.35; color: #18181b; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pc-nm:hover { text-decoration: underline; }
.pc-mt { font-size: 12px; color: #71717a; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pc-pr { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-st { padding-top: 8px; border-top: 1px solid #f4f4f5; margin-top: auto; }
.pc-ft { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid #f4f4f5; background: #fafafa; }
@media (max-width: 767px) { .pc-grid { grid-template-columns: 1fr; } }
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
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>商品</h1>
          <span style={{ fontSize: 13, color: c.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {products.length} 個 · 上架 {activeCount}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {products.length > 0 && <ProductViewToggle view={view} />}
          <a href={`/admin/${tenant.slug}/products/sort`} className="ui-btn ui-btn-outline ui-btn-sm">
            排序商品
          </a>
          <NewProductModal tenantId={tenant.id} tenantSlug={tenant.slug} categories={orderedCats} badgeColors={BADGE_COLORS} />
        </div>
      </header>

      {/* 搜尋 + 篩選 */}
      {products.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <form method="GET" action={`/admin/${tenant.slug}/products`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {selCats.map((cat) => <input key={cat} type="hidden" name="cat" value={cat} />)}
            {selFlags.map((fl) => <input key={fl} type="hidden" name="flag" value={fl} />)}
            <input type="search" name="q" defaultValue={q} placeholder="搜尋商品名稱、SKU、分類" aria-label="搜尋商品" className="ui-input ui-input-sm" style={{ width: 'auto', flex: '1 1 220px', maxWidth: 360 }} />
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">搜尋</button>
            {hasFilter && (
              <a href={`/admin/${tenant.slug}/products`} className="ui-btn ui-btn-ghost ui-btn-sm">清除篩選</a>
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
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>還沒有商品,按右上角「新增商品」開始。</p>
      ) : pageProducts.length === 0 ? (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>沒有符合條件的商品。</p>
      ) : view === 'cards' ? (
        <>
          <div className="pc-grid">
            {pageProducts.map((p) => {
              const { cover, stockRows, onSale, editHref } = rowOf(p);
              return (
                <article key={p.id} id={`product-${p.id}`} className="pc-card">
                  <div className="pc-cv" data-off={p.status === 'active' ? 'false' : 'true'}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover && <img src={cover} alt="" loading="lazy" />}
                    {(p.channel === 'groupbuy' || onSale || p.badge) && (
                      <div className="pc-bd">
                        {p.channel === 'groupbuy' && <span className="ui-badge ui-badge-solid" style={{ padding: '0 8px', fontSize: 11 }}>團購</span>}
                        {onSale && <span style={{ padding: '2px 7px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', fontWeight: 600, fontSize: 11 }}>特價 {p.sale_discount_pct}% off</span>}
                        {p.badge && <span className="ui-badge" style={{ padding: '0 8px', fontSize: 11, background: '#fff' }}>{p.badge}</span>}
                      </div>
                    )}
                  </div>
                  <div className="pc-bo">
                    <Link href={editHref} className="pc-nm">{p.name}</Link>
                    <div className="pc-mt">
                      <span>{p.category ?? '未分類'}</span>
                      <span>·</span>
                      <span>{p.product_variants.length} 規格</span>
                    </div>
                    <div className="pc-pr">{priceRange(p)}</div>
                    <div className="pc-st">
                      {p.track_stock === false ? (
                        <span style={{ fontSize: 12, color: c.textMuted }}>不管理庫存</span>
                      ) : (
                        <StockCell tenantSlug={tenant.slug} variants={stockRows} />
                      )}
                    </div>
                  </div>
                  <div className="pc-ft">
                    <ProductStatusToggle tenantSlug={tenant.slug} productId={p.id} initialActive={p.status === 'active'} />
                    <Link href={editHref} className="ui-btn ui-btn-outline ui-btn-xs">編輯</Link>
                  </div>
                </article>
              );
            })}
          </div>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 24 }}>{pager}</div>
        </>
      ) : (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="rtable" style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {/* 只有「商品」欄吃剩餘寬度,其他欄固定寬,寬螢幕上才不會每欄之間都隔一大段 */}
                  <th scope="col" style={th}>商品</th>
                  <th scope="col" style={{ ...th, textAlign: 'right', width: 150 }}>售價</th>
                  <th scope="col" style={{ ...th, width: 300 }}>庫存(直接改,離開欄位就存)</th>
                  <th scope="col" style={{ ...th, width: 150 }}>狀態</th>
                  <th scope="col" style={{ ...th, width: 100 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>操作</span></th>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <Link href={editHref} style={{ display: 'block', fontSize: 14, fontWeight: 600, color: c.text, textDecoration: 'none', lineHeight: 1.35 }}>
                                {p.name}
                              </Link>
                              {/* Phase 35:團購商品標出來,攤位商品不另標 */}
                              {p.channel === 'groupbuy' && <span className="ui-badge ui-badge-solid" style={{ padding: '0 8px', fontSize: 11 }}>團購</span>}
                            </div>
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
                        {/* Phase 35:不管理庫存的商品不給輸入框 */}
                        {p.track_stock === false ? (
                          <span style={{ fontSize: 13, color: c.textMuted }}>不管理</span>
                        ) : (
                          <StockCell tenantSlug={tenant.slug} variants={stockRows} />
                        )}
                      </td>
                      <td data-label="狀態" style={td}>
                        <ProductStatusToggle tenantSlug={tenant.slug} productId={p.id} initialActive={p.status === 'active'} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={editHref} className="ui-btn ui-btn-outline ui-btn-xs">
                          編輯
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: `1px solid ${c.borderSubtle}` }}>{pager}</div>
        </div>
      )}

      {/* 分類顯示順序 */}
      {orderedCats.length > 1 && (
        <details open={sp.cats === 'open'} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <summary style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
            <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
            分類顯示順序
            <span style={{ color: c.textMuted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>商店的分類順序</span>
          </summary>
          <div style={{ padding: '4px 18px 16px', borderTop: `1px solid ${c.borderSubtle}` }}>
            <CategoryOrderManager tenantId={tenant.id} tenantSlug={tenant.slug} initial={orderedCats} />
          </div>
        </details>
      )}
    </main>
  );
}
