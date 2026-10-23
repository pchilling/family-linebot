'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronLeft, IconClock, IconFlame, IconZap } from '@/lib/icons';
import { Badge, Button } from '@/lib/ui';
import type { ShopProduct } from './actions';

// 2026-09-03:限時優惠接進 LIFF —— 判斷是否生效 + % off 轉台灣「折」講法
// (跟 page.tsx 共用;放這裡避免 page ↔ modal 循環引用)
export function saleActiveOf(
  p: Pick<ShopProduct, 'sale_discount_pct' | 'sale_start_at' | 'sale_end_at'>,
  nowMs: number,
): boolean {
  return (
    p.sale_discount_pct !== null &&
    p.sale_discount_pct > 0 &&
    !!p.sale_start_at &&
    !!p.sale_end_at &&
    nowMs >= new Date(p.sale_start_at).getTime() &&
    nowMs < new Date(p.sale_end_at).getTime()
  );
}
export function pctToZhe(pct: number): string {
  const keep = 100 - pct; // 10% off → 90 → 9折;15% off → 85 → 85折
  return `${keep % 10 === 0 ? keep / 10 : keep}折`;
}

// Phase 15.2:角標文字色 — 亮色底(如黃)配深字,深色底配白字
export function badgeFg(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#18181b' : '#ffffff';
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

const money = (n: number) => n.toLocaleString('en-US');

type Props = {
  product: ShopProduct;
  onClose: () => void; // 「返回」按鈕觸發
  onAdd: (productId: string, variantId: string, qty: number) => void;
};

/**
 * LIFF 商品 inline detail view(SPA 內切 full-page,不開 modal;2026-10-23 樣式改成跟網頁版商品頁同一套)。
 * 父層 /m/shop 在有 detailId 時隱藏 list,渲染此元件。
 *  - 多張圖橫滑(media image + 各規格圖,fallback image_url)
 *  - 名稱 + 類別 + 價格 + 限時優惠 + 量購 + 規格膠囊 + 數量 + 說明
 *  - 底部固定「加入購物車」(成功後 onClose 自動回列表)
 */
export function ProductDetailModal({ product, onClose, onAdd }: Props) {
  const variants = product.variants;
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstInStock?.id ?? '');
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1'); // 輸入框允許暫時清空
  const [imgIdx, setImgIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? firstInStock;
  const inStock = (selected?.stock ?? 0) > 0;
  const maxQty = selected?.stock ?? 1;
  const hasMulti = variants.length > 1;

  // 限時優惠 — 每秒 tick 更新倒數,單價 / 總價用折後價
  const [nowMs, setNowMs] = useState(() => Date.now());
  const onSale = saleActiveOf(product, nowMs);
  useEffect(() => {
    if (!product.sale_end_at) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [product.sale_end_at]);

  // media 圖 + 各規格圖聯集(去重,media 在前),可滑動
  const images = useMemo(() => {
    const arr: string[] = [];
    for (const m of product.media ?? []) {
      if (m.type === 'image' && !arr.includes(m.url)) arr.push(m.url);
    }
    for (const v of variants) {
      if (v.image_url && !arr.includes(v.image_url)) arr.push(v.image_url);
    }
    if (arr.length === 0 && product.image_url) arr.push(product.image_url);
    return arr;
  }, [product.media, product.image_url, variants]);

  function scrollToImg(i: number) {
    setImgIdx(i);
    const el = scrollerRef.current;
    const target = el?.children[i] as HTMLElement | undefined;
    if (el && target) el.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  }

  // 選規格 → 自動滑到該規格綁定的圖
  useEffect(() => {
    if (!selected?.image_url) return;
    const i = images.indexOf(selected.image_url);
    if (i >= 0) scrollToImg(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const price = selected?.price_twd ?? 0;
  // 分階單價 — 本次數量達門檻就套分階價(與後端 placeOrder 同邏輯;sale 生效時分階暫停);組合規格固定價
  const showTiers = !onSale && product.tiers.length > 0 && !selected?.is_bundle;
  const tierUnit = showTiers ? product.tiers.reduce((u, t) => (qty >= t.min_qty ? t.price_twd : u), price) : price;
  const effPrice = onSale ? Math.round((price * (100 - product.sale_discount_pct!)) / 100) : tierUnit;
  const total = effPrice * qty;
  const saved = price - effPrice;
  const nextTier = showTiers ? product.tiers.find((t) => qty < t.min_qty) : undefined;

  // 進 detail view 時滾到頂
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [product.id]);

  function updateQty(n: number) {
    const c = Math.max(1, Math.min(maxQty || 1, n));
    setQty(c);
    setQtyText(String(c));
  }

  // qty 超過庫存時 clamp
  useEffect(() => {
    if (qty > maxQty) {
      setQty(maxQty || 1);
      setQtyText(String(maxQty || 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, maxQty]);

  function handleAdd() {
    if (!selected || !inStock) return;
    onAdd(product.id, selected.id, qty);
    onClose();
  }

  const stockHint = selected && selected.stock > 0 && selected.stock <= 10 ? `剩 ${selected.stock} 件` : '';

  return (
    <section className="ui-swap" style={{ paddingBottom: 96 }}>
      <div style={{ marginBottom: 14 }}>
        <Button type="button" variant="outline" size="sm" onClick={onClose} aria-label="返回商品列表">
          <IconChevronLeft size={16} /> 返回
        </Button>
      </div>

      {/* 相簿:scroll-snap 手指左右滑 */}
      <div className="pd-main" style={{ marginBottom: 12 }}>
        {images.length > 0 ? (
          <div
            ref={scrollerRef}
            onScroll={() => {
              const el = scrollerRef.current;
              if (!el || el.clientWidth === 0) return;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              setImgIdx(Math.max(0, Math.min(images.length - 1, i)));
            }}
            style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
          >
            {images.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${url}-${i}`} src={url} alt={`${product.name} ${i + 1}`} style={{ position: 'static', flexShrink: 0, width: '100%', height: '100%', objectFit: 'cover', scrollSnapAlign: 'start', display: 'block' }} />
            ))}
          </div>
        ) : (
          <span className="empty">尚無圖片</span>
        )}
        {images.length > 1 && <span className="pd-count"><Badge className="ui-num">{imgIdx + 1} / {images.length}</Badge></span>}
      </div>
      {images.length > 1 && (
        <div className="pd-thumbs" aria-label="商品圖片" style={{ marginBottom: 20 }}>
          {images.map((url, i) => (
            <button key={`${url}-${i}`} type="button" className="pd-thumb" data-on={i === imgIdx ? 'true' : 'false'} onClick={() => scrollToImg(i)} aria-label={`第 ${i + 1} 張`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}

      <div className="pd-info">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {product.category && <Badge>{product.category}</Badge>}
            {onSale && <Badge variant="solid" style={{ background: '#dc2626', borderColor: '#dc2626' }}>限時{pctToZhe(product.sale_discount_pct!)}</Badge>}
          </div>
          <h1 className="pd-h1">{product.name}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="pd-price ui-num" style={onSale ? { color: '#b91c1c' } : undefined}>NT$ {money(effPrice)}</span>
            {saved > 0 && <span className="pd-old ui-num">NT$ {money(price)}</span>}
            {hasMulti && selected && <span className="ui-muted" style={{ fontSize: 14 }}>{selected.variant_name}</span>}
            {!onSale && saved > 0 && <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>量購價,省 NT$ {money(saved)}/件</span>}
          </div>
        </div>

        {onSale && (
          <div className="pd-sale">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><IconFlame size={14} /> 限時{pctToZhe(product.sale_discount_pct!)},全規格適用</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconClock size={13} /> 剩餘 <strong className="ui-num">{formatCountdown(new Date(product.sale_end_at!).getTime() - nowMs)}</strong></span>
          </div>
        )}

        {hasMulti && (
          <div>
            <div className="pd-lbl">規格 {selected && <span>已選:{selected.variant_name}</span>}</div>
            <div className="pd-pills" role="radiogroup" aria-label="規格">
              {variants.map((v) => {
                const isOut = v.stock === 0;
                const on = selectedId === v.id;
                return (
                  <button key={v.id} type="button" className="pd-pill" data-on={on ? 'true' : 'false'} disabled={isOut} aria-pressed={on} onClick={() => { setSelectedId(v.id); updateQty(1); }}>
                    {v.variant_name}
                    <span className="pp ui-num">{isOut ? '售完' : `NT$ ${money(v.price_twd)}`}</span>
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
              {product.tiers.map((t) => {
                const on = qty >= t.min_qty && effPrice === t.price_twd;
                return (
                  <button key={t.min_qty} type="button" className="pd-tier" data-on={on ? 'true' : 'false'} onClick={() => updateQty(Math.min(t.min_qty, maxQty || t.min_qty))}>
                    <b className="ui-num">{t.min_qty}+ 件</b>
                    <span className="ui-num">NT$ {money(t.price_twd)}/件</span>
                  </button>
                );
              })}
            </div>
            {product.variants.some((v) => v.is_bundle) && <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>組合規格為固定價,不再折。</p>}
          </div>
        )}

        {inStock && (
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
                onChange={(ev) => {
                  const digits = ev.target.value.replace(/\D/g, '').slice(0, 5);
                  setQtyText(digits);
                  if (digits !== '') {
                    const n = parseInt(digits, 10);
                    if (n >= 1) {
                      const c = Math.min(maxQty || 1, n);
                      setQty(c);
                      if (n > (maxQty || 1)) setQtyText(String(c)); // 超過庫存直接夾回
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

        {product.description && (
          <div>
            <div className="pd-lbl">商品說明</div>
            <p style={{ margin: 0, fontSize: 14, color: '#3f3f46', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{product.description}</p>
          </div>
        )}
      </div>

      {/* 底部固定:總價 + 加入購物車 */}
      <div className="pd-sticky" style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="ui-muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hasMulti && selected ? `${selected.variant_name} × ${qty}` : `× ${qty}`}
          </span>
          <span className="ui-num" style={{ fontSize: 18, fontWeight: 600, color: onSale ? '#b91c1c' : undefined }}>NT$ {money(total)}</span>
        </div>
        <Button type="button" variant="primary" size="lg" onClick={handleAdd} disabled={!inStock}>
          {inStock ? '加入購物車' : '已售完'}
        </Button>
      </div>
    </section>
  );
}
