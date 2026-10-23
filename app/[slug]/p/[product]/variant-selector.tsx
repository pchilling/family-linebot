'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconClock, IconCreditCard, IconFlame, IconGift, IconHeart, IconTruck, IconZap } from '@/lib/icons';
import { Badge, Button, Stars } from '@/lib/ui';
import { useCart } from '../../cart-state';
import { useFavorites } from '../../favorites-state';

// 本地 type 避免 client component 從 server-only module(supabaseAdmin)拉 runtime
type Variant = {
  id: string;
  sku: string;
  variant_name: string;
  attributes: Record<string, unknown> | null;
  price_twd: number;
  stock: number;
  image_url: string | null;
  is_bundle: boolean; // Phase 16.4:組合品(固定價,不參與分階)
  status: string;
};

type TierLite = { min_qty: number; price_twd: number };
type MediaItem = { type: 'image' | 'video'; url: string };
type SaleInfo = { discountPct: number; startAt: string; endAt: string };

type Props = {
  variants: Variant[];
  tenantSlug: string;
  productId: string;
  productSlug: string | null;
  productName: string;
  productCategory: string | null;
  productImageUrl: string | null;
  productMedia?: MediaItem[];
  tiers?: TierLite[]; // 已 min_qty asc 排序
  sale?: SaleInfo | null; // Phase 9.9:限時優惠
  /** Phase 25:平均星數與則數;沒評價 = null */
  rating?: { avg: number; count: number } | null;
  /** 右欄底下的三行小字:配送 / 付款 / 滿額贈(伺服器照攤位設定算好,沒有就不顯示) */
  notes?: { shipping: string | null; payment: string | null; gift: string | null };
};

const money = (n: number) => n.toLocaleString('en-US');

function pickTierPrice(tiers: TierLite[], qty: number, base: number): number {
  let pick = base;
  for (const t of tiers) {
    if (qty >= t.min_qty) pick = t.price_twd;
    else break;
  }
  return pick;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '已結束';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days} 天 ${hrs} 小時 ${mins} 分`;
  if (hrs > 0) return `${hrs} 小時 ${mins} 分 ${secs} 秒`;
  return `${mins} 分 ${secs} 秒`;
}

const pctToZhe = (pct: number) => {
  const keep = 100 - pct;
  return `${keep % 10 === 0 ? keep / 10 : keep}折`;
};

/** 商品頁樣式;LIFF 的商品詳情(app/m/shop/product-detail-modal.tsx)也共用這份 */
export const PD_CSS = `
.pd{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:start}
.pd-gal{display:flex;flex-direction:column;gap:12px;position:sticky;top:80px}
.pd-main{position:relative;aspect-ratio:4/5;border-radius:8px;overflow:hidden;border:1px solid var(--ui-line);background:var(--ui-line-soft)}
.pd-main img,.pd-main video,.pd-main iframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0;display:block}
.pd-main img[data-fit="contain"]{object-fit:contain;padding:8%}
.pd-main .empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--ui-faint);font-size:13px}
.pd-arrow{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;border:1px solid var(--ui-line);background:rgba(255,255,255,.85);backdrop-filter:blur(6px);color:var(--ui-ink);cursor:pointer;display:grid;place-items:center;padding:0;z-index:2}
.pd-arrow.l{left:10px}.pd-arrow.r{right:10px}
.pd-count{position:absolute;top:10px;right:10px;z-index:2}
.pd-thumbs{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:2px}
.pd-thumbs::-webkit-scrollbar{display:none}
.pd-thumb{width:72px;height:90px;flex-shrink:0;border-radius:6px;overflow:hidden;border:1px solid var(--ui-line);background:var(--ui-line-soft);padding:0;cursor:pointer;position:relative;display:grid;place-items:center;color:var(--ui-muted)}
.pd-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pd-thumb[data-on="true"]{outline:2px solid var(--ui-accent);outline-offset:1px}
.pd-info{display:flex;flex-direction:column;gap:20px}
.pd-h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;line-height:1.2;text-wrap:balance}
.pd-price{font-size:28px;font-weight:600;letter-spacing:-.01em}
.pd-old{font-size:14px;color:var(--ui-muted);text-decoration:line-through}
.pd-lbl{font-size:13px;font-weight:500;display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}
.pd-lbl span{color:var(--ui-muted);font-weight:400}
.pd-pills{display:flex;flex-wrap:wrap;gap:8px}
.pd-pill{min-height:40px;padding:0 14px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-surface);font:inherit;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;color:var(--ui-ink);transition:background .15s,border-color .15s}
.pd-pill:hover{background:var(--ui-line-soft)}
.pd-pill .pp{color:var(--ui-muted);font-size:12px}
.pd-pill[data-on="true"]{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-on-accent)}
.pd-pill[data-on="true"] .pp{color:rgba(255,255,255,.75)}
.pd-pill:disabled{opacity:.45;cursor:not-allowed;text-decoration:line-through}
.pd-tiers{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
.pd-tiers::-webkit-scrollbar{display:none}
.pd-tier{flex-shrink:0;min-width:96px;padding:8px 12px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-surface);font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--ui-ink);transition:background .15s,border-color .15s}
.pd-tier:hover{background:var(--ui-line-soft)}
.pd-tier[data-on="true"]{border-color:var(--ui-accent);box-shadow:0 0 0 1px var(--ui-accent)}
.pd-tier b{font-size:13px;font-weight:600}.pd-tier span{font-size:12px;color:var(--ui-muted)}
.pd-sale{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px}
.pd-qty{display:inline-flex;align-items:center;border:1px solid var(--ui-line);border-radius:6px;height:40px;overflow:hidden;background:var(--ui-surface)}
.pd-qty button{width:40px;height:40px;border:0;background:transparent;font:inherit;font-size:18px;cursor:pointer;color:var(--ui-ink)}
.pd-qty button:hover{background:var(--ui-line-soft)}
.pd-qty button:disabled{color:var(--ui-faint);cursor:not-allowed;background:transparent}
.pd-qty input{width:56px;height:40px;text-align:center;font:inherit;font-size:14px;font-weight:500;border:0;border-left:1px solid var(--ui-line);border-right:1px solid var(--ui-line);background:transparent;outline:none;box-sizing:border-box}
.pd-buy{display:flex;gap:10px;align-items:center}
.pd-buy .ui-btn{flex:1}
.pd-meta{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--ui-line);border-radius:8px;font-size:13px;color:#52525b;background:#fafafa}
.pd-meta div{display:flex;gap:10px;align-items:flex-start;line-height:1.5}
.pd-meta svg{flex-shrink:0;margin-top:2px;color:var(--ui-muted)}
.pd-sticky{display:none}
.pd-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:var(--ui-ink);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:ui-swap .25s ease both;white-space:nowrap}
.pd-toast a{color:#fff;font-weight:600;text-decoration:underline;text-underline-offset:3px}
@media (max-width:1024px){
  .pd{grid-template-columns:1fr;gap:24px}
  .pd-gal{position:static}
  .pd-h1{font-size:22px}.pd-price{font-size:24px}
  .pd-buy{display:none}
  .pd-sticky{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--ui-surface);border-top:1px solid var(--ui-line);padding:10px 20px calc(10px + env(safe-area-inset-bottom));gap:12px;align-items:center}
  .pd-sticky .ui-btn{flex:1}
  .pd-toast{bottom:calc(84px + env(safe-area-inset-bottom))}
}
`;

/**
 * 商品詳情(2026-10-23 改版,照 Phase 24 原型):
 * 電腦版左圖右文 — 左邊 4:5 主圖 + 縮圖列,右邊名稱 / 價格 / 規格膠囊 / 量購 / 數量 / 加入購物車 / 三行小字。
 * 手機版單欄,底部固定「加入購物車」列。圖會跟著規格換(規格自己有圖時)。
 */
export function VariantSelector({
  variants,
  tenantSlug,
  productId,
  productSlug,
  productName,
  productCategory,
  productImageUrl,
  productMedia = [],
  tiers = [],
  sale = null,
  rating = null,
  notes,
}: Props) {
  const router = useRouter();
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState<string>(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1'); // 輸入框允許暫時清空
  const [toast, setToast] = useState<{ text: string; checkout: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addItem } = useCart(tenantSlug);
  const { has: isFav, toggle: toggleFav } = useFavorites(tenantSlug);
  const fav = isFav(productId);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  const selectedInStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 0;

  // ---------- 圖片 ----------
  // 相簿 = 後台 media;沒 media 就用商品主圖。規格自己有圖、又不在相簿裡時,插到最前面
  const gallery = useMemo<MediaItem[]>(() => {
    const base: MediaItem[] = productMedia.length > 0 ? productMedia : productImageUrl ? [{ type: 'image', url: productImageUrl }] : [];
    const vimg = selected?.image_url;
    if (vimg && !base.some((m) => m.url === vimg)) return [{ type: 'image', url: vimg }, ...base];
    return base;
  }, [productMedia, productImageUrl, selected?.image_url]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const vimg = selected?.image_url;
    if (!vimg) return;
    const i = gallery.findIndex((m) => m.url === vimg);
    if (i >= 0) setActive(i);
  }, [selectedId, gallery, selected?.image_url]);
  const activeItem = gallery[Math.min(active, Math.max(0, gallery.length - 1))] ?? null;

  // ---------- 價格 ----------
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sale) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sale]);
  const saleStart = sale ? new Date(sale.startAt).getTime() : 0;
  const saleEnd = sale ? new Date(sale.endAt).getTime() : 0;
  const saleActive = !!sale && now >= saleStart && now < saleEnd;
  const saleCountdown = saleActive ? formatCountdown(saleEnd - now) : null;

  const basePrice = selected?.price_twd ?? 0;
  const saleUnitPrice = saleActive ? Math.round((basePrice * (100 - sale!.discountPct)) / 100) : basePrice;
  // Phase 16.4:組合規格固定價,不參與分階
  const effectivePrice = saleActive ? saleUnitPrice : selected?.is_bundle ? basePrice : pickTierPrice(tiers, qty, basePrice);
  const savedPerUnit = basePrice - effectivePrice;
  const totalPrice = effectivePrice * qty;
  const showTiers = !saleActive && tiers.length > 0 && !selected?.is_bundle;
  const nextTier = showTiers ? tiers.find((t) => qty < t.min_qty) : undefined;

  function updateQty(n: number) {
    const c = Math.max(1, Math.min(maxQty || 1, n));
    setQty(c);
    setQtyText(String(c));
  }

  function showToast(text: string, checkout = true) {
    setToast({ text, checkout });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function addToCart(): boolean {
    if (!selected || !selectedInStock) return false;
    addItem({
      variantId: selected.id,
      productId,
      productSlug,
      productName,
      variantName: selected.variant_name,
      priceTwd: effectivePrice,
      qty,
      imageUrl: selected.image_url ?? productMedia.find((m) => m.type === 'image')?.url ?? productImageUrl,
    });
    return true;
  }
  function handleAdd() {
    if (addToCart()) showToast(`已加入購物車:${productName}`);
  }
  function handleBuyNow() {
    if (addToCart()) router.push(`/${tenantSlug}/checkout`);
  }
  function handleFav() {
    const on = toggleFav(productId);
    showToast(on ? '已加入收藏' : '已取消收藏', false);
  }

  const variantLabel = selected && variants.length > 1 ? selected.variant_name : '';
  const stockHint = selected && selected.stock > 0 && selected.stock <= 10 ? `剩 ${selected.stock} 件` : '';

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PD_CSS }} />
      <div className="pd">
        {/* ---------- 左:相簿 ---------- */}
        <div className="pd-gal">
          <div className="pd-main">
            {activeItem ? renderMedia(activeItem, productName) : <span className="empty">尚無圖片</span>}
            {gallery.length > 1 && (
              <>
                <button type="button" className="pd-arrow l" aria-label="上一張" onClick={() => setActive((i) => (i - 1 + gallery.length) % gallery.length)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <button type="button" className="pd-arrow r" aria-label="下一張" onClick={() => setActive((i) => (i + 1) % gallery.length)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <span className="pd-count"><Badge className="ui-num">{active + 1} / {gallery.length}</Badge></span>
              </>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="pd-thumbs" aria-label="商品圖片">
              {gallery.map((m, i) => (
                <button key={`${m.url}-${i}`} type="button" className="pd-thumb" data-on={i === active ? 'true' : 'false'} onClick={() => setActive(i)} aria-label={`第 ${i + 1} 張`}>
                  {m.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- 右:資訊 ---------- */}
        <div className="pd-info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {productCategory && <Badge>{productCategory}</Badge>}
                {saleActive && <Badge variant="solid" style={{ background: '#dc2626', borderColor: '#dc2626' }}>限時{pctToZhe(sale!.discountPct)}</Badge>}
              </div>
              <Button type="button" variant="outline" size="sm" className="ui-btn-icon" onClick={handleFav} aria-pressed={fav} aria-label={fav ? '取消收藏' : '收藏'} style={{ color: fav ? '#e11d48' : undefined, borderRadius: '50%' }}>
                <IconHeart size={17} filled={fav} />
              </Button>
            </div>
            <h1 className="pd-h1">{productName}</h1>
            {rating && (
              <a href="#reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ui-muted)', textDecoration: 'none' }}>
                <Stars value={rating.avg} size={14} />
                <span className="ui-num">{rating.avg.toFixed(1)}</span>
                <span className="ui-num">({rating.count} 則評價)</span>
              </a>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span className="pd-price ui-num" style={saleActive ? { color: '#b91c1c' } : undefined}>NT$ {money(effectivePrice)}</span>
              {savedPerUnit > 0 && <span className="pd-old ui-num">NT$ {money(basePrice)}</span>}
              {variantLabel && <span className="ui-muted" style={{ fontSize: 14 }}>{variantLabel}</span>}
              {!saleActive && savedPerUnit > 0 && <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>量購價,省 NT$ {money(savedPerUnit)}/件</span>}
            </div>
          </div>

          {saleActive && (
            <div className="pd-sale">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><IconFlame size={14} /> 限時{pctToZhe(sale!.discountPct)},全規格適用</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconClock size={13} /> 剩餘 <strong className="ui-num">{saleCountdown}</strong></span>
            </div>
          )}

          {variants.length === 0 ? (
            <p className="ui-muted" style={{ margin: 0, fontSize: 14 }}>目前沒有可選的規格。</p>
          ) : (
            <>
              {variants.length > 1 && (
                <div>
                  <div className="pd-lbl">規格 {selected && <span>已選:{selected.variant_name}</span>}</div>
                  <div className="pd-pills" role="radiogroup" aria-label="規格">
                    {variants.map((v) => {
                      const on = v.id === selectedId;
                      const out = v.stock <= 0;
                      return (
                        <button key={v.id} type="button" className="pd-pill" data-on={on ? 'true' : 'false'} disabled={out} aria-pressed={on} onClick={() => { setSelectedId(v.id); updateQty(1); }}>
                          {v.variant_name}
                          <span className="pp ui-num">{out ? '售完' : `NT$ ${money(v.price_twd)}`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {showTiers && (
                <div>
                  <div className="pd-lbl">
                    <span style={{ color: 'var(--ui-ink)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconZap size={13} /> 一次買多更便宜</span>
                    {nextTier && <span>再買 {nextTier.min_qty - qty} 件,每件 NT$ {money(nextTier.price_twd)}</span>}
                  </div>
                  <div className="pd-tiers">
                    {tiers.map((t) => {
                      const on = qty >= t.min_qty && effectivePrice === t.price_twd;
                      return (
                        <button key={t.min_qty} type="button" className="pd-tier" data-on={on ? 'true' : 'false'} onClick={() => updateQty(Math.min(t.min_qty, maxQty || t.min_qty))}>
                          <b className="ui-num">{t.min_qty}+ 件</b>
                          <span className="ui-num">NT$ {money(t.price_twd)}/件</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selected && (
                <div>
                  <div className="pd-lbl">數量 {stockHint && <span className="ui-num">{stockHint}</span>}</div>
                  <div className="pd-qty" aria-label="數量">
                    <button type="button" onClick={() => updateQty(qty - 1)} disabled={qty <= 1} aria-label="減少">−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="ui-num"
                      value={qtyText}
                      aria-label="數量"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
                        setQtyText(digits);
                        if (digits !== '') {
                          const n = parseInt(digits, 10);
                          if (n >= 1) {
                            const c = Math.min(maxQty || 1, n);
                            setQty(c);
                            if (n > (maxQty || 1)) setQtyText(String(c));
                          }
                        }
                      }}
                      onBlur={() => {
                        const n = parseInt(qtyText, 10);
                        if (!qtyText || isNaN(n) || n < 1) updateQty(1);
                        else updateQty(n);
                      }}
                    />
                    <button type="button" onClick={() => updateQty(qty + 1)} disabled={qty >= maxQty} aria-label="增加">+</button>
                  </div>
                </div>
              )}

              <div className="pd-buy">
                <Button type="button" variant="primary" size="lg" className="ui-num" onClick={handleAdd} disabled={!selectedInStock}>
                  {selectedInStock ? `加入購物車 · NT$ ${money(totalPrice)}` : '此規格已售完'}
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={handleBuyNow} disabled={!selectedInStock}>立即購買</Button>
              </div>
            </>
          )}

          {notes && (notes.shipping || notes.payment || notes.gift) && (
            <div className="pd-meta">
              {notes.shipping && <div><IconTruck size={16} /><span>{notes.shipping}</span></div>}
              {notes.payment && <div><IconCreditCard size={16} /><span>{notes.payment}</span></div>}
              {notes.gift && <div><IconGift size={16} /><span>{notes.gift}</span></div>}
            </div>
          )}
        </div>
      </div>

      {/* 手機版固定底列 */}
      {variants.length > 0 && selected && (
        <div className="pd-sticky">
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className="ui-muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variantLabel ? `${variantLabel} × ${qty}` : `× ${qty}`}</span>
            <span className="ui-num" style={{ fontSize: 18, fontWeight: 600 }}>NT$ {money(totalPrice)}</span>
          </div>
          <Button type="button" variant="primary" size="lg" onClick={handleAdd} disabled={!selectedInStock}>
            {selectedInStock ? '加入購物車' : '已售完'}
          </Button>
        </div>
      )}

      {toast && (
        <div className="pd-toast" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          <span>{toast.text}</span>
          {toast.checkout && <a href={`/${tenantSlug}/checkout`}>去結帳</a>}
        </div>
      )}
    </div>
  );
}

function renderMedia(m: MediaItem, alt: string) {
  if (m.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.url} alt={alt} />;
  }
  const yt = parseYouTubeId(m.url);
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?autoplay=0&mute=1&playsinline=1&rel=0`}
        title={alt}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <video src={m.url} controls muted loop playsInline autoPlay />;
}

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}
