import { notFound } from 'next/navigation';
import { getTenantBySlug, isSaleActive, supabaseAdmin, type PriceTier } from '@/lib/supabase';
import {
  createPriceTier,
  createProduct,
  createVariant,
  deletePriceTier,
  deleteProduct,
  deleteVariant,
  updatePriceTier,
  updateProduct,
  updateProductSale,
  updateVariant,
} from '../../actions';
import { CategoryOrderManager } from './category-order';
import { ProductImageUploader } from './image-uploader';
import { ShareButton } from './share-button';
import { ShareFocusEditor } from './share-focus-editor';
import { SubmitButton } from '../../_components/submit-button';
import { MediaManager } from './media-manager';

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

type MediaItem = { type: 'image' | 'video'; url: string };

type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price_twd: number;
  cost_twd: number | null;
  stock: number;
  image_url: string | null;
  media: MediaItem[];
  sale_discount_pct: number | null;
  sale_start_at: string | null;
  sale_end_at: string | null;
  share_focus_x: number | null;
  category: string | null;
  badge: string | null;
  badge_color: string | null;
  status: string;
  product_variants: Variant[];
};

// Phase 15.2(2026-09-08):角標顏色預設選項(黃色底自動配深字在前台處理)
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

async function getTiersMap(tenantId: string): Promise<Map<string, PriceTier[]>> {
  const { data } = await supabaseAdmin
    .from('product_price_tiers')
    .select('id, product_id, min_qty, price_twd')
    .eq('tenant_id', tenantId)
    .order('min_qty', { ascending: true });
  const map = new Map<string, PriceTier[]>();
  for (const t of (data as PriceTier[] | null) ?? []) {
    if (!map.has(t.product_id)) map.set(t.product_id, []);
    map.get(t.product_id)!.push(t);
  }
  return map;
}

async function getProductsWithVariants(tenantId: string): Promise<Product[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select(
      `id, sku, name, description, price_twd, cost_twd, stock, image_url, media, sale_discount_pct, sale_start_at, sale_end_at, share_focus_x, category, badge, badge_color, status,
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

// ISO 8601 → 'YYYY-MM-DDTHH:MM' (datetime-local input 用,Asia/Taipei)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}T${String(tw.getUTCHours()).padStart(2, '0')}:${String(tw.getUTCMinutes()).padStart(2, '0')}`;
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
// 2026-09-11:iPad 窄版 datetime/number 輸入框有最小寬度,固定欄數 grid 會互相疊框;表單列改 flex-wrap,欄位用這個
const wrapField: React.CSSProperties = { ...label, flex: '1 1 150px', minWidth: 0 };
// datetime-local 在 iPad Safari 內建最小寬度約 200px,基準給大一點:不夠寬就整欄換行,不再硬擠
const wrapFieldWide: React.CSSProperties = { ...label, flex: '1 1 210px', minWidth: 0 };
const input: React.CSSProperties = {
  width: '100%',
  // iPad Safari 的 datetime/number 控件預設不肯縮到比內容窄,壓上 minWidth 0 讓它跟著欄位收
  minWidth: 0,
  maxWidth: '100%',
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
  searchParams: Promise<{
    saved?: string;
    err?: string;
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
  const products = await getProductsWithVariants(tenant.id);

  // Phase 9.5:撈這個 tenant 全 tier,group by product_id
  const tiersMap = await getTiersMap(tenant.id);

  // C#8(2026-09-02):分類顯示順序(有設定照設定,沒設定照筆劃,跟商城前台一致)
  const { data: catRow } = await supabaseAdmin
    .from('tenants')
    .select('category_order')
    .eq('id', tenant.id)
    .maybeSingle();
  const savedOrder: string[] = Array.isArray((catRow as { category_order?: string[] } | null)?.category_order)
    ? ((catRow as { category_order: string[] }).category_order)
    : [];
  const foundCats = [...new Set(products.map((p) => p.category).filter((cat): cat is string => !!cat))];
  const orderedCats = [
    ...savedOrder.filter((cat) => foundCats.includes(cat)),
    ...foundCats.filter((cat) => !savedOrder.includes(cat)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ];

  const savedId = sp.saved ?? '';
  const savedIsVariant = savedId.startsWith('variant_');
  const savedProductId = savedIsVariant ? null : savedId;

  // 剛儲存的目標商品(變體儲存反查所屬商品),固定顯示並展開
  const savedVariantId = savedIsVariant ? savedId.slice('variant_'.length) : null;
  const pinnedId =
    (savedProductId && products.some((p) => p.id === savedProductId) && savedProductId) ||
    (savedVariantId
      ? products.find((p) => p.product_variants.some((v) => v.id === savedVariantId))?.id ?? null
      : null) ||
    null;

  // 搜尋 + 分頁(2026-09-08):52 個商品整頁重算是所有「儲存」都很慢的元凶,
  // 一頁只渲染 10 個,儲存後 redirect 回來的頁面小很多
  // 2026-09-08 v2:加分類複選 chip + 特性篩選(有角標 / 特價中 / 缺貨)
  const q = (sp.q ?? '').trim();
  const selCats = Array.isArray(sp.cat) ? sp.cat : sp.cat ? [sp.cat] : [];
  const selFlags = Array.isArray(sp.flag) ? sp.flag : sp.flag ? [sp.flag] : [];
  const PER_PAGE = 10;
  const nowForSale = new Date();
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
  if (selCats.length > 0) {
    filtered = filtered.filter((p) => p.category && selCats.includes(p.category));
  }
  if (selFlags.includes('badge')) filtered = filtered.filter((p) => !!p.badge);
  if (selFlags.includes('sale')) filtered = filtered.filter((p) => isSaleActive(p, nowForSale));
  if (selFlags.includes('out')) {
    filtered = filtered.filter(
      (p) => p.product_variants.length > 0 && p.product_variants.every((v) => (v.stock ?? 0) <= 0),
    );
  }
  const hasFilter = !!q || selCats.length > 0 || selFlags.length > 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, parseInt(sp.pg ?? '1', 10) || 1));
  let pageProducts = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  if (pinnedId && !pageProducts.some((p) => p.id === pinnedId)) {
    const pinned = products.find((p) => p.id === pinnedId);
    if (pinned) pageProducts = [pinned, ...pageProducts];
  }
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
  // 點 chip 直接套用(2026-09-08 v3):toggle 該值後導頁,不用按套用
  const toggleCatHref = (cat: string) =>
    buildHref(selCats.includes(cat) ? selCats.filter((x) => x !== cat) : [...selCats, cat], selFlags);
  const toggleFlagHref = (fl: string) =>
    buildHref(selCats, selFlags.includes(fl) ? selFlags.filter((x) => x !== fl) : [...selFlags, fl]);
  const chipStyle = (on: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: '7px 14px',
    border: `1px solid ${on ? c.accent : c.border}`,
    borderRadius: 999,
    fontSize: 12,
    color: on ? '#fff' : c.textSec,
    background: on ? c.accent : c.card,
    fontWeight: on ? 600 : 400,
    textDecoration: 'none',
    userSelect: 'none',
    touchAction: 'manipulation',
  });

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
      {sp.err === 'sale' && (
        <div
          style={{
            padding: '10px 16px',
            background: c.dangerBg,
            border: `1px solid ${c.dangerBorder}`,
            color: c.danger,
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 16,
            animation: 'fadein 0.25s ease',
          }}
        >
          ⚠️ 限時優惠儲存失敗,請截圖回報(檢查折扣 % 與起訖時間格式)
        </div>
      )}

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>{tenant.name} · 商品管理</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>
          {products.length} 個商品 · {products.reduce((sum, p) => sum + p.product_variants.length, 0)} 個變體
        </p>
      </header>

      {/* C#8(2026-09-02):分類顯示順序 — 商城前台的分類 chip 和「全部」分組照這裡排 */}
      {orderedCats.length > 1 && (
        <details
          open={sp.cats === 'open'}
          style={{
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            marginBottom: 16,
            overflow: 'hidden',
          }}
        >
          <summary style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}>
            <span className="chev" aria-hidden style={{ color: c.textMuted, fontSize: 11 }}>▶</span>
            ↕ 分類顯示順序
          </summary>
          <div style={{ padding: '4px 18px 16px', borderTop: `1px solid ${c.borderSubtle}` }}>
            {/* 2026-09-08:改樂觀排序 client 元件 — 按了立即換位,背景存檔 */}
            <CategoryOrderManager tenantId={tenant.id} tenantSlug={tenant.slug} initial={orderedCats} />
          </div>
        </details>
      )}

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
            <label style={label}><span style={labelText}>角標(選填,如 HOT / 新品)</span><input name="badge" maxLength={8} style={input} placeholder="HOT" /></label>
            <label style={label}>
              <span style={labelText}>角標顏色</span>
              <select name="badge_color" defaultValue="" style={input}>
                {BADGE_COLORS.map((bc) => (
                  <option key={bc.value || 'default'} value={bc.value}>{bc.label}</option>
                ))}
              </select>
            </label>
            <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={0} style={input} /></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>
              <span style={labelText}>描述</span>
              <textarea name="description" rows={2} style={{ ...input, fontFamily: 'inherit' }} />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <SubmitButton pendingText="建立中…">建立商品</SubmitButton>
            </div>
          </form>
        </div>
      </details>

      {/* 搜尋 + 篩選 + 分頁列(2026-09-08 v3:chip 點了直接套用) */}
      {products.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 14,
            padding: '12px 14px',
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          <form
            method="GET"
            action={`/admin/${tenant.slug}/products`}
            style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
          >
            {/* 搜尋時保留已點選的 chip */}
            {selCats.map((cat) => (
              <input key={cat} type="hidden" name="cat" value={cat} />
            ))}
            {selFlags.map((fl) => (
              <input key={fl} type="hidden" name="flag" value={fl} />
            ))}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="搜商品名 / SKU / 分類"
              style={{ ...input, width: 'auto', flex: '1 1 200px', maxWidth: 320 }}
            />
            <button type="submit" style={{ padding: '8px 16px', background: c.accent, color: '#fff', border: 0, borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              搜尋
            </button>
            {hasFilter && (
              <a href={`/admin/${tenant.slug}/products`} style={{ padding: '8px 12px', fontSize: 13, color: c.textSec, textDecoration: 'none', border: `1px solid ${c.border}`, borderRadius: 5, background: c.card }}>
                清除全部
              </a>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: c.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
              {hasFilter ? `${filtered.length} 個符合 · ` : ''}第 {page} / {totalPages} 頁
              {page > 1 && <a href={pageHref(page - 1)} style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 5, textDecoration: 'none', color: c.text, background: c.card }}>‹ 上一頁</a>}
              {page < totalPages && <a href={pageHref(page + 1)} style={{ padding: '6px 12px', border: `1px solid ${c.border}`, borderRadius: 5, textDecoration: 'none', color: c.text, background: c.card }}>下一頁 ›</a>}
            </span>
          </form>

          {orderedCats.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, marginRight: 2 }}>分類</span>
              {orderedCats.map((cat) => (
                <a key={cat} href={toggleCatHref(cat)} style={chipStyle(selCats.includes(cat))}>
                  {cat}
                </a>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, marginRight: 2 }}>特性</span>
            <a href={toggleFlagHref('badge')} style={chipStyle(selFlags.includes('badge'))}>🏷 有角標</a>
            <a href={toggleFlagHref('sale')} style={chipStyle(selFlags.includes('sale'))}>🔥 特價中</a>
            <a href={toggleFlagHref('out')} style={chipStyle(selFlags.includes('out'))}>⛔ 缺貨</a>
          </div>
        </div>
      )}

      {products.length === 0 && (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>
          (尚無商品)
        </p>
      )}
      {products.length > 0 && pageProducts.length === 0 && (
        <p style={{ color: c.textMuted, padding: 32, textAlign: 'center', fontSize: 14 }}>
          (沒有符合「{q}」的商品)
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pageProducts.map((p) => {
          const isExpanded = p.id === pinnedId;
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
                {(() => {
                  // Phase 9.6:縮圖優先 media 第一張 image,fallback image_url
                  const firstImg = (p.media ?? []).find((m) => m.type === 'image');
                  return firstImg?.url ?? p.image_url;
                })() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url ?? ''}
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
                {/* 商品圖 / 影片(Phase 9.6/9.7)*/}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>商品圖 / 影片</div>
                  <p style={{ fontSize: 11, color: c.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
                    首格 = 列表縮圖 + 詳細頁第一張。可 ↑↓ 排序、加 YouTube URL、上傳 50MB 影片。圖會自動裁切 3:4 直式。
                  </p>
                  <MediaManager
                    productId={p.id}
                    tenantSlug={tenant.slug}
                    media={p.media ?? []}
                    legacyImageUrl={p.image_url}
                  />
                </section>

                {/* 分享卡 v0(Phase 9,2026-05-26)— 手機 only Web Share API */}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>📤 分享卡(IG Story 1080×1920)</div>
                  {(p.image_url || (p.media ?? []).some((m) => m.type === 'image')) ? (
                    <>
                      <ShareButton productId={p.id} productName={p.name} focusVersion={p.share_focus_x ?? 50} />
                      <p style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                        手機點按可跳系統分享(IG / Snapchat / WhatsApp / 訊息)。
                        <br />
                        桌機看預覽:
                        <a
                          href={`/api/og/product/${p.id}?v=${p.share_focus_x ?? 50}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginLeft: 4, color: '#0070f3', textDecoration: 'underline' }}
                        >
                          開新分頁
                        </a>
                      </p>

                      {/* 橫向焦點 — live preview client component */}
                      {(() => {
                        const focusImage =
                          (p.media ?? []).find((m) => m.type === 'image')?.url ??
                          p.image_url;
                        return focusImage ? (
                          <ShareFocusEditor
                            productId={p.id}
                            tenantSlug={tenant.slug}
                            imageUrl={focusImage}
                            initialFocus={p.share_focus_x ?? 50}
                          />
                        ) : null;
                      })()}
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: '#d97706', margin: 0, lineHeight: 1.5 }}>
                      ⚠️ 先上傳商品圖才能產分享卡(沒圖會變純黑底)
                    </p>
                  )}
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
                    <label style={label}><span style={labelText}>售價</span><input name="price_twd" type="number" defaultValue={p.price_twd} style={input} /></label>
                    <label style={label}><span style={labelText}>成本</span><input name="cost_twd" type="number" defaultValue={p.cost_twd ?? ''} style={input} /></label>
                    <label style={label}><span style={labelText}>庫存</span><input name="stock" type="number" defaultValue={p.stock} style={input} /></label>
                    <label style={label}>
                      <span style={labelText}>狀態</span>
                      <select name="status" defaultValue={p.status} style={input}>
                        <option value="active">上架</option>
                        <option value="inactive">暫停</option>
                        <option value="discontinued">下架</option>
                      </select>
                    </label>
                    <label style={label}>
                      <span style={labelText}>角標(純文字標籤,如 HOT / 新品。⚠️ 要真的打折請用下方「限時優惠」)</span>
                      <input name="badge" defaultValue={p.badge ?? ''} maxLength={8} style={input} placeholder="HOT" />
                    </label>
                    <label style={label}>
                      <span style={labelText}>角標顏色</span>
                      <select name="badge_color" defaultValue={p.badge_color ?? ''} style={input}>
                        {BADGE_COLORS.map((bc) => (
                          <option key={bc.value || 'default'} value={bc.value}>{bc.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ ...label, gridColumn: '1 / -1' }}>
                      <span style={labelText}>描述</span>
                      <textarea name="description" defaultValue={p.description ?? ''} rows={2} style={{ ...input, fontFamily: 'inherit' }} />
                    </label>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <SubmitButton pendingText="儲存中…">儲存基本資料</SubmitButton>
                    </div>
                  </form>
                </section>

                {/* 限時優惠 — Phase 9.9 v2(2026-06-03):用 % off 折扣 */}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>🔥 限時優惠(全變體 % off)</div>
                  <p style={{ fontSize: 11, color: c.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
                    輸入折扣 %(<strong>10 = 9折、20 = 8折、15 = 85折</strong>)。生效時商城卡片自動出現「🔥 9折」標、
                    LINE 商城與公開商城結帳都按折扣價收。分階暫停。清空 % = 取消優惠。
                    {p.sale_discount_pct !== null && p.sale_start_at && p.sale_end_at && (() => {
                      const now = new Date();
                      const start = new Date(p.sale_start_at);
                      const end = new Date(p.sale_end_at);
                      const active = now >= start && now < end;
                      const future = now < start;
                      return (
                        <>
                          <br />
                          <span
                            style={{
                              color: active ? '#dc2626' : future ? '#0070f3' : '#a1a1aa',
                              fontWeight: 600,
                            }}
                          >
                            {active
                              ? `✓ ${p.sale_discount_pct}% off 生效中(到 ${end.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})`
                              : future
                                ? `⏰ ${p.sale_discount_pct}% off 排程中(${start.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 起)`
                                : '⏹ 已過期'}
                          </span>
                        </>
                      );
                    })()}
                  </p>
                  <form
                    action={updateProductSale}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
                  >
                    <input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="tenant_slug" value={tenant.slug} />
                    <label style={wrapField}>
                      <span style={labelText}>折扣 % off</span>
                      <input
                        name="sale_discount_pct"
                        type="number"
                        min="1"
                        max="99"
                        defaultValue={p.sale_discount_pct ?? ''}
                        style={input}
                        placeholder="例 20"
                      />
                    </label>
                    <label style={wrapFieldWide}>
                      <span style={labelText}>開始</span>
                      <input
                        name="sale_start_at"
                        type="datetime-local"
                        defaultValue={
                          p.sale_start_at ? toLocalInput(p.sale_start_at) : ''
                        }
                        style={input}
                      />
                    </label>
                    <label style={wrapFieldWide}>
                      <span style={labelText}>結束</span>
                      <input
                        name="sale_end_at"
                        type="datetime-local"
                        defaultValue={p.sale_end_at ? toLocalInput(p.sale_end_at) : ''}
                        style={input}
                      />
                    </label>
                    <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
                  </form>
                </section>

                {/* 分階定價 — Phase 9.5(2026-06-02)*/}
                <section style={{ padding: '20px 18px', borderBottom: `1px solid ${c.borderSubtle}` }}>
                  <div style={sectionTitle}>分階定價(量大優惠)</div>
                  <p style={{ fontSize: 11, color: c.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
                    買 N 個以上就用該分階單價。沒設 → 用基本售價({p.price_twd.toLocaleString()})。
                    顧客買 30 個 → 找滿足 min_qty ≤ 30 的最大分階套用。
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(tiersMap.get(p.id) ?? []).map((t) => (
                      <form
                        key={t.id}
                        action={updatePriceTier}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
                      >
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="tenant_id" value={tenant.id} />
                        <input type="hidden" name="tenant_slug" value={tenant.slug} />
                        <label style={wrapField}>
                          <span style={labelText}>滿 N 個以上</span>
                          <input name="min_qty" type="number" min="2" defaultValue={t.min_qty} required style={input} />
                        </label>
                        <label style={wrapField}>
                          <span style={labelText}>單價</span>
                          <input name="price_twd" type="number" min="0" defaultValue={t.price_twd} required style={input} />
                        </label>
                        <div style={{ fontSize: 11, color: c.textMuted, flex: '1 1 110px', alignSelf: 'center' }}>
                          {t.min_qty}+ → NT$ {t.price_twd.toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
                        </div>
                      </form>
                    ))}
                    {(tiersMap.get(p.id) ?? []).map((t) => (
                      <form key={`del-${t.id}`} action={deletePriceTier} style={{ marginTop: -2 }}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="tenant_slug" value={tenant.slug} />
                        <SubmitButton variant="danger" size="sm" pendingText="刪除中…">刪除 {t.min_qty}+ 分階</SubmitButton>
                      </form>
                    ))}
                  </div>

                  {/* 新增分階 */}
                  <details style={{ marginTop: 12 }}>
                    <summary
                      style={{
                        padding: '6px 10px',
                        background: '#eef7ff',
                        color: '#0070f3',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'inline-block',
                      }}
                    >
                      + 新增分階
                    </summary>
                    <form
                      action={createPriceTier}
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 10 }}
                    >
                      <input type="hidden" name="product_id" value={p.id} />
                      <input type="hidden" name="tenant_id" value={tenant.id} />
                      <input type="hidden" name="tenant_slug" value={tenant.slug} />
                      <label style={wrapField}>
                        <span style={labelText}>滿 N 個以上 *</span>
                        <input name="min_qty" type="number" min="2" required style={input} placeholder="10" />
                      </label>
                      <label style={wrapField}>
                        <span style={labelText}>該分階單價 *</span>
                        <input name="price_twd" type="number" min="0" required style={input} placeholder="450" />
                      </label>
                      <SubmitButton size="sm" pendingText="新增中…">新增分階</SubmitButton>
                    </form>
                  </details>
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
                            <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
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
                                <SubmitButton variant="danger" size="sm" pendingText="刪除中…">刪除這個變體</SubmitButton>
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
                      <SubmitButton size="sm" pendingText="新增中…">新增</SubmitButton>
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
                        <SubmitButton variant="danger" size="sm" pendingText="刪除中…">確認刪除整個商品</SubmitButton>
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
