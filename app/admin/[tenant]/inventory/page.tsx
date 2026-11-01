import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { IconAlert, IconDownload, IconLock } from '@/lib/icons';

/**
 * 庫存(2026-11-01 換成後台新設計系統:卡片式清單取代 <table>,篩選與排序用 chip)。
 * 查詢、篩選、排序邏輯不變。
 */

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

// 篩選 + 排序(2026-09-02):資料量小,全撈後在記憶體處理
// 2026-09-08:分類改可複選(對齊商品管理的 chip 篩選)
type InvFilters = { q?: string; cats: string[]; sort?: string };

function applyFilters(variants: VariantStock[], f: InvFilters): VariantStock[] {
  let rows = variants;
  if (f.q) {
    const needle = f.q.toLowerCase();
    rows = rows.filter(
      (v) =>
        (v.products?.name ?? '').toLowerCase().includes(needle) ||
        v.sku.toLowerCase().includes(needle) ||
        v.variant_name.toLowerCase().includes(needle),
    );
  }
  if (f.cats.length > 0) {
    rows = rows.filter((v) => f.cats.includes(v.products?.category ?? '(未分類)'));
  }
  const sorted = [...rows];
  switch (f.sort) {
    case 'stock_desc':
      sorted.sort((a, b) => b.stock - a.stock);
      break;
    case 'name':
      sorted.sort((a, b) => (a.products?.name ?? '').localeCompare(b.products?.name ?? '', 'zh-TW'));
      break;
    case 'category':
      sorted.sort((a, b) =>
        ((a.products?.category ?? '') || '~').localeCompare((b.products?.category ?? '') || '~', 'zh-TW'),
      );
      break;
    default: // stock_asc(預設,缺貨排前面)
      sorted.sort((a, b) => a.stock - b.stock);
  }
  return sorted;
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
    // 2026-09-02 改字:扣庫存發生在「下單」當下,原本寫「出貨(訂單)」會誤導成出貨才扣
    order: '下單扣庫存',
    order_cancel: '取消退回',
    restock: '進貨',
    damage: '損耗',
    manual_adjust: '手動調整',
    inventory_count: '盤點',
  }[r]) ?? r;
}

const VSTATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '上架', cls: 'iv-on' },
  inactive: { label: '暫停', cls: 'iv-off' },
  discontinued: { label: '下架', cls: 'iv-off' },
};

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

const CSS = `
.iv-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.iv-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.iv-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.iv-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:16px;overflow:hidden}
.iv-card h2{margin:0;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;gap:8px}
.iv-card h2 .n{font-weight:400;color:#71717a;font-size:13px}
.iv-low{border-color:#fde68a;background:#fffbeb}
.iv-low h2{color:#92400e;border-bottom-color:#fde68a}
.iv-low ul{margin:0;padding:10px 16px 12px 34px;font-size:13.5px;line-height:1.8;color:#78350f}
.iv-low b{color:#b91c1c}
.iv-filter{display:flex;flex-direction:column;gap:10px;padding:10px 12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:14px}
.iv-filter form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.iv-filter .q{flex:1 1 200px;max-width:340px}
.iv-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.iv-chips .lb{font-size:11.5px;color:#a1a1aa;font-weight:500;margin-right:2px}
.iv-chip{display:inline-flex;align-items:center;height:30px;padding:0 13px;border:1px solid #e4e4e7;border-radius:999px;font-size:12.5px;color:#52525b;background:#fff;text-decoration:none;user-select:none;touch-action:manipulation}
.iv-chip:hover{background:#fafafa}
.iv-chip[data-on="true"]{background:#18181b;border-color:#18181b;color:#fff;font-weight:600}
.iv-row{display:grid;grid-template-columns:1.6fr 150px 120px 110px 80px 90px;gap:12px;align-items:center;padding:11px 16px;border-top:1px solid #f4f4f5;font-size:13.5px}
.iv-row:first-of-type{border-top:0}
.iv-row.head{background:#fafafa;font-size:11.5px;color:#71717a;font-weight:500;padding:8px 16px;border-top:0}
.iv-row .r{text-align:right;font-variant-numeric:tabular-nums}
.iv-row .muted{color:#71717a;font-size:13px}
.iv-row .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:12.5px;color:#71717a}
.iv-row .name{font-weight:500;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.iv-stock{font-weight:700}
.iv-stock.low{color:#b91c1c}.iv-stock.zero{color:#a1a1aa}
.iv-on{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.iv-off{background:#f4f4f5;color:#71717a;border-color:transparent}
.iv-mv{grid-template-columns:120px 1.6fr 90px 110px 1fr}
.iv-delta{font-weight:700;font-variant-numeric:tabular-nums}
.iv-delta.up{color:#15803d}.iv-delta.down{color:#b91c1c}
.iv-empty{padding:28px 16px;text-align:center;color:#71717a;font-size:13.5px}
@media (max-width:767px){
  .iv-head{align-items:flex-start;flex-direction:column}
  .iv-card{border-radius:10px}
  .iv-row{grid-template-columns:1fr auto;gap:4px 12px;padding:12px 14px}
  .iv-row.head{display:none}
  .iv-row > .c-sku,.iv-row > .c-cat{display:none}
  .iv-row > .c-price{grid-column:1;text-align:left}
  .iv-row > .c-stock{grid-column:2;grid-row:1}
  .iv-row > .c-st{grid-column:2;text-align:right}
  .iv-mv{grid-template-columns:1fr auto}
  .iv-mv > .c-time{grid-column:1/-1}
  .iv-mv > .c-note{grid-column:1/-1}
}
`;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string; cat?: string | string[]; sort?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const selCats = Array.isArray(sp.cat) ? sp.cat : sp.cat ? [sp.cat] : [];
  const sort = sp.sort ?? 'stock_asc';
  const filters: InvFilters = { q, cats: selCats, sort };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // Free 不開放 inventory(Pro / Enterprise 才有)
  if (tenant.plan === 'free') {
    return (
      <main style={{ padding: '28px 32px 48px' }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ maxWidth: 720 }}>
          <header className="iv-head">
            <div>
              <h1>庫存</h1>
            </div>
          </header>
          <div className="iv-card iv-low" style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, color: '#b45309' }}><IconLock size={32} /></div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>庫存是專業版以上的功能</div>
            <p style={{ color: '#78350f', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
              升級後可以用:每個規格的庫存、低庫存提醒、進出貨紀錄。<br />
              目前是<strong>免費版</strong>,適合個人、二手、偶爾代購。
            </p>
            <p style={{ color: '#9a7400', fontSize: 13, margin: 0 }}>需要升級請聯繫 NEOP。</p>
          </div>
        </div>
      </main>
    );
  }

  const [allVariants, movements] = await Promise.all([
    getVariants(tenant.id),
    getRecentMovements(tenant.id),
  ]);

  // 低庫存看全部(不受篩選影響);表格套用篩選 + 排序
  const lowStock = allVariants.filter(
    (v) => v.stock <= 3 && v.status === 'active' && v.products?.status === 'active',
  );
  const categories = Array.from(
    new Set(allVariants.map((v) => v.products?.category ?? '(未分類)')),
  ).sort((a, b) => a.localeCompare(b, 'zh-TW'));
  const variants = applyFilters(allVariants, filters);

  const buildHref = (cats: string[], s: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    for (const cat of cats) params.append('cat', cat);
    if (s && s !== 'stock_asc') params.set('sort', s);
    const str = params.toString();
    return `/admin/${slug}/inventory${str ? `?${str}` : ''}`;
  };
  const toggleCatHref = (cat: string) =>
    buildHref(selCats.includes(cat) ? selCats.filter((x) => x !== cat) : [...selCats, cat], sort);
  const sortOptions = [
    { key: 'stock_asc', label: '庫存少到多' },
    { key: 'stock_desc', label: '庫存多到少' },
    { key: 'name', label: '商品名' },
    { key: 'category', label: '分類' },
  ];
  const hasFilter = !!q || selCats.length > 0;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        <header className="iv-head">
          <div>
            <h1>庫存</h1>
            <p>
              {allVariants.length} 個規格
              {lowStock.length > 0 && <> · <span style={{ color: '#b91c1c', fontWeight: 600 }}>{lowStock.length} 個快沒了</span></>}
            </p>
          </div>
          <a href={`/admin/${slug}/inventory/export`} className="ui-btn ui-btn-outline ui-btn-sm">
            <IconDownload size={14} />
            匯出 CSV
          </a>
        </header>

        {lowStock.length > 0 && (
          <div className="iv-card iv-low">
            <h2>
              <IconAlert size={15} />
              低庫存
              <span className="n">{lowStock.length} 個規格庫存 3 以下</span>
            </h2>
            <ul>
              {lowStock.map((v) => (
                <li key={v.id}>
                  <strong>{v.products?.name ?? '(未知)'}</strong>
                  {v.variant_name !== 'default' && <> · {v.variant_name}</>}
                  <span style={{ marginLeft: 6, color: '#a16207', fontSize: 12 }}>{v.sku}</span>
                  {' — 剩 '}
                  <b>{v.stock}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 篩選 + 排序(2026-09-08 v2:分類 / 排序改點擊即套用 chip,對齊商品管理) */}
        <div className="iv-filter">
          <form method="GET">
            {selCats.map((cat) => (
              <input key={cat} type="hidden" name="cat" value={cat} />
            ))}
            {sort !== 'stock_asc' && <input type="hidden" name="sort" value={sort} />}
            <input
              type="search"
              name="q"
              className="ui-input ui-input-sm q"
              defaultValue={q}
              placeholder="搜尋商品名、規格、SKU"
              aria-label="搜尋"
            />
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">搜尋</button>
            {hasFilter && (
              <a href={`/admin/${slug}/inventory`} className="ui-btn ui-btn-ghost ui-btn-sm">清除</a>
            )}
          </form>
          {categories.length > 0 && (
            <div className="iv-chips">
              <span className="lb">分類</span>
              {categories.map((cat) => (
                <a key={cat} href={toggleCatHref(cat)} className="iv-chip" data-on={selCats.includes(cat) ? 'true' : 'false'}>
                  {cat}
                </a>
              ))}
            </div>
          )}
          <div className="iv-chips">
            <span className="lb">排序</span>
            {sortOptions.map((o) => (
              <a key={o.key} href={buildHref(selCats, o.key)} className="iv-chip" data-on={sort === o.key ? 'true' : 'false'}>
                {o.label}
              </a>
            ))}
          </div>
        </div>

        <div className="iv-card">
          <h2>
            規格庫存
            <span className="n">
              {variants.length}
              {variants.length !== allVariants.length ? ` / ${allVariants.length}` : ''} 個
            </span>
          </h2>
          {variants.length === 0 ? (
            <div className="iv-empty">沒有符合的規格。</div>
          ) : (
            <>
              <div className="iv-row head" aria-hidden>
                <span>商品 / 規格</span>
                <span>SKU</span>
                <span>分類</span>
                <span className="r">單價</span>
                <span className="r">庫存</span>
                <span>狀態</span>
              </div>
              {variants.map((v) => {
                const st = VSTATUS[v.status] ?? { label: v.status, cls: 'iv-off' };
                return (
                  <div key={v.id} className="iv-row">
                    <div className="name">
                      <span>{v.products?.name ?? '(已刪除的商品)'}</span>
                      {v.variant_name !== 'default' && <span className="ui-badge">{v.variant_name}</span>}
                    </div>
                    <div className="c-sku mono">{v.sku}</div>
                    <div className="c-cat muted">{v.products?.category ?? '—'}</div>
                    <div className="c-price r">NT$ {v.price_twd.toLocaleString()}</div>
                    <div className={`c-stock r iv-stock ${v.stock === 0 ? 'zero' : v.stock <= 3 ? 'low' : ''}`}>{v.stock}</div>
                    <div className="c-st">
                      <span className={`ui-badge ${st.cls}`}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="iv-card">
          <h2>
            庫存異動
            <span className="n">最近 30 筆</span>
          </h2>
          {movements.length === 0 ? (
            <div className="iv-empty">還沒有異動紀錄。</div>
          ) : (
            <>
              <div className="iv-row iv-mv head" aria-hidden>
                <span>時間</span>
                <span>商品 / 規格</span>
                <span className="r">變動</span>
                <span>原因</span>
                <span>備註</span>
              </div>
              {movements.map((m) => {
                const displaySku = m.product_variants?.sku ?? m.products?.sku ?? null;
                const variantName = m.product_variants?.variant_name;
                return (
                  <div key={m.id} className="iv-row iv-mv">
                    <div className="c-time muted">{formatTw(m.created_at)}</div>
                    <div className="name">
                      <span>{m.products?.name ?? '(已刪除的商品)'}</span>
                      {variantName && variantName !== 'default' && <span className="ui-badge">{variantName}</span>}
                      {displaySku && <span className="mono">{displaySku}</span>}
                    </div>
                    <div className={`r iv-delta ${m.qty_delta > 0 ? 'up' : 'down'}`}>
                      {m.qty_delta > 0 ? '+' : ''}{m.qty_delta}
                    </div>
                    <div className="muted">{reasonLabel(m.reason)}</div>
                    <div className="c-note muted" style={{ fontSize: 12.5 }}>{m.note ?? '—'}</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
