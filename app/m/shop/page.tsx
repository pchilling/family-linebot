'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import liff from '@line/liff';
import { BannerHero } from '../../[slug]/banner-hero';
import { CopyButton } from '../../[slug]/order/[order_no]/copy-button';
import { PD_CSS } from '../../[slug]/p/[product]/variant-selector';
import { TwAddressFields } from '@/lib/tw-districts';
import { OtpInput } from '@/lib/otp-input';
import { bgStyleFromLegacy, derivePalette, paletteCssVars } from '@/lib/theme';
import { IconBank, IconCheck, IconCheckCircle, IconChevronLeft, IconCreditCard, IconFlame, IconGift, IconPackage, IconPencil, IconTruck, IconWallet } from '@/lib/icons';
import { Badge, Button, Card, OptionCard, Textarea, UI_CSS } from '@/lib/ui';
import { ProductDetailModal, badgeFg, pctToZhe, saleActiveOf } from './product-detail-modal';
import {
  ecpayPayUrlLiff,
  isEcpayAtmAvailableLiff,
  isEcpayAvailableLiff,
  isLinePayAvailableLiff,
  loadShopData,
  placeOrder,
  startLinePayLiff,
  reportOrderLast5,
  saveShopProfile,
  type ShopProduct,
  type ShopMember,
  type ShopTenant,
  type CartItem,
} from './actions';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_SHOP!;
const money = (n: number) => n.toLocaleString('en-US');

const CSS = `
.ls{max-width:520px;margin:0 auto;padding:12px 16px 40px;min-height:100vh;color:var(--ui-ink);font-family:Inter,"Noto Sans TC",ui-sans-serif,system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.ls *{box-sizing:border-box}
.ls-brand{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.ls-logo{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid var(--ui-line);flex-shrink:0;background:var(--ui-accent);color:var(--ui-on-accent);display:grid;place-items:center;font-size:16px;font-weight:600}
.ls-brand h1{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls-brand p{margin:2px 0 0;font-size:12px;color:var(--ui-muted);display:flex;align-items:center;gap:6px}
.ls-brand p img{width:16px;height:16px;border-radius:50%;border:1px solid var(--ui-line)}
.ls-note{margin:0 0 12px;padding:10px 14px;border-radius:8px;border:1px solid var(--ui-line);background:#fafafa;font-size:12.5px;line-height:1.7;color:#52525b;display:flex;gap:8px;align-items:flex-start}
.ls-note svg{flex-shrink:0;margin-top:3px;color:var(--ui-muted)}
.ls-pills{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ls-pills::-webkit-scrollbar{display:none}
.ls-pill{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--ui-line);background:var(--ui-surface);font:inherit;font-size:13px;font-weight:500;color:var(--ui-ink);cursor:pointer;white-space:nowrap}
.ls-pill[data-on="true"]{background:var(--ui-accent);color:var(--ui-on-accent);border-color:var(--ui-accent)}
.ls-sec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 12px;font-size:14px;font-weight:500}
.ls-sec span{font-size:12px;color:var(--ui-muted);font-weight:400}
.ls-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px}
.ls-card{display:flex;flex-direction:column;gap:8px;text-align:left;background:none;border:0;padding:0;font:inherit;color:var(--ui-ink);cursor:pointer;animation:ui-swap .3s ease backwards;-webkit-tap-highlight-color:transparent}
.ls-card:active .ls-ph{transform:scale(.98)}
.ls-ph{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--ui-line-soft);border:1px solid var(--ui-line);display:flex;align-items:center;justify-content:center;color:#d4d4d8;transition:transform .15s}
.ls-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ls-ph img[data-dim="true"]{opacity:.6}
.ls-on{position:absolute;top:8px;left:8px;z-index:2;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.ls-out{position:absolute;left:8px;bottom:8px;z-index:2;background:rgba(255,255,255,.88)}
.ls-name{font-size:13px;font-weight:500;line-height:1.4;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ls-price{font-size:14px;font-weight:600;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.ls-old{font-size:12px;color:var(--ui-muted);text-decoration:line-through;font-weight:400}
.ls-hint{font-size:11.5px;color:var(--ui-muted)}
.ls-cartbar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));width:calc(100% - 32px);max-width:488px;z-index:50}
.ls-cartbar .ui-btn{width:100%;justify-content:space-between;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.ls-foot{margin-top:28px;padding-top:16px;border-top:1px solid var(--ui-line);font-size:12.5px;color:var(--ui-muted);white-space:pre-wrap;line-height:1.7}
.ls-foot b{display:block;font-size:12px;color:var(--ui-ink);margin-bottom:4px;font-weight:500}
.ls-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.ls-head h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.02em}
.ls-cardb{padding:16px;margin-bottom:12px}
.ls-cardb h3{margin:0 0 12px;font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ls-cardb h3 span{font-size:12px;color:var(--ui-muted);font-weight:400}
.ls-item{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--ui-line-soft)}
.ls-item:first-of-type{border-top:0;padding-top:0}
.ls-th{width:56px;height:70px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-line-soft);overflow:hidden;position:relative;flex-shrink:0;display:grid;place-items:center;color:#d4d4d8}
.ls-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ls-it{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ls-it-n{font-size:14px;font-weight:500;line-height:1.4}
.ls-it-v{font-size:12px;color:var(--ui-muted)}
.ls-it-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}
.ls-qty{display:inline-flex;align-items:center;border:1px solid var(--ui-line);border-radius:6px;height:32px;overflow:hidden;background:var(--ui-surface)}
.ls-qty button{width:32px;height:32px;border:0;background:transparent;font:inherit;font-size:16px;cursor:pointer;color:var(--ui-ink);padding:0}
.ls-qty input{width:40px;height:32px;text-align:center;font:inherit;font-size:13px;font-weight:500;border:0;border-left:1px solid var(--ui-line);border-right:1px solid var(--ui-line);background:transparent;outline:none}
.ls-tot{margin-top:14px;padding-top:12px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:6px;font-size:14px}
.ls-tot .r{display:flex;justify-content:space-between;gap:12px;color:#52525b}
.ls-tot .g{display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;margin-top:2px;border-top:1px solid var(--ui-line);font-weight:600}
.ls-tot .g span:last-child{font-size:22px}
.ls-gift{padding:12px 14px;border-radius:8px;border:1px solid var(--ui-line);background:#fafafa;font-size:13px;display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.ls-gift-t{display:flex;justify-content:space-between;gap:12px;font-weight:500;align-items:center}
.ls-bar{height:6px;border-radius:999px;background:var(--ui-line);overflow:hidden}
.ls-bar div{height:100%;border-radius:999px;background:var(--ui-accent);transition:width .45s cubic-bezier(.3,.8,.4,1)}
.ls-opts{display:flex;flex-direction:column;gap:10px}
.ls-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.ls-field:last-child{margin-bottom:0}
.ls-alert{padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.6;font-weight:500;margin-bottom:12px}
.ls-fine{font-size:12px;color:var(--ui-muted);text-align:center;margin:12px 0 0;line-height:1.6}
.ls-overlay{position:fixed;inset:0;z-index:1000;background:rgba(255,255,255,.85);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}
.ls-status{padding:18px 20px;border-radius:10px;border:1px solid;display:flex;align-items:center;gap:14px;margin-bottom:14px}
.ls-status .ic{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.ls-status h1{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.ls-status p{margin:4px 0 0;font-size:13px;line-height:1.5}
.ls-status .no{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:13px;flex-wrap:wrap}
.ls-next{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.ls-next .ic{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.ls-next b{display:block;font-size:15px;font-weight:600}
.ls-next small{display:block;font-size:12px;color:var(--ui-muted);margin-top:1px}
.ls-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.9;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line);white-space:pre-wrap;overflow-wrap:anywhere}
.ls-report{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.ls-center{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:70vh;text-align:center}
`;

/**
 * LIFF 商品專區(2026-10-23 樣式改成跟網頁版同一套設計系統:顏色由攤位品牌色算、共用 lib/ui 元件;
 * 流程不變:會員資料 gate → 商品列表 / 商品詳情 / 確認訂單 → 訂單成立(匯款資訊 + 回報後 5 碼))
 */
export default function ShopPage() {
  const [status, setStatus] = useState<'loading' | 'need-profile' | 'shop' | 'submitting' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [idToken, setIdToken] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [member, setMember] = useState<ShopMember | null>(null);
  const [tenant, setTenant] = useState<ShopTenant>({
    name: '商品專區',
    logo_url: null,
    banners: [],
    payment_info: null,
    contact_info: null,
    shop_bg_color: null,
    brand_color: null,
    category_order: [],
    shipping_options: [],
    gift_mode: 'stack',
    gift_rules: [],
  });
  const [shipKey, setShipKey] = useState(''); // D#13:結帳選的配送方式 key
  const [shipError, setShipError] = useState(false); // 沒選配送方式的提示
  const [linePayOn, setLinePayOn] = useState(false);
  const [ecpayOn, setEcpayOn] = useState(false);
  const [ecpayAtmOn, setEcpayAtmOn] = useState(false);
  const [payMethod, setPayMethod] = useState<'bank' | 'line_pay' | 'ecpay_atm' | 'ecpay_credit'>('bank');
  // 訂單建好、正在跳去付款頁的那幾秒也要蓋住畫面
  const [leaving, setLeaving] = useState(false);
  const isLinePayPay = linePayOn && payMethod === 'line_pay';
  const isEcpayPay = ecpayOn && (payMethod === 'ecpay_atm' || payMethod === 'ecpay_credit');
  // 上一筆訂單的收件資訊,結帳預填
  const [lastShip, setLastShip] = useState<{ recipient: string | null; phone: string | null; address: string | null } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filter, setFilter] = useState<string>(''); // '' = 全部 / 'latest' / 'sale' / category name
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  // 訂單成立畫面直接回報後 5 碼
  const [last5, setLast5] = useState('');
  const [reportState, setReportState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [reportErr, setReportErr] = useState('');

  // 整套配色由攤位品牌色算出來(跟網頁版 layout 同一個算法)
  const vars = useMemo(
    () => paletteCssVars(derivePalette(tenant.brand_color, bgStyleFromLegacy(tenant.shop_bg_color))),
    [tenant.brand_color, tenant.shop_bg_color],
  );

  async function onReportLast5() {
    if (!/^\d{5}$/.test(last5)) {
      setReportErr('請輸入 5 位數字');
      setReportState('error');
      return;
    }
    setReportState('saving');
    setReportErr('');
    try {
      const r = await reportOrderLast5(idToken, orderNo, last5);
      if (r.ok) {
        setReportState('done');
      } else {
        setReportErr(r.error ?? '回報失敗');
        setReportState('error');
      }
    } catch (e) {
      setReportErr(e instanceof Error ? e.message : String(e));
      setReportState('error');
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const p = await liff.getProfile();
        setLineName(p.displayName);
        setLinePic(p.pictureUrl ?? '');
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF token');
        setIdToken(tok);
        const data = await loadShopData(tok, p.displayName, p.pictureUrl ?? null);
        setProducts(data.products);
        setMember(data.member);
        setTenant(data.tenant);
        setLastShip(data.lastShipping);
        isLinePayAvailableLiff().then(setLinePayOn).catch(() => {});
        isEcpayAvailableLiff()
          .then((on) => {
            setEcpayOn(on);
            if (on) setPayMethod((m) => (m === 'bank' ? 'ecpay_credit' : m));
          })
          .catch(() => {});
        isEcpayAtmAvailableLiff().then(setEcpayAtmOn).catch(() => {});
        // 關鍵圖片(banner / logo / 首屏商品圖)預載完才進頁;最多等 3 秒
        const preloadUrls: string[] = [];
        if (data.tenant.logo_url) preloadUrls.push(data.tenant.logo_url);
        for (const b of data.tenant.banners) {
          if (b.type === 'image') preloadUrls.push(b.url);
        }
        for (const prod of data.products.slice(0, 6)) {
          const img = (prod.media ?? []).find((m) => m.type === 'image')?.url ?? prod.image_url;
          if (img) preloadUrls.push(img);
        }
        await preloadImages(preloadUrls, 3000);
        // Profile gate:沒填 full_name / phone 不能逛
        const hasProfile = !!(data.member?.full_name && data.member?.phone);
        setStatus(hasProfile ? 'shop' : 'need-profile');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  // 切畫面(商品詳情 / 結帳 / 完成)一律從頁頂開始看;送出中不要跳頁頂
  useEffect(() => {
    if (status === 'submitting') return;
    window.scrollTo({ top: 0 });
  }, [detailId, showCheckout, status]);

  // 底色直接塗到 body,iPad 等寬螢幕左右不會露白邊
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = vars['--ui-bg'] ?? '#fafafa';
  }, [vars]);

  async function onSubmitProfile(formData: FormData) {
    setSavingProfile(true);
    setError('');
    formData.set('idToken', idToken);
    try {
      const newMember = await saveShopProfile(formData);
      setMember(newMember);
      setStatus('shop');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // chip filter:全部 / 最新 / 特價中 / 各 category(照 tenant.category_order,沒列的照筆劃排後面)
  const categories = useMemo(() => {
    const found = [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))];
    const ordered = tenant.category_order.filter((c) => found.includes(c));
    const rest = found.filter((c) => !tenant.category_order.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return [...ordered, ...rest];
  }, [products, tenant.category_order]);
  const hasSale = useMemo(() => products.some((p) => saleActiveOf(p, Date.now())), [products]);
  const visibleProducts = useMemo(() => {
    const nowMs = Date.now();
    const isCat = !!filter && categories.includes(filter);
    if (filter === 'latest') {
      const isNewBadge = (p: ShopProduct) => !!p.badge && p.badge.includes('新品');
      return [...products].sort((a, b) => {
        const na = isNewBadge(a) ? 0 : 1;
        const nb = isNewBadge(b) ? 0 : 1;
        if (na !== nb) return na - nb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    if (filter === 'sale') return products.filter((p) => saleActiveOf(p, nowMs));
    const bySortOrder = (a: ShopProduct, b: ShopProduct) =>
      (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'zh-Hant');
    if (isCat) return products.filter((p) => p.category === filter).sort(bySortOrder);
    // 同文字的角標聚成一群;角標群的先後 = 群內最小 sort_order
    const badgeRank = new Map<string, number>();
    for (const p of products) {
      if (!p.badge) continue;
      const r = p.sort_order ?? Number.MAX_SAFE_INTEGER;
      const cur = badgeRank.get(p.badge);
      if (cur === undefined || r < cur) badgeRank.set(p.badge, r);
    }
    return [...products].sort((a, b) => {
      // 「全部」特價優先 → 有角標次之 → 其餘照分類設定順序分組
      const pa = saleActiveOf(a, nowMs) ? 0 : a.badge ? 1 : 2;
      const pb = saleActiveOf(b, nowMs) ? 0 : b.badge ? 1 : 2;
      if (pa !== pb) return pa - pb;
      if (pa === 1) {
        const ga = badgeRank.get(a.badge!) ?? Number.MAX_SAFE_INTEGER;
        const gb = badgeRank.get(b.badge!) ?? Number.MAX_SAFE_INTEGER;
        if (ga !== gb) return ga - gb;
        if (a.badge !== b.badge) return a.badge!.localeCompare(b.badge!, 'zh-Hant');
        return bySortOrder(a, b);
      }
      const ia = a.category ? categories.indexOf(a.category) : categories.length;
      const ib = b.category ? categories.indexOf(b.category) : categories.length;
      if (ia !== ib) return ia - ib;
      return bySortOrder(a, b);
    });
  }, [products, filter, categories]);

  // variantId → variant info(含 product 反查);price_twd 存「折後價」
  const variantMap = useMemo(() => {
    const nowMs = Date.now();
    const m = new Map<string, { variant_name: string; price_twd: number; stock: number; product_id: string; product_name: string; is_bundle: boolean }>();
    for (const p of products) {
      const onSale = saleActiveOf(p, nowMs);
      for (const v of p.variants) {
        const eff = onSale ? Math.round((v.price_twd * (100 - p.sale_discount_pct!)) / 100) : v.price_twd;
        m.set(v.id, { variant_name: v.variant_name, price_twd: eff, stock: v.stock, product_id: p.id, product_name: p.name, is_bundle: v.is_bundle });
      }
    }
    return m;
  }, [products]);

  // 購物車顯示也套分階價(與後端 placeOrder 同邏輯)
  const cartQtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) {
      const v = variantMap.get(c.variant_id);
      if (v && !v.is_bundle) m.set(v.product_id, (m.get(v.product_id) ?? 0) + c.qty);
    }
    return m;
  }, [cart, variantMap]);

  function unitPriceOf(variantId: string): number {
    const v = variantMap.get(variantId);
    if (!v) return 0;
    if (v.is_bundle) return v.price_twd;
    const p = productMap.get(v.product_id);
    if (!p || p.tiers.length === 0 || saleActiveOf(p, Date.now())) return v.price_twd;
    const totalQty = cartQtyByProduct.get(v.product_id) ?? 0;
    let unit = v.price_twd;
    for (const t of p.tiers) {
      if (totalQty >= t.min_qty) unit = t.price_twd;
    }
    return unit;
  }

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + unitPriceOf(c.variant_id) * c.qty, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, variantMap, productMap, cartQtyByProduct],
  );
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  // 運費(有設定 shipping_options 的攤位才有;滿額免運)
  const shipOption = tenant.shipping_options.find((o) => o.key === shipKey) ?? null;
  const shipFee = shipOption ? (shipOption.free_over && cartTotal >= shipOption.free_over ? 0 : shipOption.fee) : 0;
  const grandTotal = cartTotal + shipFee;
  const needShipping = tenant.shipping_options.length > 0;

  // 滿額贈:擇高式只算最高那條;可重複的規則算倍數、也一直有下一個目標
  const gift = useMemo(() => {
    if (tenant.gift_rules.length === 0) return null;
    const reached = tenant.gift_rules.filter((g) => cartTotal >= g.threshold_twd);
    const met = tenant.gift_mode === 'highest' && reached.length > 0 ? [reached.reduce((b, g) => (g.threshold_twd > b.threshold_twd ? g : b))] : reached;
    const earned = met.map((g) => ({ ...g, times: g.repeat ? Math.max(1, Math.floor(cartTotal / g.threshold_twd)) : 1 }));
    const targets = tenant.gift_rules
      .map((g) => (cartTotal < g.threshold_twd ? { g, at: g.threshold_twd } : g.repeat ? { g, at: (Math.floor(cartTotal / g.threshold_twd) + 1) * g.threshold_twd } : null))
      .filter((x): x is { g: (typeof tenant.gift_rules)[number]; at: number } => x !== null)
      .sort((a, b) => a.at - b.at);
    const nextTarget = targets[0] ?? null;
    return { earned, next: nextTarget?.g ?? null, gap: nextTarget ? nextTarget.at - cartTotal : 0, pct: nextTarget ? Math.min(100, Math.round((cartTotal / nextTarget.at) * 100)) : 100 };
  }, [tenant.gift_rules, tenant.gift_mode, cartTotal]);

  function addToCart(productId: string, variantId: string, qty: number = 1) {
    setCart((prev) => {
      const existing = prev.find((c) => c.variant_id === variantId);
      if (existing) return prev.map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty + qty } : c));
      return [...prev, { product_id: productId, variant_id: variantId, qty }];
    });
  }
  function changeQty(variantId: string, delta: number) {
    setCart((prev) => prev.map((c) => (c.variant_id === variantId ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0));
  }
  function setQtyExact(variantId: string, qty: number) {
    setCart((prev) => prev.map((c) => (c.variant_id === variantId ? { ...c, qty } : c)).filter((c) => c.qty > 0));
  }

  async function onSubmitOrder(formData: FormData) {
    setError('');
    // 沒選配送方式時自己擋下並捲回該區塊(LIFF 不顯示原生必填氣泡,看起來像沒反應)
    if (needShipping && !shipKey) {
      setShipError(true);
      document.getElementById('ship-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setShipError(false);
    setStatus('submitting');
    try {
      formData.set('idToken', idToken);
      formData.set('cart', JSON.stringify(cart));
      const { order_no } = await placeOrder(formData);
      // 選 LINE Pay → 直接跳付款頁。發動失敗不擋單,退回完成畫面,客人可從訂單頁再付一次。
      if (isLinePayPay) {
        setLeaving(true);
        const pay = await startLinePayLiff(idToken, order_no);
        if (pay.ok) {
          window.location.href = pay.paymentUrl;
          return;
        }
        setLeaving(false);
        setError('無法前往 LINE Pay,訂單已保留,可從訂單頁再付一次');
      }
      // 選綠界(信用卡 / ATM)→ 導到 /api/ecpay/pay
      if (isEcpayPay) {
        setLeaving(true);
        const url = await ecpayPayUrlLiff(idToken, order_no, payMethod === 'ecpay_atm' ? 'atm' : 'credit');
        if (url) {
          window.location.href = url;
          return;
        }
        setLeaving(false);
        setError('無法前往付款,訂單已保留,可從訂單頁再付一次');
      }
      setOrderNo(order_no);
      setStatus('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('shop');
    }
  }

  const shell = (children: React.ReactNode) => (
    <main className="ls" style={vars as React.CSSProperties}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: UI_CSS + PD_CSS + CSS }} />
      {children}
    </main>
  );

  // 地址元件吃 inline style,給它一組跟 .ui-input 一樣的樣式
  const inputStyle: React.CSSProperties = {
    height: 44, padding: '0 12px', border: '1px solid var(--ui-line)', borderRadius: 6, fontSize: 16, fontFamily: 'inherit',
    background: 'var(--ui-surface)', color: 'var(--ui-ink)', width: '100%', boxSizing: 'border-box',
  };

  if (status === 'loading') {
    return shell(
      <div className="ls-center">
        <span className="ui-spin" style={{ width: 38, height: 38, borderWidth: 3 }} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>商品專區載入中</div>
        <div className="ui-muted" style={{ fontSize: 12 }}>正在準備商品與圖片…</div>
      </div>,
    );
  }
  if (status === 'error') return shell(<div className="ls-alert" style={{ marginTop: 24 }}>錯誤:{error}</div>);

  // Profile gate:沒填會員資料的學員看不到商品,先填 mini-form
  if (status === 'need-profile') {
    return shell(
      <>
        <header style={{ textAlign: 'center', padding: '16px 0 20px' }}>
          {linePic && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={linePic} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--ui-line)', margin: '0 auto 10px', display: 'block' }} />
          )}
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600, letterSpacing: '-.02em' }}>歡迎,{lineName}</h1>
          <p className="ui-muted" style={{ fontSize: 14, margin: '8px 0 0' }}>第一次來?先填一下基本資料就能開始逛。</p>
        </header>
        <Card style={{ padding: 20 }}>
          <form action={onSubmitProfile}>
            <div className="ls-field">
              <label className="ui-label" htmlFor="pf-name" style={{ marginBottom: 0 }}>真實姓名 <i>*</i></label>
              <input id="pf-name" name="full_name" required autoFocus defaultValue={member?.full_name ?? ''} placeholder="您的真實姓名" className="ui-input" style={{ height: 44, fontSize: 16 }} />
            </div>
            <div className="ls-field">
              <label className="ui-label" htmlFor="pf-phone" style={{ marginBottom: 0 }}>電話 <i>*</i></label>
              <input id="pf-phone" name="phone" type="tel" required defaultValue={member?.phone ?? ''} placeholder="0900-000-000" className="ui-input" style={{ height: 44, fontSize: 16 }} />
            </div>
            <div className="ls-field">
              <label className="ui-label" htmlFor="pf-addr" style={{ marginBottom: 0 }}>地址(出貨用,選填)</label>
              <input id="pf-addr" name="address" defaultValue={member?.address ?? ''} placeholder="出貨 / 通訊地址" className="ui-input" style={{ height: 44, fontSize: 16 }} />
            </div>
            <div className="ls-field">
              <label className="ui-label" htmlFor="pf-mid" style={{ marginBottom: 0 }}>ID(會員編號,選填)</label>
              <input id="pf-mid" name="member_id" placeholder="例:1234567" className="ui-input" style={{ height: 44, fontSize: 16 }} />
            </div>
            <div className="ls-field">
              <label className="ui-label" htmlFor="pf-ref" style={{ marginBottom: 0 }}>介紹人 ID(選填)</label>
              <input id="pf-ref" name="referrer_member_id" placeholder="介紹你來的人的 ID" className="ui-input" style={{ height: 44, fontSize: 16 }} />
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={savingProfile} style={{ width: '100%', marginTop: 16 }}>
              {savingProfile ? '儲存中…' : '建立會員資料,開始逛'}
            </Button>
            {error && <div className="ls-alert" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
          </form>
        </Card>
      </>,
    );
  }

  if (status === 'done') {
    const acct = extractBankAccount(tenant.payment_info);
    return shell(
      <>
        <div className="ls-status ui-swap" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginTop: 8 }}>
          <span className="ic" style={{ background: '#dcfce7' }}><IconCheckCircle size={20} /></span>
          <div style={{ minWidth: 0 }}>
            <h1>訂單已建立</h1>
            <p>{tenant.payment_info ? '匯款後回報帳號後 5 碼,賣家核帳後就會安排出貨' : '客服會盡快聯繫您確認付款與出貨'}</p>
            <div className="no"><em style={{ fontStyle: 'normal', whiteSpace: 'nowrap' }}>訂單編號</em> <strong className="ui-num">{orderNo}</strong><CopyButton text={orderNo} /></div>
          </div>
        </div>

        <Card className="ls-cardb">
          <div className="ls-next">
            <span className="ic" style={{ background: '#fef3c7', color: '#b45309' }}><IconBank size={17} /></span>
            <div><b>{tenant.payment_info ? '下一步:匯款' : '下一步:等候聯繫'}</b><small>{tenant.payment_info ? '匯款後填帳號後 5 碼,賣家核帳後轉已付款' : '請保留訂單編號,客服會主動聯繫您'}</small></div>
          </div>
          {tenant.payment_info && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="ls-mono">{tenant.payment_info}</div>
              {acct && <CopyButton big text={acct} label={`複製帳號 ${acct}`} />}
              <p className="ui-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>晚點匯也沒關係,LINE 通知裡的按鈕隨時可以回報。</p>
            </div>
          )}
        </Card>

        <Card className="ls-cardb">
          {reportState === 'done' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span style={{ color: '#16a34a', display: 'inline-flex' }}><IconCheck size={16} /></span>
              <span style={{ fontWeight: 500 }}>已回報後 5 碼</span>
              <span className="ui-muted" style={{ fontSize: 12 }}>等待賣家核帳</span>
              <span className="ui-num" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 600, letterSpacing: '.2em', color: '#15803d' }}>{last5}</span>
            </div>
          ) : (
            <>
              <div className="ls-next" style={{ marginBottom: 14 }}>
                <span className="ic" style={{ background: 'var(--ui-line-soft)', color: '#52525b' }}><IconPencil size={16} /></span>
                <div><b>回報匯款後 5 碼</b><small>匯款完成後填寫,賣家核帳後訂單即轉為已付款</small></div>
              </div>
              <div className="ls-report">
                <OtpInput value={last5} onChange={setLast5} />
                <Button type="button" variant="primary" size="lg" onClick={onReportLast5} disabled={reportState === 'saving'} style={{ flex: '1 0 auto' }}>
                  {reportState === 'saving' ? '送出中…' : '送出回報'}
                </Button>
              </div>
              {reportState === 'error' && <div className="ls-alert" style={{ marginTop: 10, marginBottom: 0 }}>{reportErr}</div>}
            </>
          )}
        </Card>
      </>,
    );
  }

  // ---------- shop view(列表 / 詳情 / 確認訂單) ----------
  return shell(
    <>
      {(status === 'submitting' || leaving) && (
        <div className="ls-overlay" aria-busy="true" aria-live="polite">
          <span className="ui-spin" style={{ width: 38, height: 38, borderWidth: 3 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>{leaving ? '訂單已成立,正在前往付款…' : '訂單建立中,請稍候…'}</div>
          <div className="ui-muted" style={{ fontSize: 12 }}>請不要重複按送出或關閉畫面</div>
        </div>
      )}

      {/* 頁首:攤位 logo + 名 + 招呼 + banner — 詳情跟結帳時不顯示 */}
      {!detailId && !showCheckout && (
        <header style={{ marginBottom: 16 }}>
          <div className="ls-brand">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ls-logo" src={tenant.logo_url} alt={tenant.name} />
            ) : (
              <span className="ls-logo" aria-hidden>{tenant.name.slice(0, 1)}</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1>{tenant.name}</h1>
              <p>
                {linePic && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={linePic} alt="" />
                )}
                嗨,{lineName || member?.full_name}
              </p>
            </div>
          </div>
          {tenant.banners.length > 0 && <BannerHero banners={tenant.banners} tenantName={tenant.name} />}
        </header>
      )}

      {error && <div className="ls-alert">{error}</div>}

      {!showCheckout && !detailId && (
        <>
          {tenant.gift_rules.length > 0 && (
            <div className="ls-note">
              <IconGift size={15} />
              <span>
                {tenant.gift_rules.map((g) => (
                  <span key={`${g.threshold_twd}-${g.product_name}`} style={{ display: 'block' }}>
                    {g.repeat ? '每滿' : '滿'} NT$ {money(g.threshold_twd)} 送 <strong style={{ fontWeight: 600, color: 'var(--ui-ink)' }}>{g.product_name}</strong>{g.qty > 1 ? ` ×${g.qty}` : ''}
                  </span>
                ))}
              </span>
            </div>
          )}

          {products.length > 0 && categories.length > 0 && (
            <div className="ls-pills" aria-label="分類">
              {[
                { key: '', label: '全部' as React.ReactNode },
                { key: 'latest', label: '最新' as React.ReactNode },
                ...(hasSale ? [{ key: 'sale', label: (<><IconFlame size={12} />特價中</>) as React.ReactNode }] : []),
                ...categories.map((c) => ({ key: c, label: c as React.ReactNode })),
              ].map((c) => (
                <button key={c.key || 'all'} type="button" className="ls-pill" data-on={filter === c.key ? 'true' : 'false'} onClick={() => setFilter(c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="ls-sec">
            <span style={{ fontSize: 14, color: 'var(--ui-ink)', fontWeight: 500 }}>{filter === 'latest' ? '最新商品' : filter === 'sale' ? '特價中' : filter || '所有商品'}</span>
            <span className="ui-num">{visibleProducts.length} 件</span>
          </div>

          {products.length === 0 ? (
            <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ marginBottom: 10, color: '#d4d4d8' }}><IconPackage size={40} /></div>
              <p style={{ fontSize: 15, margin: 0, fontWeight: 500 }}>商品建置中</p>
            </Card>
          ) : (
            <section key={filter || 'all'} className="ls-grid" style={{ paddingBottom: cart.length > 0 ? 80 : 0 }}>
              {visibleProducts.map((p, cardIdx) => {
                const img = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url ?? null;
                const nowMs = Date.now();
                const onSale = saleActiveOf(p, nowMs);
                const prices = p.variants.length > 0 ? p.variants.map((v) => v.price_twd) : [p.price_twd];
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const salePrice = onSale ? Math.round((minPrice * (100 - p.sale_discount_pct!)) / 100) : null;
                const allOut = p.variants.length > 0 && p.variants.every((v) => v.stock === 0);
                return (
                  <button key={p.id} type="button" className="ls-card" onClick={() => setDetailId(p.id)} style={{ animationDelay: `${Math.min(cardIdx, 11) * 45}ms` }}>
                    <div className="ls-ph">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" data-dim={allOut ? 'true' : 'false'} loading={cardIdx < 6 ? 'eager' : 'lazy'} />
                      ) : (
                        <IconPackage size={28} />
                      )}
                      <span className="ls-on">
                        {p.badge && <Badge style={{ background: p.badge_color ?? '#18181b', color: badgeFg(p.badge_color ?? '#18181b'), borderColor: 'transparent' }}>{p.badge}</Badge>}
                      </span>
                      {allOut ? (
                        <Badge className="ls-out">售完</Badge>
                      ) : onSale ? (
                        <Badge className="ls-out">限時{pctToZhe(p.sale_discount_pct!)}</Badge>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <h3 className="ls-name">{p.name}</h3>
                      <div className="ls-price ui-num">
                        {salePrice !== null ? (
                          <>
                            <span style={{ color: '#b91c1c' }}>NT$ {money(salePrice)}</span>
                            <span className="ls-old">NT$ {money(minPrice)}</span>
                          </>
                        ) : (
                          <span>NT$ {money(minPrice)}{maxPrice > minPrice ? ' 起' : ''}</span>
                        )}
                      </div>
                      {!onSale && p.tiers.length > 0 && <span className="ls-hint ui-num">{p.tiers[0].min_qty} 件起 NT$ {money(p.tiers[0].price_twd)}/件</span>}
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          {tenant.contact_info && (
            <footer className="ls-foot">
              <b>聯絡我們</b>
              {tenant.contact_info}
            </footer>
          )}
        </>
      )}

      {/* 底部固定購物車鈕(有東西才出現;詳情頁有自己的底列) */}
      {!showCheckout && !detailId && cart.length > 0 && (
        <div className="ls-cartbar ui-swap">
          <Button type="button" variant="primary" size="lg" onClick={() => setShowCheckout(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
              購物車 <span className="ui-num">{cartCount}</span> 件
            </span>
            <span className="ui-num" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              NT$ <CountUp value={cartTotal} />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </Button>
        </div>
      )}

      {/* ---------- 確認訂單 ---------- */}
      {showCheckout && cart.length > 0 && (
        <section className="ui-swap">
          <div className="ls-head">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCheckout(false)} aria-label="返回">
              <IconChevronLeft size={16} /> 返回
            </Button>
            <h2>確認訂單</h2>
          </div>

          <Card className="ls-cardb">
            <h3>商品明細 <span className="ui-num">{cartCount} 件</span></h3>
            {cart.map((c) => {
              const v = variantMap.get(c.variant_id);
              const p = productMap.get(c.product_id);
              if (!v || !p) return null;
              const unit = unitPriceOf(c.variant_id);
              const img = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url ?? null;
              return (
                <div key={c.variant_id} className="ls-item">
                  <div className="ls-th">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" />
                    ) : (
                      <IconPackage size={20} />
                    )}
                  </div>
                  <div className="ls-it">
                    <div className="ls-it-n">{p.name}</div>
                    {p.variants.length > 1 && <div className="ls-it-v">{v.variant_name}</div>}
                    {unit < v.price_twd && <div className="ls-it-v ui-num" style={{ color: '#15803d', fontWeight: 500 }}>量購價 NT$ {money(unit)}/件</div>}
                    <div className="ls-it-row">
                      <div className="ls-qty">
                        <button type="button" onClick={() => changeQty(c.variant_id, -1)} aria-label="減少">−</button>
                        <CartQtyInput qty={c.qty} max={v.stock > 0 ? v.stock : 9999} onCommit={(n) => setQtyExact(c.variant_id, n)} />
                        <button type="button" onClick={() => changeQty(c.variant_id, 1)} aria-label="增加">+</button>
                      </div>
                      <span className="ui-num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>NT$ {money(unit * c.qty)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="ls-tot">
              <div className="r"><span>商品小計</span><span className="ui-num" style={{ color: 'var(--ui-ink)' }}>NT$ <CountUp value={cartTotal} /></span></div>
              {needShipping && (
                <div className="r">
                  <span>運費{shipOption ? `(${shipOption.label})` : ''}</span>
                  {shipOption ? (
                    <span className="ui-num" style={{ color: shipFee === 0 ? '#15803d' : 'var(--ui-ink)' }}>{shipFee === 0 ? '免運' : `NT$ ${money(shipFee)}`}</span>
                  ) : (
                    <span>請選配送方式</span>
                  )}
                </div>
              )}
              <div className="g"><span>合計</span><span className="ui-num">NT$ <CountUp value={grandTotal} /></span></div>
            </div>
          </Card>

          {gift && (
            <div className="ls-gift">
              <div className="ls-gift-t">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconGift size={14} /> 滿額贈</span>
                <span className="ui-num" style={{ color: gift.next ? 'var(--ui-ink)' : '#15803d' }}>{gift.next ? `還差 NT$ ${money(gift.gap)}` : '已達最高門檻'}</span>
              </div>
              <div className="ls-bar"><div style={{ width: `${gift.pct}%` }} /></div>
              <span className="ui-muted" style={{ lineHeight: 1.6 }}>
                {gift.next && <>{gift.next.repeat ? '每滿' : '滿'} NT$ {money(gift.next.threshold_twd)} 送 {gift.next.product_name}{gift.next.qty > 1 ? ` ×${gift.next.qty}` : ''}</>}
                {gift.earned.length > 0 && (
                  <span style={{ display: 'block', color: '#15803d', fontWeight: 500 }}>
                    已獲得:{gift.earned.map((g) => `${g.product_name}${g.qty * g.times > 1 ? ` ×${g.qty * g.times}` : ''}`).join('、')},會一起出貨
                  </span>
                )}
              </span>
            </div>
          )}

          <form action={onSubmitOrder}>
            {needShipping && (
              <div id="ship-section" className="ui-card ls-cardb" style={{ scrollMarginTop: 16 }}>
                <h3>配送方式 <span>必選</span></h3>
                {shipError && <div className="ls-alert">請先選擇配送方式才能送出訂單</div>}
                <div className="ls-opts" role="radiogroup" aria-label="配送方式">
                  {tenant.shipping_options.map((opt) => {
                    const isFree = !!opt.free_over && cartTotal >= opt.free_over;
                    const isPickupOpt = opt.key === 'pickup';
                    return (
                      <OptionCard
                        key={opt.key}
                        name="shipping_method"
                        value={opt.key}
                        on={shipKey === opt.key}
                        onSelect={() => { setShipKey(opt.key); setShipError(false); }}
                        icon={isPickupOpt ? <IconPackage size={16} /> : <IconTruck size={16} />}
                        title={opt.label}
                        trailing={
                          <span className="ui-num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: isFree || opt.fee === 0 ? '#15803d' : 'var(--ui-ink)' }}>
                            {opt.fee === 0 ? '免運費' : isFree ? '免運' : `NT$ ${money(opt.fee)}`}
                          </span>
                        }
                        desc={opt.free_over ? (isFree ? `已滿 NT$ ${money(opt.free_over)},免運` : `滿 NT$ ${money(opt.free_over)} 免運(還差 NT$ ${money(opt.free_over - cartTotal)})`) : undefined}
                        note={opt.note ? `※ ${opt.note}` : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {(linePayOn || ecpayOn) && (
              <Card className="ls-cardb">
                <h3>付款方式 <span>必選</span></h3>
                <div className="ls-opts" role="radiogroup" aria-label="付款方式">
                  {ecpayOn && (
                    <OptionCard name="payment_method" value="ecpay_credit" on={payMethod === 'ecpay_credit'} onSelect={() => setPayMethod('ecpay_credit')} icon={<IconCreditCard size={16} />} title="信用卡" trailing={<Badge>立即付款</Badge>} desc="送出後前往綠界刷卡,付款完成訂單自動更新" />
                  )}
                  {linePayOn && (
                    <OptionCard name="payment_method" value="line_pay" on={payMethod === 'line_pay'} onSelect={() => setPayMethod('line_pay')} icon={<IconWallet size={16} />} title="LINE Pay" trailing={<Badge>立即付款</Badge>} desc="送出後直接付款,不用回報後 5 碼" />
                  )}
                  {ecpayAtmOn && (
                    <OptionCard name="payment_method" value="ecpay_atm" on={payMethod === 'ecpay_atm'} onSelect={() => setPayMethod('ecpay_atm')} icon={<IconBank size={16} />} title="ATM 轉帳" trailing={<Badge>免回報</Badge>} desc="送出後取得專屬轉帳帳號,3 天內轉帳,系統自動對帳" />
                  )}
                  <OptionCard name="payment_method" value="bank" on={payMethod === 'bank'} onSelect={() => setPayMethod('bank')} icon={<IconBank size={16} />} title="匯款至店家帳戶" desc="匯款後回報帳號後 5 碼,等待人工核帳" />
                </div>
              </Card>
            )}

            <Card className="ls-cardb">
              <h3>收件資訊</h3>
              {/* 預填上一筆訂單的收件資訊(沒有才 fallback 會員資料),可自由改掉 */}
              <div className="ls-field">
                <label className="ui-label" htmlFor="ck-recipient" style={{ marginBottom: 0 }}>收件人姓名 <i>*</i></label>
                <input id="ck-recipient" name="recipient" defaultValue={lastShip?.recipient ?? member?.full_name ?? ''} required className="ui-input" style={{ height: 44, fontSize: 16 }} placeholder="收件人姓名" autoComplete="name" />
              </div>
              <div className="ls-field">
                <label className="ui-label" htmlFor="ck-phone" style={{ marginBottom: 0 }}>電話 <i>*</i></label>
                <input id="ck-phone" name="phone" type="tel" defaultValue={lastShip?.phone ?? member?.phone ?? ''} required className="ui-input" style={{ height: 44, fontSize: 16 }} placeholder="0900-000-000" autoComplete="tel" />
              </div>
              <div className="ls-field">
                <span className="ui-label" style={{ marginBottom: 0 }}>地址 <i>*</i></span>
                <TwAddressFields required initial={lastShip?.address ?? member?.address ?? ''} inputStyle={inputStyle} />
              </div>
              <div className="ls-field">
                <label className="ui-label" htmlFor="ck-note" style={{ marginBottom: 0 }}>備註(選填)</label>
                <Textarea id="ck-note" name="note" rows={2} style={{ fontSize: 16 }} placeholder="如需統編發票或有其他需求,請填寫在這裡" />
              </div>
            </Card>

            <Button type="submit" variant="primary" size="lg" className="ui-num" disabled={status === 'submitting'} style={{ width: '100%' }}>
              {status === 'submitting' ? '處理中,訂單建立中…' : `${isLinePayPay ? '前往 LINE Pay 付款' : isEcpayPay ? '送出並前往付款' : '確認送出'} · NT$ ${money(grandTotal)}`}
            </Button>
          </form>

          <p className="ls-fine">
            {isLinePayPay ? '送出後會跳到 LINE Pay 完成付款,付款成功訂單會自動更新。' : isEcpayPay ? '送出後會前往綠界完成付款,付款成功訂單會自動更新。' : '送出後客服會盡快聯繫您確認付款與出貨。'}
          </p>
        </section>
      )}

      {/* 商品詳情 */}
      {detailId && (() => {
        const dp = productMap.get(detailId);
        if (!dp) return null;
        return <ProductDetailModal product={dp} onClose={() => setDetailId(null)} onAdd={addToCart} />;
      })()}
    </>,
  );
}

/** 從自由文字的匯款資訊抓銀行帳號(一鍵複製用):「帳號:xxx」格式優先;沒有就取最長的連續數字(≥6 碼) */
function extractBankAccount(text: string | null): string | null {
  if (!text) return null;
  const labeled = text.match(/帳號[^0-9]{0,4}([0-9][0-9\- ]{4,})/);
  if (labeled) return labeled[1].replace(/[^0-9]/g, '');
  let best = '';
  for (const run of text.match(/[0-9]{6,}/g) ?? []) {
    if (run.length > best.length) best = run;
  }
  return best || null;
}

/** 購物車數量輸入框:可直接打字改數量;打字過程允許清空,離開欄位時空值/0 恢復原數量 */
function CartQtyInput({ qty, max, onCommit }: { qty: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null); // null = 顯示外部 qty
  return (
    <input
      inputMode="numeric"
      aria-label="數量"
      className="ui-num"
      value={text ?? String(qty)}
      onFocus={() => setText(String(qty))}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '');
        setText(t);
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n > 0) onCommit(Math.min(n, max));
      }}
      onBlur={() => {
        const n = parseInt(text ?? '', 10);
        if (Number.isFinite(n) && n > 0) onCommit(Math.min(n, max));
        setText(null);
      }}
    />
  );
}

/** 金額滾動動畫:value 變動時從舊值補間到新值(350ms ease-out),不硬跳 */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    prevRef.current = to;
    const start = performance.now();
    const dur = 350;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString('en-US')}</>;
}

/** 預載一批圖片,全載完或超過 timeoutMs 就放行(壞圖 / 慢網路不卡死) */
function preloadImages(urls: string[], timeoutMs: number): Promise<void> {
  if (urls.length === 0) return Promise.resolve();
  const jobs = urls.map(
    (u) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = u;
      }),
  );
  return Promise.race([Promise.all(jobs).then(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))]);
}
