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

      {/* 篩選 + 排序 + 匯出(2026-09-08 v2:分類/排序改點擊即套用 chip,對齊商品管理) */}
      {(() => {
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
        const chipStyle = (on: boolean): React.CSSProperties => ({
          display: 'inline-block',
          padding: '7px 14px',
          border: `1px solid ${on ? '#18181b' : '#ddd'}`,
          borderRadius: 999,
          fontSize: 12,
          color: on ? '#fff' : '#52525b',
          background: on ? '#18181b' : '#fff',
          fontWeight: on ? 600 : 400,
          textDecoration: 'none',
          userSelect: 'none',
          touchAction: 'manipulation',
        });
        const sortOptions = [
          { key: 'stock_asc', label: '庫存少→多' },
          { key: 'stock_desc', label: '庫存多→少' },
          { key: 'name', label: '商品名' },
          { key: 'category', label: '分類' },
        ];
        const hasFilter = !!q || selCats.length > 0;
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 16,
              padding: 12,
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 8,
            }}
          >
            <form method="GET" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {selCats.map((cat) => (
                <input key={cat} type="hidden" name="cat" value={cat} />
              ))}
              {sort !== 'stock_asc' && <input type="hidden" name="sort" value={sort} />}
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="搜商品名 / 規格 / SKU"
                style={{ flex: '1 1 180px', maxWidth: 320, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }}
              />
              <button
                type="submit"
                style={{ padding: '8px 16px', background: '#18181b', color: '#fff', border: 0, borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                搜尋
              </button>
              {hasFilter && (
                <a href={`/admin/${slug}/inventory`} style={{ padding: '8px 12px', fontSize: 13, color: '#52525b', textDecoration: 'none', border: '1px solid #ddd', borderRadius: 4, background: '#fff' }}>
                  清除全部
                </a>
              )}
              <a
                href={`/admin/${slug}/inventory/export`}
                style={{ marginLeft: 'auto', padding: '8px 16px', background: '#fff', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                匯出 Excel(CSV)
              </a>
            </form>
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#999', fontWeight: 600, marginRight: 2 }}>分類</span>
                {categories.map((cat) => (
                  <a key={cat} href={toggleCatHref(cat)} style={chipStyle(selCats.includes(cat))}>
                    {cat}
                  </a>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#999', fontWeight: 600, marginRight: 2 }}>排序</span>
              {sortOptions.map((o) => (
                <a key={o.key} href={buildHref(selCats, o.key)} style={chipStyle(sort === o.key)}>
                  {o.label}
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      <section style={section}>
        <h2 style={h2}>商品規格庫存 ({variants.length}{variants.length !== allVariants.length ? ` / ${allVariants.length}` : ''})</h2>
        {variants.length === 0 && <p style={{ color: '#666' }}>(沒有符合的規格)</p>}
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
