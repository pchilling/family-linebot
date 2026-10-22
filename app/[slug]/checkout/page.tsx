'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../cart-state';
import { TwAddressFields } from '@/lib/tw-districts';
import { IconBank, IconChevronLeft, IconCreditCard, IconGift, IconPackage, IconTruck, IconWallet } from '@/lib/icons';
import { createOrder, getCartPricingInfo, getGiftRulesPublic, getShippingOptions, isEcpayAtmAvailable, isEcpayAvailable, isLinePayAvailable, startLinePay, type CartPricingInfo, type GiftConfigPublic, type ShippingOption } from './actions';

// 2026-10-22:付款方式 — 匯款(人工核帳)/ LINE Pay / 綠界 ATM 虛擬帳號 / 綠界信用卡
type PayMethod = 'bank' | 'line_pay' | 'ecpay_atm' | 'ecpay_credit';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * 2026-10-15:配送 / 付款方式的選項卡樣式。
 * 原本是一排小圓鈕,點擊區小又難看;改成整張卡可點,左邊 icon 磚、右邊自訂圓鈕。
 * 原生 radio 藏起來但保留(鍵盤 Tab / 表單送出照常運作)。
 */
const checkoutCss = `
/* ── 結帳頁設計系統(2026-10-15 改版)─────────────────────────
   底色是攤位自訂的奶油黃 #ffffea、品牌色純黑,配色就從這兩個長出來:
   強調色用植物深綠(草本標籤的經典配色,也避開到處都是的焦糖橘),
   所有邊線改暖色 — 原本用冷灰 #e5e7eb 壓在黃底上會顯髒,是畫面「醜」的主因。
   金額一律走等寬 tabular 數字(全站已載入 JetBrains Mono,不另外加字型),
   上下對齊,呼應店裡賣的「精準分裝」。
   ───────────────────────────────────────────────────── */
.ck {
  --surface: #ffffff;
  --ink: #000000;
  --ink-2: #6b6a58;
  --line: #e7e3c6;
  --line-soft: #f2eedb;
  --green: #0b5d3b;
  --green-wash: #edf3ea;
  --alert: #b3261e;
  max-width: 620px;
  margin: 0 auto;
}
.num {
  font-family: var(--font-geist-mono), ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.ck-back {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 8px 15px 8px 11px; min-height: 38px; box-sizing: border-box;
  background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
  font-size: 14px; font-weight: 600; color: var(--ink); text-decoration: none;
  margin-bottom: 1.5rem;
}
.ck-back:hover { background: var(--line-soft); }
.ck-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 1rem;
  margin: 0 0 1.25rem; padding-bottom: 0.75rem; border-bottom: 1.5px solid var(--ink);
}
.ck-head h2 { margin: 0; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
.ck-head > span { font-size: 0.8125rem; color: var(--ink-2); white-space: nowrap; }
.ck-panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 1rem 1.125rem;
}
/* 區塊標題:黑色句子體,不用字距拉開的灰色小標 */
.ck-label { margin: 0 0 0.625rem; font-size: 0.875rem; font-weight: 700; color: var(--ink); }
.ck-req { color: var(--alert); font-weight: 400; }

/* ── 滿額贈量杯刻度:這頁唯一放膽的地方 ───────────────── */
.gauge-track {
  position: relative; height: 30px; background: var(--surface);
  border: 1.5px solid var(--ink); border-radius: 3px; overflow: hidden;
}
.gauge-fill {
  position: absolute; top: 0; bottom: 0; left: 0; background: var(--green);
  transition: width .45s cubic-bezier(.3,.8,.4,1);
}
.gauge-ticks { position: absolute; inset: 0; display: flex; pointer-events: none; }
.gauge-ticks i { flex: 1; border-right: 1px solid rgba(0,0,0,.18); }
.gauge-ticks i:last-child { border-right: 0; }
.gauge-cap {
  position: absolute; top: 0; bottom: 0; right: 0; display: flex; align-items: center;
  padding: 0 9px; font-size: 0.75rem; font-weight: 700; color: var(--ink);
}
@media (prefers-reduced-motion: reduce) { .gauge-fill { transition: none; } }

@keyframes co-spin { to { transform: rotate(360deg); } }
.opt-list { display: flex; flex-direction: column; gap: 0.5rem; }
.opt-card {
  display: flex; align-items: flex-start; gap: 0.75rem;
  padding: 0.875rem; border: 1.5px solid var(--line); border-radius: 10px;
  background: var(--surface); cursor: pointer; position: relative;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.opt-card:hover { border-color: #d8d3ae; }
.opt-card-on { border-color: var(--ink); box-shadow: 0 0 0 3px rgba(11,93,59,.1); }
.opt-card:has(.opt-radio:focus-visible) { outline: 2px solid var(--green); outline-offset: 2px; }
.opt-radio { position: absolute; opacity: 0; width: 0; height: 0; }
.opt-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.opt-dot {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid #d8d3ae;
  flex-shrink: 0; margin-top: 10px; position: relative; transition: border-color .15s ease;
}
.opt-card-on .opt-dot { border-color: var(--ink); }
.opt-card-on .opt-dot::after {
  content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--ink);
}
@media (prefers-reduced-motion: reduce) { .opt-card, .opt-dot { transition: none; } }

.ck-form { display: flex; flex-direction: column; gap: 1.25rem; }
.ck-form input:focus, .ck-form select:focus, .ck-form textarea:focus {
  outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px rgba(11,93,59,.12);
}
/* 商品列 */
.ck-row { display: flex; gap: 0.75rem; padding: 0.875rem 0; border-bottom: 1px solid var(--line-soft); }
.ck-row:first-of-type { padding-top: 0; }
.ck-row:last-of-type { border-bottom: 0; }
.ck-thumb {
  width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
  background: var(--line-soft); flex-shrink: 0; border: 1px solid var(--line);
}
.ck-qty {
  display: inline-flex; align-items: center; background: var(--surface);
  border: 1.5px solid var(--line); border-radius: 8px; overflow: hidden;
}
.ck-qty button {
  width: 32px; height: 32px; border: 0; background: transparent; color: var(--ink);
  font-size: 16px; line-height: 1; cursor: pointer;
}
.ck-qty button:hover { background: var(--line-soft); }
.ck-remove {
  width: 28px; height: 28px; border: 0; background: none; color: #c9c6ab;
  font-size: 17px; line-height: 1; border-radius: 7px; cursor: pointer; flex-shrink: 0;
}
.ck-remove:hover { background: #fdecea; color: var(--alert); }
/* 送出 */
.ck-submit {
  padding: 1rem; background: var(--ink); color: #fff; border: 0; border-radius: 10px;
  font-size: 1rem; font-weight: 700; font-family: inherit; cursor: pointer;
}
.ck-submit:disabled { background: #9c9a86; cursor: not-allowed; }
`;

function OptionCard({
  name,
  value,
  checked,
  onSelect,
  icon,
  accent,
  title,
  desc,
  trailing,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  accent: string;
  title: string;
  desc?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <label className={checked ? 'opt-card opt-card-on' : 'opt-card'}>
      <input
        className="opt-radio"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        // 2026-10-16:刻意不加 required — 原生必填會在表單送出前就擋下,
        // 自訂提示反而跑不到,且提示氣泡常落在畫面外 = 看起來沒反應。
        // 改由 handleSubmit 自己檢查並捲到該區塊顯示紅字。
      />
      <span className="opt-icon" style={{ background: `${accent}1a`, color: accent }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>{title}</span>
          {trailing}
        </span>
        {desc && (
          <span style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginTop: 3, lineHeight: 1.55 }}>
            {desc}
          </span>
        )}
      </span>
      <span className="opt-dot" aria-hidden />
    </label>
  );
}

export default function CheckoutPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  // 2026-09-11:購物車與結帳併成一頁 — 明細可直接改數量/刪除
  const { items, totalQty, updateQty, removeItem, clear } = useCart(slug);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D#13:攤位運費規則(空陣列 = 不收運費,不顯示配送選項)
  const [shipOptions, setShipOptions] = useState<ShippingOption[]>([]);
  const [shipKey, setShipKey] = useState('');
  const [shipError, setShipError] = useState(false); // 2026-10-16:沒選配送方式的提示
  // 2026-10-06:滿額贈進度橫幅(蝦皮式)
  const [giftCfg, setGiftCfg] = useState<GiftConfigPublic>({ mode: 'stack', rules: [] });
  // 2026-10-15:LINE Pay 線上付款(攤位有開才顯示付款方式選擇)
  const [linePayOn, setLinePayOn] = useState(false);
  // 2026-10-22:綠界(信用卡 / ATM 虛擬帳號);有開的話預設選信用卡,少走人工核帳
  const [ecpayOn, setEcpayOn] = useState(false);
  // ATM 虛擬帳號另有開關(ecpay_atm flag);2026-10-22 起預設關,只開信用卡
  const [ecpayAtmOn, setEcpayAtmOn] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('bank');
  useEffect(() => {
    getShippingOptions(slug).then(setShipOptions).catch(() => {});
    getGiftRulesPublic(slug).then(setGiftCfg).catch(() => {});
    isLinePayAvailable(slug).then(setLinePayOn).catch(() => {});
    isEcpayAvailable(slug)
      .then((on) => {
        setEcpayOn(on);
        if (on) setPayMethod((m) => (m === 'bank' ? 'ecpay_credit' : m));
      })
      .catch(() => {});
    isEcpayAtmAvailable(slug).then(setEcpayAtmOn).catch(() => {});
  }, [slug]);
  const isLinePayPay = linePayOn && payMethod === 'line_pay';
  const isEcpayPay = ecpayOn && (payMethod === 'ecpay_atm' || payMethod === 'ecpay_credit');
  const isOnlinePay = isLinePayPay || isEcpayPay;

  // 2026-09-18:購物車顯示也套分階價(同商品跨規格合併計量;特價生效時分階暫停)
  // 原本這頁照加入當下的原價顯示,後端實收卻有套分階 → 畫面 540 實收 500 對不上
  const [pricing, setPricing] = useState<CartPricingInfo>({});
  const productIdsKey = [...new Set(items.map((i) => i.productId))].sort().join(',');
  useEffect(() => {
    const ids = productIdsKey ? productIdsKey.split(',') : [];
    if (ids.length === 0) return;
    getCartPricingInfo(slug, ids).then(setPricing).catch(() => {});
  }, [slug, productIdsKey]);

  function unitPriceOf(item: (typeof items)[number]): number {
    const info = pricing[item.productId];
    if (!info || info.sale_active || info.tiers.length === 0) return item.priceTwd;
    // Phase 16.4:組合品固定價,數量也不計入分階門檻
    if (info.bundle_variant_ids.includes(item.variantId)) return item.priceTwd;
    const totalProductQty = items
      .filter((i) => i.productId === item.productId && !info.bundle_variant_ids.includes(i.variantId))
      .reduce((s, i) => s + i.qty, 0);
    let unit = item.priceTwd;
    for (const t of info.tiers) {
      if (totalProductQty >= t.min_qty) unit = t.price_twd;
    }
    return unit;
  }

  // 折後商品小計(運費免運門檻、總計都用這個,跟後端實收一致)
  const subtotal = items.reduce((s, i) => s + unitPriceOf(i) * i.qty, 0);

  const shipOption = shipOptions.find((o) => o.key === shipKey) ?? null;
  const shipFee = shipOption
    ? shipOption.free_over && subtotal >= shipOption.free_over
      ? 0
      : shipOption.fee
    : 0;
  const grandTotal = subtotal + shipFee;

  // 已成立 → 顯 loading 直到 router.push 真的跳完(避免閃空車畫面 / 空表單)
  if (redirecting) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#374151', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <style>{`@keyframes ck-spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ width: 38, height: 38, border: '3px solid #e4e4e7', borderTopColor: '#18181b', borderRadius: '50%', animation: 'ck-spin 0.8s linear infinite' }} />
        <p style={{ fontSize: '1.125rem', margin: 0, fontWeight: 600 }}>
          {isLinePayPay ? '訂單已成立,正在前往 LINE Pay…' : isEcpayPay ? '訂單已成立,正在前往付款頁…' : '訂單已成立,跳轉中…'}
        </p>
        <p style={{ fontSize: '0.8125rem', margin: 0, color: '#9ca3af' }}>請不要重複操作或關閉畫面</p>
      </div>
    );
  }

  // 送出中 cart 被 clear() 清空時不要 flash 空車畫面(router.push 還沒導航完)
  if (items.length === 0 && !submitting) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#6b7280' }}>
        <p style={{ fontSize: '1.125rem', margin: 0 }}>購物車是空的</p>
        <a
          href={`/${slug}`}
          style={{
            display: 'inline-block',
            marginTop: '1.5rem',
            padding: '0.75rem 1.5rem',
            background: '#1f2937',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: '0.9375rem',
          }}
        >
          繼續購物
        </a>
      </div>
    );
  }

  async function handleSubmit(formData: FormData) {
    // 2026-10-16:沒選配送方式時瀏覽器的必填提示會跑到畫面外(配送區在上、送出鈕在下),
    // 看起來像「按了沒反應」— 自己擋下並捲回該區塊
    if (shipOptions.length > 0 && !shipKey) {
      setShipError(true);
      document.getElementById('ship-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setShipError(false);
    setSubmitting(true);
    setError(null);
    formData.append('tenantSlug', slug);
    formData.append('cartItems', JSON.stringify(items));
    const result = await createOrder(formData);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setRedirecting(true); // 馬上切到 loading 畫面,避免接下來 clear() 觸發空車閃屏
    clear();
    // Phase 22:訂單頁連結要帶存取碼,沒帶的話個資會被遮蔽、也不能付款 / 回報
    const kq = result.accessKey ? `k=${result.accessKey}` : '';
    // 2026-10-15:選 LINE Pay → 導去付款頁。
    // 發動失敗不擋單(訂單已成立),退回訂單頁讓客人重按一次付款。
    if (isLinePayPay) {
      const pay = await startLinePay(slug, result.orderNo);
      if (pay.ok) {
        window.location.href = pay.paymentUrl;
        return;
      }
      router.push(`/${slug}/order/${result.orderNo}?linepay=failed${kq ? `&${kq}` : ''}`);
      return;
    }
    // 2026-10-22:選綠界(信用卡 / ATM)→ 導到 /api/ecpay/pay,它會把瀏覽器送到綠界付款頁
    if (isEcpayPay) {
      const method = payMethod === 'ecpay_atm' ? 'atm' : 'credit';
      window.location.href = `/api/ecpay/pay?slug=${encodeURIComponent(slug)}&orderNo=${encodeURIComponent(result.orderNo)}&method=${method}`;
      return;
    }
    router.push(`/${slug}/order/${result.orderNo}${kq ? `?${kq}` : ''}`);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.7rem 0.8rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: 10,
    fontSize: '0.9375rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#111827',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.375rem',
  };

  return (
    // 2026-10-15:結帳是單欄表單,960 寬會讓欄位拉得又長又空 — 收到 620
    <div className="ck">
      <style dangerouslySetInnerHTML={{ __html: checkoutCss }} />
      {/* 2026-09-12:改成跟商品詳情/結帳同款的膠囊返回鍵 */}
      <a href={`/${slug}`} className="ck-back">
        <IconChevronLeft size={16} /> 返回
      </a>

      <div className="ck-head">
        <h2>購物車</h2>
        <span>
          <span className="num">{totalQty}</span> 件商品
        </span>
      </div>

      {/* 2026-10-15:滿額贈做成量杯刻度 — 這頁唯一放膽的地方。
          精油講分量,進度用刻度表示比圓角進度條更貼這家店。 */}
      {giftCfg.rules.length > 0 && (() => {
        // Phase 18:擇高式只算最高那條;可重複的規則會一直有下一個倍數可拿
        const reached = giftCfg.rules.filter((g) => subtotal >= g.threshold_twd);
        const met =
          giftCfg.mode === 'highest' && reached.length > 0
            ? [reached.reduce((b, g) => (g.threshold_twd > b.threshold_twd ? g : b))]
            : reached;
        const earned = met.map((g) => ({
          ...g,
          times: g.repeat ? Math.max(1, Math.floor(subtotal / g.threshold_twd)) : 1,
        }));
        // 下一個目標:還沒到的最低門檻,或可重複規則的下一個倍數,取最近的
        const targets = giftCfg.rules
          .map((g) =>
            subtotal < g.threshold_twd
              ? { g, at: g.threshold_twd }
              : g.repeat
                ? { g, at: (Math.floor(subtotal / g.threshold_twd) + 1) * g.threshold_twd }
                : null,
          )
          .filter((x): x is { g: (typeof giftCfg.rules)[number]; at: number } => x !== null)
          .sort((a, b) => a.at - b.at);
        const nextTarget = targets[0] ?? null;
        const next = nextTarget?.g ?? null;
        const pct = nextTarget ? Math.min(100, Math.round((subtotal / nextTarget.at) * 100)) : 100;
        const gap = nextTarget ? nextTarget.at - subtotal : 0;
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>
                <IconGift size={15} /> 滿額贈
              </span>
              <span style={{ fontSize: '0.8125rem', color: next ? '#6b6a58' : '#0b5d3b', fontWeight: next ? 400 : 700 }}>
                {next ? (
                  <>
                    還差 <span className="num" style={{ fontWeight: 700, color: '#000' }}>NT$ {gap.toLocaleString()}</span>
                  </>
                ) : (
                  '已達最高門檻'
                )}
              </span>
            </div>
            <div className="gauge-track">
              <div className="gauge-fill" style={{ width: `${pct}%` }} />
              <div className="gauge-ticks">
                {Array.from({ length: 10 }, (_, i) => <i key={i} />)}
              </div>
              <span className="gauge-cap num" style={{ color: pct > 92 ? '#fff' : '#000' }}>{pct}%</span>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', lineHeight: 1.6 }}>
              {next && (
                <div style={{ color: '#6b6a58' }}>
                  {next.repeat ? '每滿' : '滿'}{' '}
                  <span className="num">NT$ {next.threshold_twd.toLocaleString()}</span> 送 {next.product_name}
                  {next.qty > 1 ? ` ×${next.qty}` : ''}
                </div>
              )}
              {earned.length > 0 && (
                <div style={{ color: '#0b5d3b', fontWeight: 700 }}>
                  已獲得:
                  {earned
                    .map((g) => {
                      const total = g.qty * g.times;
                      return `${g.product_name}${total > 1 ? ` ×${total}` : ''}`;
                    })
                    .join('、')}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="ck-panel" style={{ marginBottom: '1.25rem' }}>
        <h3 className="ck-label">商品明細</h3>
        {items.map((item) => (
          // 2026-10-15:加商品縮圖,數量與金額移到第二行 — 原本全擠同一行又窄又亂
          <div key={item.variantId} className="ck-row">
            {item.imageUrl ? (
              <img className="ck-thumb" src={item.imageUrl} alt="" />
            ) : (
              <span className="ck-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4d4d8' }}>
                <IconPackage size={20} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 2026-09-12:商品名不截斷(可換行),品項(規格)一律顯示 */}
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000', lineHeight: 1.45 }}>
                    {item.productName}
                  </div>
                  {item.variantName && item.variantName !== 'default' && (
                    <div style={{ fontSize: '0.75rem', color: '#6b6a58', marginTop: 2 }}>{item.variantName}</div>
                  )}
                  {unitPriceOf(item) < item.priceTwd && (
                    <div style={{ fontSize: '0.75rem', color: '#0b5d3b', marginTop: 2, fontWeight: 600 }}>
                      量購價 <span className="num">NT$ {unitPriceOf(item).toLocaleString()}</span> /件
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="ck-remove"
                  onClick={() => removeItem(item.variantId)}
                  aria-label={`移除 ${item.productName}`}
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.625rem' }}>
                <div className="ck-qty">
                  <button type="button" onClick={() => updateQty(item.variantId, item.qty - 1)}>−</button>
                  <QtyInput qty={item.qty} onCommit={(n) => updateQty(item.variantId, n)} />
                  <button type="button" onClick={() => updateQty(item.variantId, item.qty + 1)}>+</button>
                </div>
                <span className="num" style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#000', whiteSpace: 'nowrap' }}>
                  NT$ {(unitPriceOf(item) * item.qty).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div
          style={{
            borderTop: '1px solid #e7e3c6',
            marginTop: '0.875rem',
            paddingTop: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4375rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b6a58' }}>
            <span>商品小計</span>
            <span className="num" style={{ color: '#000' }}>NT$ {subtotal.toLocaleString()}</span>
          </div>
          {shipOptions.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b6a58' }}>
              <span>運費{shipOption ? `(${shipOption.label})` : ''}</span>
              {shipOption ? (
                <span className="num" style={{ color: shipFee === 0 ? '#0b5d3b' : '#000' }}>
                  {shipFee === 0 ? '免運' : `NT$ ${shipFee.toLocaleString()}`}
                </span>
              ) : (
                <span>請選配送方式</span>
              )}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: '0.4375rem',
              paddingTop: '0.75rem',
              borderTop: '1.5px solid #000',
            }}
          >
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#000' }}>合計</span>
            <span className="num" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000' }}>
              NT$ {grandTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 2026-10-22:建立訂單期間蓋住整個畫面,按不到別的東西(建好後換成上面的跳轉畫面) */}
      {submitting && (
        <div
          aria-busy="true"
          aria-live="polite"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}
        >
          <style>{`@keyframes ck-spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ width: 38, height: 38, border: '3px solid #e4e4e7', borderTopColor: '#18181b', borderRadius: '50%', animation: 'ck-spin 0.8s linear infinite' }} />
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#18181b' }}>訂單建立中,請稍候…</div>
          <div style={{ fontSize: '0.75rem', color: '#71717a' }}>請不要重複按送出或關閉畫面</div>
        </div>
      )}
      <form className="ck-form" action={handleSubmit}>
        {/* D#13:配送方式(攤位有設運費規則才顯示)
            2026-10-15:選項本身已經是「面」了,不再包一層卡 — 免得整頁變成一堆同款方框 */}
        {shipOptions.length > 0 && (
          <div id="ship-section" style={{ scrollMarginTop: 16 }}>
            <h3 className="ck-label">
              配送方式 <span className="ck-req">*</span>
            </h3>
            {shipError && (
              <div
                style={{
                  marginBottom: '0.5rem',
                  padding: '0.625rem 0.875rem',
                  background: '#fdecea',
                  border: '1px solid #f3c6c2',
                  borderRadius: 10,
                  color: '#b3261e',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                }}
              >
                請先選擇配送方式才能送出訂單
              </div>
            )}
            <div className="opt-list">
              {shipOptions.map((opt) => {
                const isFree = !!opt.free_over && subtotal >= opt.free_over;
                const isPickupOpt = opt.key === 'pickup';
                return (
                  <OptionCard
                    key={opt.key}
                    name="shipping_method"
                    value={opt.key}
                    checked={shipKey === opt.key}
                    onSelect={() => setShipKey(opt.key)}
                    accent={isPickupOpt ? '#b45309' : '#475569'}
                    icon={isPickupOpt ? <IconPackage size={19} /> : <IconTruck size={19} />}
                    title={opt.label}
                    trailing={
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, whiteSpace: 'nowrap', color: isFree || opt.fee === 0 ? '#15803d' : '#111827' }}>
                        {opt.fee === 0 ? '免運費' : isFree ? '免運' : `NT$ ${opt.fee}`}
                      </span>
                    }
                    desc={
                      <>
                        {opt.free_over ? (
                          <span style={{ display: 'block', color: isFree ? '#15803d' : '#6b7280' }}>
                            {isFree
                              ? `已滿 NT$ ${opt.free_over.toLocaleString()},免運`
                              : `滿 NT$ ${opt.free_over.toLocaleString()} 免運(還差 NT$ ${(opt.free_over - subtotal).toLocaleString()})`}
                          </span>
                        ) : null}
                        {opt.note && <span style={{ display: 'block', color: '#b45309' }}>※ {opt.note}</span>}
                      </>
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
        {/* 2026-10-15:付款方式(攤位有開 LINE Pay 或綠界才顯示;都沒開一律匯款)
            2026-10-22:順序 信用卡 → LINE Pay → ATM 轉帳 → 匯款(人工核帳) */}
        {(linePayOn || ecpayOn) && (
          <div>
            <h3 className="ck-label">
              付款方式 <span className="ck-req">*</span>
            </h3>
            <div className="opt-list">
              {ecpayOn && (
                <OptionCard
                  name="payment_method"
                  value="ecpay_credit"
                  checked={payMethod === 'ecpay_credit'}
                  onSelect={() => setPayMethod('ecpay_credit')}
                  accent="#1d4ed8"
                  icon={<IconCreditCard size={19} />}
                  title="信用卡"
                  trailing={
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      立即付款
                    </span>
                  }
                  desc="送出後前往綠界刷卡,付款完成訂單自動更新"
                />
              )}
              {linePayOn && (
                <OptionCard
                  name="payment_method"
                  value="line_pay"
                  checked={payMethod === 'line_pay'}
                  onSelect={() => setPayMethod('line_pay')}
                  accent="#06c755"
                  icon={<IconWallet size={19} />}
                  title="LINE Pay"
                  trailing={
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      立即付款
                    </span>
                  }
                  desc="送出後直接前往 LINE Pay 付款,不用回報後 5 碼"
                />
              )}
              {ecpayAtmOn && (
                <OptionCard
                  name="payment_method"
                  value="ecpay_atm"
                  checked={payMethod === 'ecpay_atm'}
                  onSelect={() => setPayMethod('ecpay_atm')}
                  accent="#0f766e"
                  icon={<IconBank size={19} />}
                  title="ATM 轉帳"
                  trailing={
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      免回報
                    </span>
                  }
                  desc="送出後取得專屬轉帳帳號,3 天內轉帳,系統自動對帳"
                />
              )}
              <OptionCard
                name="payment_method"
                value="bank"
                checked={payMethod === 'bank'}
                onSelect={() => setPayMethod('bank')}
                accent="#475569"
                icon={<IconBank size={19} />}
                title="匯款至店家帳戶"
                desc="匯款後到訂單頁回報帳號後 5 碼,等待人工核帳"
              />
            </div>
          </div>
        )}
        {/* 2026-10-15:收件資訊收進同一張卡,不再一欄一欄散在底色上 */}
        <div className="ck-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <h3 className="ck-label" style={{ marginBottom: 0 }}>收件資訊</h3>
          <div>
            <label htmlFor="recipient" style={labelStyle}>
              收件人姓名 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input id="recipient" name="recipient" type="text" required style={inputStyle} />
          </div>
          <div>
            <label htmlFor="phone" style={labelStyle}>
              聯絡電話 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input id="phone" name="phone" type="tel" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>
              寄送地址 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {/* 2026-09-11(回饋 #8):縣市/區下拉 + 詳細地址,送出仍是單一 address 字串 */}
            <TwAddressFields required inputStyle={inputStyle} />
          </div>
          {/* 2026-09-11:Email 欄位移除(訪客查單用電話即可,訂單通知走 LINE) */}
          <div>
            <label htmlFor="note" style={labelStyle}>
              備註(選填)
            </label>
            {/* 2026-09-11 v2:統編專用欄位移除 — 需要統編直接寫在備註 */}
            <textarea
              id="note"
              name="note"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="如需統編發票或有其他需求,請填寫在這裡"
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#fdecea',
              border: '1px solid #f3c6c2',
              borderRadius: 10,
              color: '#b3261e',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <button type="submit" className="ck-submit" disabled={submitting}>
          {submitting ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: '#fff',
                  animation: 'co-spin 0.7s linear infinite',
                  display: 'inline-block',
                }}
              />
              處理中,訂單建立中…
            </span>
          ) : (
            `${isLinePayPay ? '前往 LINE Pay 付款' : isEcpayPay ? '送出並前往付款' : '送出訂單'} · NT$ ${grandTotal.toLocaleString()}`
          )}
        </button>
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.75rem',
          }}
        >
          {isOnlinePay ? '付款完成後訂單會自動更新,不用回報帳號後 5 碼' : '下單後賣家會私訊匯款方式'}
        </p>
      </form>
    </div>
  );
}

/**
 * 購物車數量輸入框(2026-09-11 併頁時從 /cart 移入):可直接打字改;
 * 打字過程允許清空,離開欄位時空值/0 恢復原數量(整列刪除用 × 按鈕)。
 */
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null); // null = 顯示外部 qty

  return (
    <input
      inputMode="numeric"
      aria-label="數量"
      value={text ?? String(qty)}
      onFocus={() => setText(String(qty))}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '');
        setText(t);
        const n = parseInt(t, 10);
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }}
      onBlur={() => {
        const n = parseInt(text ?? '', 10);
        if (Number.isFinite(n) && n > 0) onCommit(n);
        setText(null);
      }}
      style={{
        width: 40,
        height: 30,
        textAlign: 'center',
        fontSize: '0.875rem',
        fontWeight: 500,
        border: 'none',
        borderLeft: '1px solid #e5e7eb',
        borderRight: '1px solid #e5e7eb',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        background: '#fff',
      }}
    />
  );
}
