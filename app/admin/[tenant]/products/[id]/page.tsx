/**
 * 商品編輯頁(2026-10-20 商品頁改版)
 *
 * 原本所有欄位全塞在列表的展開區,七個區塊疊在一起、六七顆儲存。
 * 改成專屬編輯頁 + 四個分頁:規格與庫存(預設)/ 基本資料 / 圖片與分享 / 促銷。
 * 分頁用 ?tab= 切換(server component,存完 redirect 回同一分頁)。
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compareVariantOrder, getTenantBySlug, supabaseAdmin, type PriceTier } from '@/lib/supabase';
import { IconChevronLeft } from '@/lib/icons';
import { deleteProduct, updateProduct, updateProductSale } from '../../../actions';
import { SubmitButton } from '../../../_components/submit-button';
import { FlashToast } from '../../../../_components/toast';
import { MediaManager } from '../media-manager';
import { ShareButton } from '../share-button';
import { ShareFocusEditor } from '../share-focus-editor';
import { ProductStatusToggle } from '../status-toggle';
import { VariantsTable, type TierRowData, type VariantRowData } from './variants-table';
import { ProductTabs, type TabKey } from './product-tabs';

// 分頁 key 清單在這裡自己列,不從 'use client' 檔案匯入常數 —
// 伺服器端 import 前端檔案的非元件匯出會變成參照,呼叫 .find 會炸(2026-10-20 踩過)
const TAB_KEYS: TabKey[] = ['variants', 'basic', 'media', 'sale'];

type MediaItem = { type: 'image' | 'video'; url: string };
type ProductRow = {
  id: string;
  sku: string | null;
  slug: string | null;
  name: string;
  description: string | null;
  price_twd: number;
  cost_twd: number | null;
  image_url: string | null;
  media: MediaItem[] | null;
  sale_discount_pct: number | null;
  sale_start_at: string | null;
  sale_end_at: string | null;
  share_focus_x: number | null;
  category: string | null;
  badge: string | null;
  badge_color: string | null;
  status: string;
  product_variants: VariantRowData[] | null;
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

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10 };
const h2: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 700 };
const sub: React.CSSProperties = { fontSize: 12, color: '#71717a', marginTop: 3, lineHeight: 1.5 };
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: '#52525b', marginBottom: 5 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e4e4e7',
  borderRadius: 7, background: '#fff', fontSize: 13, color: '#18181b', fontFamily: 'inherit', minWidth: 0,
};
const readonly: React.CSSProperties = { ...input, background: '#f4f4f5', color: '#71717a', cursor: 'not-allowed' };
// iPadOS 空值 datetime-local 會塌成一條線,給固定高度(同列表頁的教訓)
const dtInput: React.CSSProperties = { ...input, height: 36, WebkitAppearance: 'none', appearance: 'none', display: 'block' };
const ghostLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: '1px solid #e4e4e7',
  borderRadius: 8, background: '#fff', color: '#18181b', fontSize: 13, fontWeight: 600, textDecoration: 'none',
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())}T${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}`;
}

export default async function ProductEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string; err?: string }>;
}) {
  const { tenant: slug, id } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const [{ data: prow }, { data: trows }] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select(
        `id, sku, slug, name, description, price_twd, cost_twd, image_url, media, sale_discount_pct, sale_start_at, sale_end_at, share_focus_x, category, badge, badge_color, status,
         product_variants(id, sku, variant_name, price_twd, cost_twd, stock, image_url, is_bundle, status, sort_order)`,
      )
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .maybeSingle(),
    supabaseAdmin
      .from('product_price_tiers')
      .select('id, product_id, min_qty, price_twd')
      .eq('tenant_id', tenant.id)
      .eq('product_id', id)
      .order('min_qty', { ascending: true }),
  ]);
  const p = (prow ?? null) as unknown as ProductRow | null;
  if (!p) notFound();

  const variants = (p.product_variants ?? []).slice().sort(compareVariantOrder);
  const tiers = ((trows ?? []) as PriceTier[]).map<TierRowData>((t) => ({ id: t.id, min_qty: t.min_qty, price_twd: t.price_twd }));
  const tab: TabKey = TAB_KEYS.includes(sp.tab as TabKey) ? (sp.tab as TabKey) : 'variants';
  const totalStock = variants.filter((v) => v.status === 'active').reduce((s, v) => s + (v.stock ?? 0), 0);
  const cover = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url;
  const publicUrl = `/${tenant.slug}/p/${p.slug ?? p.id}`;

  const saleState = (() => {
    if (p.sale_discount_pct === null || !p.sale_start_at || !p.sale_end_at) return null;
    const now = new Date();
    const start = new Date(p.sale_start_at);
    const end = new Date(p.sale_end_at);
    const fmt = (d: Date) => d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    if (now >= start && now < end) return { color: '#dc2626', text: `${p.sale_discount_pct}% off 生效中,到 ${fmt(end)}` };
    if (now < start) return { color: '#2563eb', text: `${p.sale_discount_pct}% off 排程中,${fmt(start)} 起` };
    return { color: '#a1a1aa', text: '上一檔優惠已過期' };
  })();

  return (
    // 2026-10-20:不設寬度上限,螢幕多寬就用多寬(規格表格欄位多,寬一點更好看)
    <main style={{ padding: '24px 32px 56px', color: '#18181b' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
input:focus, textarea:focus, select:focus { outline: none; border-color: #18181b !important; box-shadow: 0 0 0 3px rgba(24,24,27,.08); }
details summary { list-style: none; cursor: pointer; }
details summary::-webkit-details-marker { display: none; }
/* 手機版:layout 的全域 CSS 會把表格拆成卡片、藏表頭;補欄位小標、規格名置頂、拿掉最小寬度 */
@media (max-width: 767px) {
  .rtable { min-width: 0 !important; }
  .rtable tr { display: flex !important; flex-direction: column; gap: 6px; }
  .rtable td:first-child { font-weight: 400 !important; font-size: 13px !important; }
  .rtable td.rt-title { order: -1; font-weight: 600 !important; font-size: 15px !important; color: #18181b !important; }
  .rtable td[data-label]::before { content: attr(data-label); display: block; font-size: 11px; color: #71717a; margin-bottom: 3px; }
  .rtable td:last-child { font-size: 13px !important; color: inherit !important; }
  .rtable td[colspan] { padding-left: 0 !important; }
}
          `,
        }}
      />
      {sp.saved && <FlashToast message="已儲存" />}
      {sp.err === 'sale' && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          限時優惠儲存失敗,請檢查折扣 % 與起訖時間。
        </div>
      )}

      {/* 跟商城同款的膠囊返回鍵 */}
      <Link
        href={`/admin/${tenant.slug}/products`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px 8px 10px', minHeight: 38,
          boxSizing: 'border-box', background: '#fff', border: '1px solid #e4e4e7', borderRadius: 999,
          fontSize: 13, fontWeight: 600, color: '#18181b', textDecoration: 'none',
        }}
      >
        <IconChevronLeft size={15} /> 商品列表
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', margin: '14px 0 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" style={{ width: 56, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid #f4f4f5', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 56, height: 70, borderRadius: 8, background: '#f4f4f5', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.name}</h1>
            <div style={{ ...sub, fontVariantNumeric: 'tabular-nums' }}>
              {p.category ?? '未分類'} · SKU {p.sku ?? '—'} · {variants.length} 規格 · 庫存 {totalStock}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={ghostLink}>看商品頁 ↗</a>
          <ProductStatusToggle tenantSlug={tenant.slug} productId={p.id} initialActive={p.status === 'active'} />
        </div>
      </div>

      {/* 分頁純前端切換,點了當下就換;四個面板都先掛著,切換不會掉未存的編輯 */}
      <ProductTabs initial={tab} panels={{
        variants: (
        <VariantsTable
          tenantSlug={tenant.slug}
          tenantId={tenant.id}
          productId={p.id}
          productName={p.name}
          defaultPrice={p.price_twd}
          variants={variants}
          tiers={tiers}
        />
        ),

        basic: (
        <form action={updateProduct} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <input type="hidden" name="return_to" value="edit" />
          <input type="hidden" name="tab" value="basic" />
          <input type="hidden" name="image_url" value={p.image_url ?? ''} />
          {/* 上架狀態由頁首開關控制,這裡原樣帶回免得被覆寫 */}
          <input type="hidden" name="status" value={p.status} />
          <div style={{ ...card, padding: '18px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 18px' }}>
            <label style={{ gridColumn: '1 / -1' }}><span style={label}>商品名稱</span><input name="name" defaultValue={p.name} required style={input} /></label>
            <label><span style={label}>分類</span><input name="category" defaultValue={p.category ?? ''} style={input} placeholder="例:精油配件" /></label>
            <label><span style={label}>SKU(系統自動)</span><input name="sku" defaultValue={p.sku ?? ''} readOnly style={readonly} /></label>
            <label><span style={label}>基本售價(新規格的預設價)</span><input name="price_twd" type="number" min={0} defaultValue={p.price_twd} style={input} /></label>
            <label><span style={label}>基本成本</span><input name="cost_twd" type="number" min={0} defaultValue={p.cost_twd ?? ''} style={input} placeholder="—" /></label>
            <label><span style={label}>角標文字(選填,如 HOT、新品。要真的打折請用「促銷」分頁)</span><input name="badge" defaultValue={p.badge ?? ''} maxLength={8} style={input} placeholder="HOT" /></label>
            <label>
              <span style={label}>角標顏色</span>
              <select name="badge_color" defaultValue={p.badge_color ?? ''} style={input}>
                {BADGE_COLORS.map((bc) => <option key={bc.value || 'default'} value={bc.value}>{bc.label}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={label}>商品說明</span>
              <textarea name="description" defaultValue={p.description ?? ''} rows={6} style={{ ...input, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SubmitButton pendingText="儲存中…">儲存基本資料</SubmitButton>
          </div>
        </form>
        ),

        media: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...card, padding: 16 }}>
            <h2 style={h2}>商品圖與影片</h2>
            <p style={{ ...sub, margin: '3px 0 12px' }}>第一格是列表縮圖與商品頁第一張。可排序、加 YouTube 連結、上傳影片(50MB 內)。圖片會自動裁成 3:4 直式。</p>
            <MediaManager productId={p.id} tenantSlug={tenant.slug} media={p.media ?? []} legacyImageUrl={p.image_url} returnTo="edit" />
          </section>
          <section style={{ ...card, padding: 16 }}>
            <h2 style={h2}>分享卡(IG 限時動態 1080×1920)</h2>
            {cover ? (
              <>
                <p style={{ ...sub, margin: '3px 0 12px' }}>
                  手機點按可直接分享到 IG / 訊息。桌機看預覽:
                  <a href={`/api/og/product/${p.id}?v=${p.share_focus_x ?? 50}`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: '#2563eb' }}>開新分頁</a>
                </p>
                <ShareButton productId={p.id} productName={p.name} focusVersion={p.share_focus_x ?? 50} />
                <ShareFocusEditor productId={p.id} tenantSlug={tenant.slug} imageUrl={cover} initialFocus={p.share_focus_x ?? 50} returnTo="edit" />
              </>
            ) : (
              <p style={{ ...sub, color: '#b45309', margin: '3px 0 0' }}>先在上方加一張商品圖,才能產生分享卡。</p>
            )}
          </section>
        </div>
        ),

        sale: (
        <form action={updateProductSale} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="product_id" value={p.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <input type="hidden" name="return_to" value="edit" />
          <input type="hidden" name="tab" value="sale" />
          <section style={{ ...card, padding: '18px 16px' }}>
            <h2 style={h2}>限時優惠</h2>
            <p style={{ ...sub, margin: '3px 0 14px' }}>
              全部規格一律打折,商城卡片會自動出現折扣標。生效期間量購價暫停。折扣 % 留空 = 取消優惠。
              {saleState && <><br /><span style={{ color: saleState.color, fontWeight: 600 }}>{saleState.text}</span></>}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px 18px' }}>
              <label>
                <span style={label}>折扣 % off(10 = 九折、20 = 八折)</span>
                <input name="sale_discount_pct" type="number" min={1} max={99} defaultValue={p.sale_discount_pct ?? ''} style={input} placeholder="例:20" />
              </label>
              <label><span style={label}>開始</span><input name="sale_start_at" type="datetime-local" defaultValue={p.sale_start_at ? toLocalInput(p.sale_start_at) : ''} style={dtInput} /></label>
              <label><span style={label}>結束</span><input name="sale_end_at" type="datetime-local" defaultValue={p.sale_end_at ? toLocalInput(p.sale_end_at) : ''} style={dtInput} /></label>
            </div>
          </section>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SubmitButton pendingText="儲存中…">儲存促銷</SubmitButton>
          </div>
        </form>
        ),
      }} />

      <details style={{ marginTop: 28 }}>
        <summary style={{ fontSize: 12.5, color: '#a1a1aa', width: 'fit-content' }}>進階:刪除這個商品</summary>
        <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#991b1b' }}>
            會連同 {variants.length} 個規格一起刪除,無法復原。已有訂單的商品建議改成「下架」而不是刪除。
          </span>
          <form action={deleteProduct}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <input type="hidden" name="return_to" value="edit" />
            <SubmitButton variant="danger" size="sm" pendingText="刪除中…" confirmText={`確定刪除「${p.name}」?這個動作無法復原。`}>刪除商品</SubmitButton>
          </form>
        </div>
      </details>
    </main>
  );
}
