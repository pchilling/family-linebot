'use client';

/**
 * 商品列表(Phase 24,2026-10-23 改版)
 *
 * 左邊篩選(分類附件數、價格區間、只看有貨、特價中)、右上搜尋與排序、已選條件標籤、
 * 商品格(4:5 圖、角標、售完、特價原價劃線、低庫存、規格數)、單規格商品卡上直接加入購物車、
 * 載入更多。手機版篩選收進底部抽屜,頂部多一排分類膠囊。
 * 所有篩選排序在前端做(商品量幾十到幾百件,一次載完比來回問伺服器快)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from './cart-state';
import { Badge, Button, ButtonLink, Checkbox, Input, Select, Stars, Switch } from '@/lib/ui';

export type ListingProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  image: string | null;
  fit: 'cover' | 'contain';
  badge: string | null;
  badgeColor: string | null;
  saleActive: boolean;
  salePct: number;
  lo: number;
  hi: number;
  stock: number;
  variantCount: number;
  /** 單規格商品才有,卡片上可直接加入購物車 */
  single: { id: string; name: string; price: number; image: string | null } | null;
  tierHint: string | null;
  createdAt: string;
  /** 「精選排序」的名次(伺服器照特價 → 角標群 → 分類順序 → 手動排序算好) */
  rank: number;
  /** Phase 25:平均星數與評價數;沒評價 = null(卡片上就不畫星星,不放假的) */
  rating: { avg: number; count: number } | null;
};

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'rating';
const PAGE = 18;

const money = (n: number) => n.toLocaleString('en-US');
const pctToZhe = (pct: number) => {
  const keep = 100 - pct;
  return `${keep % 10 === 0 ? keep / 10 : keep}折`;
};
const badgeFg = (bg: string) => {
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#18181b' : '#ffffff';
};
const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const CSS = `
.sl-layout{display:grid;grid-template-columns:15rem minmax(0,1fr);gap:56px;align-items:start}
.sl-side{position:sticky;top:88px}
.sl-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--ui-line);font-size:14px;font-weight:500}
.sl-fset{display:flex;flex-direction:column;gap:12px;padding:24px 0;border:0;border-bottom:1px solid var(--ui-line);margin:0;min-width:0}
.sl-fset:last-child{border-bottom:0}
.sl-legend{font-size:12px;color:var(--ui-muted);letter-spacing:.06em;padding:0;margin-bottom:2px}
.sl-field{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;min-height:20px}
.sl-field[data-dis="true"]{opacity:.5;cursor:default}
.sl-cnt{margin-left:auto;font-size:12px;color:var(--ui-muted)}
.sl-slider{position:relative;height:20px;display:flex;align-items:center}
.sl-slider .t{position:absolute;left:0;right:0;height:8px;border-radius:999px;background:var(--ui-line-soft);overflow:hidden}
.sl-slider .r{position:absolute;height:8px;border-radius:999px;background:var(--ui-accent)}
.sl-slider input[type=range]{position:absolute;left:0;right:0;width:100%;margin:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none;height:20px}
.sl-slider input[type=range]::-webkit-slider-runnable-track{background:transparent;height:20px}
.sl-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid var(--ui-accent);cursor:pointer}
.sl-slider input[type=range]::-moz-range-thumb{pointer-events:auto;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid var(--ui-accent);cursor:pointer}
.sl-slider input[type=range]::-moz-range-track{background:transparent}
.sl-cats{display:none}
.sl-tb{display:flex;flex-direction:column;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--ui-line)}
.sl-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sl-left{display:flex;align-items:center;gap:12px;min-width:0}
.sl-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sl-filterbtn{display:none}
.sl-search{width:200px;padding-left:34px;background:var(--ui-surface) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/></svg>") no-repeat 10px center}
.sl-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;list-style:none;margin:0;padding:0}
.sl-chip{height:28px;gap:4px;padding:0 4px 0 10px;font-weight:400}
.sl-chip button{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:50%;background:none;color:var(--ui-muted);cursor:pointer;padding:0}
.sl-chip button:hover{background:var(--ui-line-soft);color:var(--ui-ink)}
.sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:32px 24px;padding-top:24px}
.sl-card{position:relative;display:flex;flex-direction:column;gap:12px;text-decoration:none;color:var(--ui-ink)}
.sl-ph{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--ui-line-soft);border:1px solid var(--ui-line);display:flex;align-items:center;justify-content:center}
.sl-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .3s ease-out}
.sl-ph img[data-fit="contain"]{object-fit:contain;padding:12%}
.sl-card:hover .sl-ph img{transform:scale(1.05)}
.sl-ph img[data-dim="true"]{opacity:.6}
.sl-on{position:absolute;top:10px;left:10px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px)}
.sl-on.r{left:auto;right:10px}.sl-on.b{top:auto;bottom:10px}
.sl-qa{position:absolute;left:10px;right:10px;bottom:10px;height:36px;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s;z-index:2;font-size:13px}
.sl-card:hover .sl-qa,.sl-qa:focus-visible{opacity:1;transform:none}
.sl-name{font-size:14px;font-weight:500;line-height:1.45;margin:0;text-wrap:pretty}
.sl-price{font-size:14px;font-weight:600;white-space:nowrap;flex-shrink:0}
.sl-old{font-size:12px;color:var(--ui-muted);text-decoration:line-through;margin-right:6px;font-weight:400}
.sl-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ui-muted);min-height:16px}
.sl-empty{margin-top:24px;padding:64px 24px;border:1px solid var(--ui-line);border-radius:8px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px}
.sl-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--ui-ink);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:ui-swap .25s ease both}
.sl-toast a{color:#fff;font-weight:600;text-decoration:underline;text-underline-offset:3px}
@media (max-width:1024px){
  .sl-layout{display:block}
  .sl-side{position:static}
  .sl-cats{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .sl-cats::-webkit-scrollbar{display:none}
  .sl-pill{flex-shrink:0;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--ui-line);background:var(--ui-surface);font:inherit;font-size:13px;font-weight:500;color:var(--ui-ink);cursor:pointer;white-space:nowrap}
  .sl-pill[data-on="true"]{background:var(--ui-accent);color:var(--ui-on-accent);border-color:var(--ui-accent)}
  .sl-filterbtn{display:inline-flex}
  .sl-search{width:36px;padding-left:34px;padding-right:0;transition:width .2s}
  .sl-search:focus,.sl-search[data-open="true"]{width:100%;padding-right:12px}
  .sl-right{flex:1;justify-content:flex-end}
  .sl-qa{opacity:1;transform:none;left:auto;right:8px;bottom:8px;width:36px;height:36px;padding:0;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.2)}
  .sl-qa span{display:none}
  .sl-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 14px;padding-top:16px}
}
`;

type Filters = { cats: string[]; min: number; max: number; inStock: boolean; onSale: boolean; q: string };

export function ShopListing({
  slug,
  products,
  categories,
}: {
  slug: string;
  products: ListingProduct[];
  categories: string[];
}) {
  const priceMax = useMemo(() => {
    const top = Math.max(0, ...products.map((p) => p.hi));
    return Math.max(100, Math.ceil(top / 100) * 100);
  }, [products]);
  const [f, setF] = useState<Filters>({ cats: [], min: 0, max: priceMax, inStock: false, onSale: false, q: '' });
  const [sort, setSort] = useState<Sort>('featured');
  const [shown, setShown] = useState(PAGE);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addItem } = useCart(slug);

  // 網址 ?cat= 帶進來的分類(例如從 LINE 貼的連結),載入時套上
  useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get('cat');
    if (cat && categories.includes(cat)) setF((cur) => ({ ...cur, cats: [cat] }));
  }, [categories]);
  // 抽屜打開時鎖住底層捲動
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const update = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setShown(PAGE);
  };
  const matches = (p: ListingProduct, ignoreCat = false) => {
    const q = f.q.trim().toLowerCase();
    return (
      (ignoreCat || f.cats.length === 0 || f.cats.includes(p.category)) &&
      p.hi >= f.min &&
      p.lo <= f.max &&
      (!f.inStock || p.stock > 0) &&
      (!f.onSale || p.saleActive) &&
      (!q || p.name.toLowerCase().includes(q))
    );
  };

  const filtered = products.filter((p) => matches(p));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price-asc') return a.lo - b.lo;
    if (sort === 'price-desc') return b.hi - a.hi;
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'rating') {
      // 有評價的排前面,先比平均再比則數;都沒評價的照精選順序
      const ra = a.rating?.avg ?? -1;
      const rb = b.rating?.avg ?? -1;
      if (ra !== rb) return rb - ra;
      const ca = a.rating?.count ?? 0;
      const cb = b.rating?.count ?? 0;
      if (ca !== cb) return cb - ca;
    }
    return a.rank - b.rank;
  });
  const visible = sorted.slice(0, shown);
  const catRows = categories.map((c) => ({
    name: c,
    count: products.filter((p) => p.category === c && matches(p, true)).length,
    checked: f.cats.includes(c),
  }));
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (f.q.trim()) chips.push({ key: 'q', label: `搜尋:${f.q.trim()}`, remove: () => update({ q: '' }) });
  f.cats.forEach((c) => chips.push({ key: `c-${c}`, label: c, remove: () => update({ cats: f.cats.filter((x) => x !== c) }) }));
  if (f.min !== 0 || f.max !== priceMax) chips.push({ key: 'p', label: `NT$ ${money(f.min)} – ${money(f.max)}`, remove: () => update({ min: 0, max: priceMax }) });
  if (f.inStock) chips.push({ key: 's', label: '只看有貨', remove: () => update({ inStock: false }) });
  if (f.onSale) chips.push({ key: 'o', label: '特價中', remove: () => update({ onSale: false }) });
  const clearAll = () => update({ cats: [], min: 0, max: priceMax, inStock: false, onSale: false, q: '' });
  const pct = (v: number) => (priceMax > 0 ? (v / priceMax) * 100 : 0);

  function quickAdd(e: React.MouseEvent, p: ListingProduct) {
    e.preventDefault();
    e.stopPropagation();
    if (!p.single) return;
    addItem({
      variantId: p.single.id,
      productId: p.id,
      productSlug: p.slug,
      productName: p.name,
      variantName: p.single.name,
      priceTwd: p.saleActive ? Math.round((p.single.price * (100 - p.salePct)) / 100) : p.single.price,
      qty: 1,
      imageUrl: p.single.image ?? p.image,
    });
    setToast(`已加入購物車:${p.name}`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  const panel = (
    <div>
      <fieldset className="sl-fset">
        <legend className="sl-legend">分類</legend>
        {catRows.map((c) => {
          const dis = c.count === 0 && !c.checked;
          return (
            <label key={c.name} className="sl-field" data-dis={dis ? 'true' : 'false'}>
              <Checkbox checked={c.checked} disabled={dis} onChange={() => update({ cats: toggleIn(f.cats, c.name) })} />
              <span>{c.name}</span>
              <span className="sl-cnt ui-num">{c.count}</span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="sl-fset" style={{ gap: 16 }}>
        <legend className="sl-legend">價格</legend>
        <div className="sl-slider">
          <div className="t" />
          <div className="r" style={{ left: `${pct(f.min)}%`, width: `${pct(f.max) - pct(f.min)}%` }} />
          <input type="range" min={0} max={priceMax} step={10} value={f.min} aria-label="最低價格" onChange={(e) => update({ min: Math.min(Number(e.target.value), f.max - 10) })} />
          <input type="range" min={0} max={priceMax} step={10} value={f.max} aria-label="最高價格" onChange={(e) => update({ max: Math.max(Number(e.target.value), f.min + 10) })} />
        </div>
        <div className="ui-num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span>NT$ {money(f.min)}</span>
          <span>NT$ {money(f.max)}{f.max === priceMax ? '+' : ''}</span>
        </div>
      </fieldset>
      <fieldset className="sl-fset">
        <label className="sl-field">
          <span>只看有貨</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Switch checked={f.inStock} onChange={(e) => update({ inStock: e.target.checked })} aria-label="只看有貨" /></span>
        </label>
      </fieldset>
      <fieldset className="sl-fset">
        <label className="sl-field">
          <span>特價中</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Switch checked={f.onSale} onChange={(e) => update({ onSale: e.target.checked })} aria-label="特價中" /></span>
        </label>
      </fieldset>
    </div>
  );

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sl-layout">
        <aside className="sl-side ui-hide-mobile" aria-label="篩選">
          <div className="sl-head">
            <span>篩選</span>
            <Button variant="ghost" size="xs" onClick={clearAll} disabled={chips.length === 0}>清除全部</Button>
          </div>
          {panel}
        </aside>

        <section aria-label="商品" style={{ minWidth: 0 }}>
          <div className="sl-cats" aria-label="分類">
            <button type="button" className="sl-pill" data-on={f.cats.length === 0 ? 'true' : 'false'} onClick={() => update({ cats: [] })}>全部</button>
            {catRows.map((c) => (
              <button key={c.name} type="button" className="sl-pill" data-on={c.checked ? 'true' : 'false'} onClick={() => update({ cats: toggleIn(f.cats, c.name) })}>{c.name}</button>
            ))}
          </div>

          <div className="sl-tb">
            <div className="sl-row">
              <div className="sl-left">
                <Button variant="outline" size="sm" className="sl-filterbtn" onClick={() => setSheet(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></svg>
                  篩選{chips.length > 0 && <span className="ui-num">({chips.length})</span>}
                </Button>
                <span className="ui-num ui-muted" style={{ fontSize: 14 }} aria-live="polite">{filtered.length} 件商品</span>
              </div>
              <div className="sl-right">
                <Input
                  type="search"
                  className="ui-input-sm sl-search"
                  placeholder="搜尋商品"
                  aria-label="搜尋商品"
                  value={f.q}
                  data-open={searchOpen || f.q ? 'true' : 'false'}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setSearchOpen(false)}
                  onChange={(e) => update({ q: e.target.value })}
                />
                <Select className="ui-input-sm" aria-label="排序" value={sort} onChange={(e) => { setSort(e.target.value as Sort); setShown(PAGE); }} style={{ width: 'auto', minWidth: 150 }}>
                  <option value="featured">精選排序</option>
                  <option value="price-asc">價格:低到高</option>
                  <option value="price-desc">價格:高到低</option>
                  <option value="newest">最新上架</option>
                  <option value="rating">評價最高</option>
                </Select>
              </div>
            </div>
            {chips.length > 0 && (
              <ul className="sl-chips" aria-label="已選條件">
                {chips.map((ch) => (
                  <li key={ch.key} className="ui-swap">
                    <Badge className="sl-chip">
                      {ch.label}
                      <button type="button" onClick={ch.remove} aria-label={`移除 ${ch.label}`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </Badge>
                  </li>
                ))}
                <li><Button variant="link" size="xs" onClick={clearAll}>清除全部</Button></li>
              </ul>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="sl-empty ui-swap">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>沒有符合條件的商品</h3>
                <p className="ui-muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>把價格範圍放寬一點,或少勾幾個分類試試。</p>
              </div>
              <Button variant="outline" onClick={clearAll}>清除篩選</Button>
            </div>
          ) : (
            <div className="sl-grid">
              {visible.map((p, i) => {
                const salePrice = p.saleActive ? Math.round((p.lo * (100 - p.salePct)) / 100) : p.lo;
                const soldOut = p.stock <= 0;
                return (
                  <a key={p.id} href={`/${slug}/p/${p.slug}`} className="sl-card ui-swap" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                    <div className="sl-ph">
                      <span className="ui-muted" style={{ fontSize: 13 }}>{p.category}</span>
                      {p.image && <img src={p.image} alt="" loading={i < 6 ? 'eager' : 'lazy'} data-fit={p.fit} data-dim={soldOut ? 'true' : 'false'} />}
                      {p.badge && (
                        <Badge className="sl-on" style={{ background: p.badgeColor ?? '#18181b', color: badgeFg(p.badgeColor ?? '#18181b'), borderColor: 'transparent' }}>{p.badge}</Badge>
                      )}
                      {soldOut && <Badge className="sl-on r">售完</Badge>}
                      {p.saleActive && !soldOut && <Badge className="sl-on b">限時{pctToZhe(p.salePct)}</Badge>}
                      {!soldOut && (
                        p.single ? (
                          <Button variant="primary" size="sm" className="sl-qa" onClick={(e) => quickAdd(e, p)} aria-label={`加入購物車:${p.name}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                            <span>加入購物車</span>
                          </Button>
                        ) : (
                          <ButtonLink href={`/${slug}/p/${p.slug}`} variant="primary" size="sm" className="sl-qa" aria-label={`選規格:${p.name}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                            <span>選規格</span>
                          </ButtonLink>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                        <h3 className="sl-name">{p.name}</h3>
                        <span className={`sl-price ui-num${p.saleActive ? ' sl-sale' : ''}`} style={p.saleActive ? { color: '#b91c1c' } : undefined}>
                          {p.saleActive && <span className="sl-old">NT$ {money(p.lo)}</span>}
                          NT$ {money(salePrice)}{!p.saleActive && p.hi > p.lo ? ' 起' : ''}
                        </span>
                      </div>
                      {p.rating && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ui-muted)' }}>
                          <Stars value={p.rating.avg} size={13} />
                          <span className="ui-num">{p.rating.avg.toFixed(1)}</span>
                          <span className="ui-num">({p.rating.count})</span>
                        </div>
                      )}
                      <div className="sl-meta">
                        <span>{p.variantCount > 1 ? `${p.variantCount} 種規格` : p.tierHint ?? ''}</span>
                        {p.stock > 0 && p.stock <= 5 && <span className="ui-num" style={{ color: '#b45309', fontWeight: 500 }}>剩 {p.stock} 件</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {filtered.length > shown && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <Button variant="outline" size="md" className="ui-num" onClick={() => setShown(shown + PAGE)}>載入更多(還有 {filtered.length - shown} 件)</Button>
            </div>
          )}
        </section>
      </div>

      {sheet && (
        <>
          <div className="ui-sheet-scrim" onClick={() => setSheet(false)} />
          <div className="ui-sheet" role="dialog" aria-modal="true" aria-label="篩選">
            <div className="ui-sheet-head">
              <h3>篩選</h3>
              <p>改了條件結果會馬上更新。</p>
            </div>
            {panel}
            <div className="ui-sheet-foot">
              <Button variant="outline" onClick={clearAll} disabled={chips.length === 0}>清除全部</Button>
              <Button variant="primary" className="ui-num" style={{ flex: 1 }} onClick={() => setSheet(false)}>
                {filtered.length === 0 ? '沒有符合的商品' : `顯示 ${filtered.length} 件商品`}
              </Button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="sl-toast" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          <span>{toast}</span>
          <a href={`/${slug}/checkout`}>去結帳</a>
        </div>
      )}
    </div>
  );
}
