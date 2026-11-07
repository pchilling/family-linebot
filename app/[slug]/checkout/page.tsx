'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../cart-state';
import { TwAddressFields } from '@/lib/tw-districts';
import { IconBank, IconCheck, IconCreditCard, IconGift, IconPackage, IconStore, IconTruck, IconWallet, IconX } from '@/lib/icons';
import { CVS_CHAINS, codAllowed, type CodPaymentPublic } from '@/lib/cvs';
import { Badge, Button, ButtonLink, Card, OptionCard, Textarea } from '@/lib/ui';
import { fmtArrivalPhrase, GROUPBUY_CLOSED_ERROR } from '@/lib/groupbuy-shared';
import { applyDiscountCode, createOrder, getCartPricingInfo, getCodPaymentPublic, getGiftRulesPublic, getGroupBuyCheckoutInfo, getLastShipping, getQrPaymentPublic, getShippingOptions, hasDiscountCodes, isBankTransferAvailable, isEcpayAtmAvailable, isEcpayAvailable, isLinePayAvailable, startLinePay, type ApplyDiscountResult, type CartPricingInfo, type GiftConfigPublic, type GroupBuyCheckoutInfo, type LastShipping, type QrPaymentPublic, type ShippingOption } from './actions';

// Phase 33(2026-11-06):套用成功的折扣碼
type DiscountApplied = Extract<ApplyDiscountResult, { ok: true }>;

// 2026-10-22:付款方式 — 匯款(人工核帳)/ LINE Pay / 綠界 ATM 虛擬帳號 / 綠界信用卡
// Phase 27(2026-11-01):加 'qr' 掃碼付款(攤主自己的收款 QR,人工核帳)
// Phase 36(2026-11-08):加 'cod' 超商取貨付款(只在配送是店到店時出現)
type PayMethod = 'bank' | 'line_pay' | 'ecpay_atm' | 'ecpay_credit' | 'qr' | 'cod';

type Props = {
  params: Promise<{ slug: string }>;
};

const money = (n: number) => n.toLocaleString('en-US');

const CSS = `
.ck-title{padding:4px 0 24px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ck-title h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;display:inline}
.ck-back{font-size:13px;color:var(--ui-muted);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-left:14px;vertical-align:4px;transition:color .15s}
.ck-back:hover{color:var(--ui-ink);text-decoration:underline;text-underline-offset:3px}
.ck-steps{display:flex;gap:4px;padding:4px;border-radius:9px;background:var(--ui-line-soft);font-size:12.5px;color:var(--ui-muted)}
.ck-steps span{padding:6px 12px;border-radius:7px}
.ck-steps b{padding:6px 12px;border-radius:7px;background:var(--ui-surface);color:var(--ui-ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.ck-layout{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:32px;align-items:start}
.ck-form{display:flex;flex-direction:column;gap:16px;min-width:0}
/* 2026-11-06 電腦版改版:左邊三區各自一張卡,跟右邊商品明細同一套;手機版在下面的 media query 還原成原本的排法 */
.ck-sec{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:12px;scroll-margin-top:80px;overflow:hidden}
.ck-sec-h{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--ui-line)}
.ck-sec-h h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.ck-sec-h span:not(.ck-n){margin-left:auto;font-size:12px;color:var(--ui-faint)}
.ck-n{width:22px;height:22px;border-radius:50%;background:var(--ui-accent);color:var(--ui-on-accent);font-size:12px;font-weight:600;display:grid;place-items:center;flex-shrink:0}
.ck-sec-b{padding:20px;display:flex;flex-direction:column;gap:14px}
.ck-opts{display:flex;flex-direction:column}
.ck-opts .ui-opt{border:0;border-radius:0;border-bottom:1px solid var(--ui-line);padding:14px 20px;box-shadow:none;position:relative;align-items:center}
.ck-opts .ui-opt:last-child{border-bottom:0}
.ck-opts .ui-opt[data-on="true"]{background:#fafaf8;box-shadow:none;border-color:var(--ui-line)}
.ck-opts .ui-opt[data-on="true"]::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ui-accent)}
.ck-alert-in{margin:12px 20px 0}
.ck-field{display:flex;flex-direction:column;gap:6px}
.ck-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ck-pick{padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line);font-size:13px;color:#52525b;line-height:1.6}
.ck-chk{display:inline-flex;align-items:center;gap:10px;font-size:14px;cursor:pointer}
.ck-hint{font-size:12px;color:var(--ui-muted);margin:0;line-height:1.5}
.ck-last{align-self:flex-start}
.ck-sum{position:sticky;top:80px;padding:24px}
.ck-sum h2{margin:0 0 8px;font-size:16px;font-weight:600;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:baseline}
.ck-sum h2 span{font-size:12px;color:var(--ui-muted);font-weight:400}
.ck-item{display:flex;gap:12px;padding:14px 0;border-top:1px solid var(--ui-line-soft)}
.ck-item:first-of-type{border-top:0;padding-top:0}
/* Phase 35(2026-11-07):有團購商品時明細分「攤位」「團購」兩組 */
.ck-grp{display:flex;align-items:center;gap:8px;margin:14px 0 4px;padding-top:14px;border-top:1px solid var(--ui-line);font-size:12.5px;font-weight:600;color:var(--ui-ink)}
.ck-grp:first-of-type{margin-top:0;padding-top:0;border-top:0}
.ck-grp span{font-weight:400;color:var(--ui-muted)}
.ck-grp + .ck-item{border-top:0;padding-top:8px}
.ck-grp-hint{margin:6px 0 0;padding:8px 10px;border-radius:6px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;line-height:1.6}
.ck-th{width:56px;height:70px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-line-soft);overflow:hidden;position:relative;flex-shrink:0;display:grid;place-items:center;color:#d4d4d8}
.ck-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ck-it{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ck-it-n{font-size:14px;font-weight:500;line-height:1.4}
.ck-it-v{font-size:12px;color:var(--ui-muted)}
.ck-it-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}
.ck-qty{display:inline-flex;align-items:center;border:1px solid var(--ui-line);border-radius:6px;height:30px;overflow:hidden;background:var(--ui-surface)}
.ck-qty button{width:30px;height:30px;border:0;background:transparent;font:inherit;font-size:16px;cursor:pointer;color:var(--ui-ink);padding:0}
.ck-qty button:hover{background:var(--ui-line-soft)}
.ck-qty input{width:36px;height:30px;text-align:center;font:inherit;font-size:13px;font-weight:500;border:0;border-left:1px solid var(--ui-line);border-right:1px solid var(--ui-line);background:transparent;box-sizing:border-box;outline:none}
.ck-rm{width:26px;height:26px;border:0;background:none;color:var(--ui-faint);border-radius:6px;cursor:pointer;display:grid;place-items:center;flex-shrink:0;padding:0}
.ck-rm:hover{background:#fef2f2;color:#b91c1c}
.ck-gift{margin-top:14px;padding:12px 14px;border-radius:8px;border:1px solid var(--ui-line);background:#fafafa;font-size:13px;display:flex;flex-direction:column;gap:8px}
.ck-gift-t{display:flex;justify-content:space-between;gap:12px;font-weight:500;align-items:center}
.ck-bar{height:6px;border-radius:999px;background:var(--ui-line);overflow:hidden}
.ck-bar div{height:100%;border-radius:999px;background:var(--ui-accent);transition:width .45s cubic-bezier(.3,.8,.4,1)}
/* Phase 33(2026-11-06):折扣碼輸入區(滿額贈進度之後、金額區之前) */
.ck-dc{margin-top:18px;padding-top:18px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:6px}
.ck-dc-row{display:flex;gap:8px}
.ck-dc-row .ui-input{flex:1;min-width:0;text-transform:uppercase}
.ck-dc-err{font-size:12.5px;color:#b91c1c;margin:0;line-height:1.5}
.ck-dc-chip{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;font-size:13px;font-weight:500}
.ck-dc-chip .t{flex:1;min-width:0}
.ck-dc-chip .s{display:block;font-size:12px;font-weight:400;margin-top:2px}
.ck-dc-chip .x{margin-left:auto;width:24px;height:24px;border:0;background:none;color:#15803d;cursor:pointer;display:grid;place-items:center;border-radius:6px;padding:0;flex-shrink:0}
.ck-dc-chip .x:hover{background:#dcfce7}
.ck-tot{margin-top:18px;padding-top:18px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:10px;font-size:14px}
.ck-tot .r{display:flex;justify-content:space-between;gap:12px;color:#52525b}
.ck-tot .g{display:flex;justify-content:space-between;align-items:baseline;padding-top:16px;margin-top:8px;border-top:1px solid var(--ui-line);color:var(--ui-ink);font-weight:600}
.ck-tot .g span:first-child{font-size:15px}
.ck-tot .g span:last-child{font-size:26px;letter-spacing:-.02em}
.ck-submit-d{margin-top:20px}
.ck-fine{font-size:13px;color:var(--ui-ink);margin:12px 0 0;line-height:1.6}
.ck-notes{list-style:none;margin:12px 0 0;padding:12px 0 0;border-top:1px solid var(--ui-line-soft);display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--ui-muted);line-height:1.6}
.ck-notes li{display:flex;gap:8px;align-items:flex-start}
.ck-notes li::before{content:"";width:4px;height:4px;border-radius:50%;background:var(--ui-faint);flex-shrink:0;margin-top:8px}
.ck-notes a{color:var(--ui-ink);font-weight:500;text-decoration:none}.ck-notes a:hover{text-decoration:underline;text-underline-offset:3px}
.ck-alert{padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.6;font-weight:500}
.ck-submit-m{display:none}
.ck-overlay{position:fixed;inset:0;z-index:1000;background:rgba(255,255,255,.85);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}
.ck-overlay .big{width:38px;height:38px;border-width:3px}
@media (max-width:1024px){
  .ck-layout{grid-template-columns:1fr;gap:28px}
  .ck-sum{position:static;order:-1}
  .ck-title{padding:0 0 16px;flex-direction:column;align-items:flex-start;gap:8px}
  .ck-title h1{font-size:24px}
  .ck-row2{grid-template-columns:1fr}
  .ck-submit-d{display:none}
  .ck-submit-m{display:flex;flex-direction:column;gap:10px}
  /* 手機維持原本的排法:區塊不包卡、選項各自一張卡 */
  .ck-form{gap:36px}
  .ck-sec{background:transparent;border:0;border-radius:0;overflow:visible}
  .ck-sec-h{padding:0 0 12px;border:0;align-items:baseline}
  .ck-sec-h h2{font-size:16px}
  .ck-n{display:none}
  .ck-sec-b{padding:0}
  .ck-opts{gap:10px}
  .ck-opts .ui-opt{border:1px solid var(--ui-line);border-radius:8px;padding:14px 16px;align-items:flex-start}
  .ck-opts .ui-opt[data-on="true"]{border-color:var(--ui-accent);box-shadow:0 0 0 1px var(--ui-accent);background:var(--ui-surface)}
  .ck-opts .ui-opt[data-on="true"]::before{display:none}
  .ck-alert-in{margin:0 0 12px}
}
@media (prefers-reduced-motion:reduce){.ck-bar div{transition:none}}
`;

/**
 * 結帳頁(2026-10-23 改版,照 Phase 24 原型):
 * 電腦版左邊表單(配送 / 付款 / 收件)、右邊 sticky 摘要(明細可改數量、滿額贈進度、合計、送出);
 * 手機版摘要在上、表單在下、送出鈕在最底。所有流程(分階價、滿額贈、LINE Pay / 綠界跳轉、會員預填)跟改版前相同。
 */
export default function CheckoutPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  // 2026-09-11:購物車與結帳併成一頁 — 明細可直接改數量/刪除
  const { items, ready: cartReady, totalQty, updateQty, removeItem, clear } = useCart(slug);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D#13:攤位運費規則(空陣列 = 不收運費,不顯示配送選項)
  const [shipOptions, setShipOptions] = useState<ShippingOption[]>([]);
  const [shipKey, setShipKey] = useState('');
  const [shipError, setShipError] = useState(false); // 2026-10-16:沒選配送方式的提示
  // 2026-10-06:滿額贈進度
  const [giftCfg, setGiftCfg] = useState<GiftConfigPublic>({ mode: 'stack', rules: [] });
  // 2026-10-15:LINE Pay 線上付款(攤位有開才顯示付款方式選擇)
  const [linePayOn, setLinePayOn] = useState(false);
  // 2026-10-22:綠界(信用卡 / ATM 虛擬帳號);有開的話預設選信用卡,少走人工核帳
  const [ecpayOn, setEcpayOn] = useState(false);
  // ATM 虛擬帳號另有開關(ecpay_atm flag);2026-10-22 起預設關,只開信用卡
  const [ecpayAtmOn, setEcpayAtmOn] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('bank');
  // Phase 27:掃碼付款設定(攤位有開 + 有上傳 QR 才會有)
  const [qrCfg, setQrCfg] = useState<QrPaymentPublic | null>(null);
  // Phase 36:超商取貨付款設定(攤主有開才會有;要不要顯示還要看配送與金額,在下面算)
  const [codCfg, setCodCfg] = useState<CodPaymentPublic | null>(null);
  // Phase 28:匯款沒設定(或攤主關掉)就不出現;預設 true 免得載入中閃一下
  const [bankOn, setBankOn] = useState(true);
  // 匯款不開時,預設選項往其他方式移;什麼都沒有就維持 bank(下單後由賣家聯絡)
  useEffect(() => {
    if (bankOn || payMethod !== 'bank') return;
    setPayMethod(ecpayOn ? 'ecpay_credit' : qrCfg ? 'qr' : linePayOn ? 'line_pay' : ecpayAtmOn ? 'ecpay_atm' : 'bank');
  }, [bankOn, ecpayOn, qrCfg, linePayOn, ecpayAtmOn, payMethod]);
  // Phase 26:已登入就預填收件人與電話,並把信箱帶進訂單(查單、對帳號用);沒登入照舊
  const [member, setMember] = useState<{ name: string | null; email: string | null; phone: string | null } | null>(null);
  // 2026-11-06:收件欄位的預填值。會員資料載入 → 填姓名電話;按「用上次的收件資料」→ 連地址一起填。
  // 欄位是 uncontrolled(defaultValue),改 v 讓它們重掛一次才吃得到新值。
  const [prefill, setPrefill] = useState<{ name: string; phone: string; address: string; v: number }>({ name: '', phone: '', address: '', v: 0 });
  const [lastShip, setLastShip] = useState<LastShipping | null>(null);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { member: { name: string | null; email: string | null; phone: string | null } | null }) => {
        const m = d.member ?? null;
        setMember(m);
        if (m) setPrefill((p) => ({ name: m.name ?? '', phone: m.phone ?? '', address: '', v: p.v + 1 }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!member) return;
    getLastShipping(slug).then(setLastShip).catch(() => {});
  }, [member, slug]);
  // Phase 33:折扣碼 — 攤位有啟用中的碼才顯示輸入區;套用結果的金額只用來顯示,送單時 server 重算
  const [dcOffered, setDcOffered] = useState(false);
  const [dcInput, setDcInput] = useState('');
  const [dcApplied, setDcApplied] = useState<DiscountApplied | null>(null);
  const [dcError, setDcError] = useState<string | null>(null);
  const [dcBusy, setDcBusy] = useState(false);
  useEffect(() => {
    hasDiscountCodes(slug).then(setDcOffered).catch(() => {});
    getShippingOptions(slug).then(setShipOptions).catch(() => {});
    getGiftRulesPublic(slug).then(setGiftCfg).catch(() => {});
    isLinePayAvailable(slug).then(setLinePayOn).catch(() => {});
    isBankTransferAvailable(slug).then(setBankOn).catch(() => {});
    isEcpayAvailable(slug)
      .then((on) => {
        setEcpayOn(on);
        // 有綠界就預設刷卡(掃碼、匯款都是人工核帳,排後面)
        if (on) setPayMethod((m) => (m === 'bank' || m === 'qr' ? 'ecpay_credit' : m));
      })
      .catch(() => {});
    isEcpayAtmAvailable(slug).then(setEcpayAtmOn).catch(() => {});
    getCodPaymentPublic(slug).then(setCodCfg).catch(() => {});
    getQrPaymentPublic(slug)
      .then((q) => {
        setQrCfg(q);
        // 攤主開了掃碼付款,代表他偏好這個勝過匯款 → 預設選它(綠界若有開仍以刷卡優先)
        if (q) setPayMethod((m) => (m === 'bank' ? 'qr' : m));
      })
      .catch(() => {});
  }, [slug]);
  const isLinePayPay = linePayOn && payMethod === 'line_pay';
  const isEcpayPay = ecpayOn && (payMethod === 'ecpay_atm' || payMethod === 'ecpay_credit');
  const isOnlinePay = isLinePayPay || isEcpayPay;
  // Phase 29:選了超商店到店 → 收件區改填門市
  const cvs = shipOptions.find((o) => o.key === shipKey)?.cvs ?? null;
  // 2026-11-06:門市自取不用填地址(以前還是必填,客人來拿貨卻要打地址)
  const isPickup = shipKey === 'pickup';
  // 區塊編號:有配送才有 1,付款方式只有一種就不顯示那區,編號跟著跳(showPay / nAddr 要等取貨付款算完,在下面)
  const showShip = shipOptions.length > 0;
  const nPay = showShip ? 2 : 1;

  // 2026-09-18:購物車顯示也套分階價(同商品跨規格合併計量;特價生效時分階暫停)
  const [pricing, setPricing] = useState<CartPricingInfo>({});
  const productIdsKey = [...new Set(items.map((i) => i.productId))].sort().join(',');
  // Phase 35(2026-11-07):哪些是團購商品、目前的團 — 以 server 為準,localStorage 的 channel 只是回來前的預設
  const [gbInfo, setGbInfo] = useState<GroupBuyCheckoutInfo | null>(null);
  useEffect(() => {
    const ids = productIdsKey ? productIdsKey.split(',') : [];
    if (ids.length === 0) return;
    getCartPricingInfo(slug, ids).then(setPricing).catch(() => {});
    getGroupBuyCheckoutInfo(slug, ids).then(setGbInfo).catch(() => {});
  }, [slug, productIdsKey]);
  const isGroupBuyItem = (item: (typeof items)[number]) =>
    gbInfo ? gbInfo.groupBuyProductIds.includes(item.productId) : item.channel === 'groupbuy';
  const stallItems = items.filter((i) => !isGroupBuyItem(i));
  const gbItems = items.filter((i) => isGroupBuyItem(i));
  const currentGb = gbInfo?.current ?? null;
  // server 回來說沒開團(或已截止)卻還有團購商品 → 不給送,請客人移除
  const gbBlocked = gbItems.length > 0 && !!gbInfo && !currentGb;

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

  // 特價 / 量購價後的商品小計(運費免運門檻、滿額贈都用這個,跟後端一致;折扣碼另外減)
  const subtotal = items.reduce((s, i) => s + unitPriceOf(i) * i.qty, 0);
  const shipOption = shipOptions.find((o) => o.key === shipKey) ?? null;
  const shipFee = shipOption ? (shipOption.free_over && subtotal >= shipOption.free_over ? 0 : shipOption.fee) : 0;
  // Phase 33:折扣只折商品小計、不折運費;不得超過小計
  const discount = dcApplied ? Math.min(dcApplied.discount_twd, subtotal) : 0;
  const grandTotal = subtotal - discount + shipFee;
  // Phase 36(2026-11-08):超商取貨付款 — 配送是店到店 + 攤主有開 + 應付(含運)沒超上限才出現;
  // 配送切回宅配 / 自取(或金額超上限)時,停在取貨付款的選擇自動清掉,退回預設順序
  const codOn = codAllowed(codCfg, !!cvs, grandTotal);
  const isCodPay = codOn && payMethod === 'cod';
  useEffect(() => {
    if (payMethod !== 'cod' || codOn) return;
    setPayMethod(ecpayOn ? 'ecpay_credit' : qrCfg ? 'qr' : linePayOn ? 'line_pay' : ecpayAtmOn ? 'ecpay_atm' : 'bank');
  }, [payMethod, codOn, ecpayOn, qrCfg, linePayOn, ecpayAtmOn]);
  const showPay = [bankOn, linePayOn, ecpayOn, ecpayAtmOn, !!qrCfg, codOn].filter(Boolean).length !== 1;
  const nAddr = (showShip ? 1 : 0) + (showPay ? 1 : 0) + 1;

  // Phase 33:按「套用」才打 server(不要每打一字就查)。code 沒給就用目前套用的碼(改數量後靜默重驗)
  async function applyNow(code?: string) {
    const raw = (code ?? dcInput).trim();
    if (!raw || items.length === 0) return;
    setDcBusy(true);
    const phone = document.querySelector<HTMLInputElement>('#ck-form [name="phone"]')?.value ?? '';
    try {
      const r = await applyDiscountCode(slug, raw, items.map((i) => ({ variantId: i.variantId, qty: i.qty })), phone);
      if (r.ok) {
        setDcApplied(r);
        setDcError(null);
      } else {
        setDcApplied(null);
        setDcError(r.error);
      }
    } catch {
      setDcApplied(null);
      setDcError('確認折扣碼失敗,請再試一次');
    } finally {
      setDcBusy(false);
    }
  }
  // 改數量 → 300ms 後用已套用的碼重跑一次;掉出門檻會自動移除並顯示原因(原碼留在輸入框)
  const dcAppliedRef = useRef(dcApplied);
  dcAppliedRef.current = dcApplied;
  const applyNowRef = useRef(applyNow);
  applyNowRef.current = applyNow;
  useEffect(() => {
    const current = dcAppliedRef.current;
    if (!current) return;
    const t = window.setTimeout(() => { void applyNowRef.current(current.code); }, 300);
    return () => window.clearTimeout(t);
  }, [subtotal]);

  // 滿額贈:擇高式只算最高那條;可重複的規則會一直有下一個倍數可拿
  const gift = (() => {
    if (giftCfg.rules.length === 0) return null;
    const reached = giftCfg.rules.filter((g) => subtotal >= g.threshold_twd);
    const met = giftCfg.mode === 'highest' && reached.length > 0 ? [reached.reduce((b, g) => (g.threshold_twd > b.threshold_twd ? g : b))] : reached;
    const earned = met.map((g) => ({ ...g, times: g.repeat ? Math.max(1, Math.floor(subtotal / g.threshold_twd)) : 1 }));
    const targets = giftCfg.rules
      .map((g) => (subtotal < g.threshold_twd ? { g, at: g.threshold_twd } : g.repeat ? { g, at: (Math.floor(subtotal / g.threshold_twd) + 1) * g.threshold_twd } : null))
      .filter((x): x is { g: (typeof giftCfg.rules)[number]; at: number } => x !== null)
      .sort((a, b) => a.at - b.at);
    const nextTarget = targets[0] ?? null;
    const pct = nextTarget ? Math.min(100, Math.round((subtotal / nextTarget.at) * 100)) : 100;
    return { earned, next: nextTarget?.g ?? null, gap: nextTarget ? nextTarget.at - subtotal : 0, pct };
  })();

  // 已成立 → 顯 loading 直到 router.push 真的跳完(避免閃空車畫面 / 空表單)
  if (redirecting) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span className="ui-spin" style={{ width: 38, height: 38, borderWidth: 3 }} />
        <p style={{ fontSize: 17, margin: 0, fontWeight: 600 }}>
          {isLinePayPay ? '訂單已成立,正在前往 LINE Pay…' : isEcpayPay ? '訂單已成立,正在前往付款頁…' : '訂單已成立,跳轉中…'}
        </p>
        <p className="ui-muted" style={{ fontSize: 13, margin: 0 }}>請不要重複操作或關閉畫面</p>
      </div>
    );
  }

  // 2026-11-07:購物車在 localStorage,第一次 render 還沒讀到;讀到之前先放一個轉圈,
  // 不然有東西的購物車也會先閃一下「購物車是空的」
  if (!cartReady) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }} aria-busy="true">
        <span className="ui-spin" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  // 送出中 cart 被 clear() 清空時不要 flash 空車畫面(router.push 還沒導航完)
  if (items.length === 0 && !submitting) {
    return (
      <div className="ui-card ui-enter" style={{ maxWidth: 520, margin: '24px auto 0', padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ color: '#d4d4d8' }}><IconPackage size={40} /></div>
        <div>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>購物車是空的</p>
          <p className="ui-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>挑幾樣喜歡的商品再回來。</p>
        </div>
        <ButtonLink href={`/${slug}`} variant="primary" size="md">繼續購物</ButtonLink>
      </div>
    );
  }

  async function handleSubmit(formData: FormData) {
    // 2026-10-16:沒選配送方式時瀏覽器的必填提示會跑到畫面外,看起來像「按了沒反應」— 自己擋下並捲回該區塊
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
      // Phase 33:折扣碼驗不過 → 整張沒建單,清掉已套用的碼讓合計恢復;不自動重送。
      // 原因同時放到折扣碼輸入框下方(跟「套用」失敗一致),客人不會以為是自己點掉的
      if (result.discountInvalid) {
        setDcApplied(null);
        setDcError(result.error);
      }
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setRedirecting(true); // 馬上切到 loading 畫面,避免接下來 clear() 觸發空車閃屏
    clear();
    // Phase 22:訂單頁連結要帶存取碼,沒帶的話個資會被遮蔽、也不能付款 / 回報
    const kq = result.accessKey ? `k=${result.accessKey}` : '';
    // 2026-10-15:選 LINE Pay → 導去付款頁。發動失敗不擋單(訂單已成立),退回訂單頁讓客人重按一次付款。
    if (isLinePayPay) {
      const pay = await startLinePay(slug, result.orderNo, result.accessKey ?? '');
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
      window.location.href = `/api/ecpay/pay?slug=${encodeURIComponent(slug)}&orderNo=${encodeURIComponent(result.orderNo)}&method=${method}${kq ? `&${kq}` : ''}`;
      return;
    }
    router.push(`/${slug}/order/${result.orderNo}${kq ? `?${kq}` : ''}`);
  }

  // 地址元件吃 inline style,給它一組跟 .ui-input 一樣的樣式
  const inputStyle: React.CSSProperties = {
    height: 40, padding: '0 12px', border: '1px solid var(--ui-line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
    background: 'var(--ui-surface)', color: 'var(--ui-ink)', width: '100%', boxSizing: 'border-box',
  };

  // 明細一列(Phase 35 抽成函式:攤位 / 團購兩組都用同一個長相)
  const renderItem = (item: (typeof items)[number]) => (
    <div key={item.variantId} className="ck-item">
      <div className="ck-th">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" />
        ) : (
          <IconPackage size={20} />
        )}
      </div>
      <div className="ck-it">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ck-it-n">{item.productName}</div>
            {item.variantName && item.variantName !== 'default' && <div className="ck-it-v">{item.variantName}</div>}
            {unitPriceOf(item) < item.priceTwd && (
              <div className="ck-it-v ui-num" style={{ color: '#15803d', fontWeight: 500 }}>量購價 NT$ {money(unitPriceOf(item))}/件</div>
            )}
          </div>
          <button type="button" className="ck-rm" onClick={() => removeItem(item.variantId)} aria-label={`移除 ${item.productName}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="ck-it-row">
          <div className="ck-qty">
            <button type="button" onClick={() => updateQty(item.variantId, item.qty - 1)} aria-label="減少">−</button>
            <QtyInput qty={item.qty} onCommit={(n) => updateQty(item.variantId, n)} />
            <button type="button" onClick={() => updateQty(item.variantId, item.qty + 1)} aria-label="增加">+</button>
          </div>
          <span className="ui-num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>NT$ {money(unitPriceOf(item) * item.qty)}</span>
        </div>
      </div>
    </div>
  );

  const submitLabel = `${isLinePayPay ? '前往 LINE Pay 付款' : isEcpayPay ? '送出並前往付款' : '送出訂單'} · NT$ ${money(grandTotal)}`;
  const fine = isOnlinePay
    ? '付款完成後訂單會自動更新,不用回報帳號後 5 碼'
    : isCodPay
      ? '到店取貨時付款,不用先匯款;賣家寄出後會通知您'
      : payMethod === 'qr'
        ? '下單後到訂單頁掃碼付款,付完按「我已付款」,賣家核帳後出貨'
        : '下單後賣家會私訊匯款方式';
  const submitBtn = (cls: string) => (
    <div className={cls}>
      {/* Phase 35:團已截止 / 沒開團卻還有團購商品 → 擋在前端,送出鈕停用 */}
      {gbBlocked && <div className="ck-alert" role="alert" style={{ marginBottom: 10 }}>{GROUPBUY_CLOSED_ERROR}</div>}
      <Button type="submit" form="ck-form" variant="primary" size="lg" className="ui-num" style={{ width: '100%' }} disabled={submitting || gbBlocked}>
        {submitting ? '處理中,訂單建立中…' : submitLabel}
      </Button>
      <p className="ck-fine">{fine}</p>
      {/* 2026-11-06:條款同意 + 出貨時程 + 卡號不經本站(有線上付款才講);2026-11-07 改成一行一點,不擠在一段 */}
      <ul className="ck-notes">
        <li><span>送出即表示同意<a href={`/${slug}/policy/terms`} target="_blank" rel="noreferrer">服務條款</a>與<a href={`/${slug}/policy/refund`} target="_blank" rel="noreferrer">退款政策</a></span></li>
        <li><span>{isCodPay ? '下單後 1–3 個工作天寄出,到店取貨時付款' : '確認付款後 1–3 個工作天出貨'}</span></li>
        {(linePayOn || ecpayOn) && <li><span>刷卡與 LINE Pay 在金流商頁面完成,本站不會取得您的卡號</span></li>}
      </ul>
    </div>
  );

  return (
    <div className="ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="ck-title">
        <div>
          <h1>結帳</h1>
          {/* 購物車跟結帳是同一頁,所以是「繼續購物」不是「回購物車」 */}
          <a href={`/${slug}`} className="ck-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
            繼續購物
          </a>
        </div>
        <div className="ck-steps" aria-label="步驟"><b>1 填寫資料</b><span>2 付款</span><span>3 完成</span></div>
      </div>

      {/* 2026-10-22:建立訂單期間蓋住整個畫面,按不到別的東西(建好後換成上面的跳轉畫面) */}
      {submitting && (
        <div className="ck-overlay" aria-busy="true" aria-live="polite">
          <span className="ui-spin big" />
          <div style={{ fontSize: 15, fontWeight: 600 }}>訂單建立中,請稍候…</div>
          <div className="ui-muted" style={{ fontSize: 12 }}>請不要重複按送出或關閉畫面</div>
        </div>
      )}

      <div className="ck-layout">
        {/* ---------- 左:表單 ---------- */}
        <form id="ck-form" className="ck-form" action={handleSubmit}>
          {/* Phase 33:已套用的折扣碼跟表單走(右邊 Card 不在 form 裡);只送碼文字,金額 server 重算 */}
          <input type="hidden" name="discount_code" value={dcApplied?.code ?? ''} />
          {/* D#13:配送方式(攤位有設運費規則才顯示) */}
          {showShip && (
            <section id="ship-section" className="ck-sec" aria-labelledby="ship-h">
              <div className="ck-sec-h"><span className="ck-n" aria-hidden>1</span><h2 id="ship-h">配送方式</h2><span>必選</span></div>
              {shipError && <div className="ck-alert ck-alert-in">請先選擇配送方式才能送出訂單</div>}
              <div className="ck-opts" role="radiogroup" aria-label="配送方式">
                {shipOptions.map((opt) => {
                  const isFree = !!opt.free_over && subtotal >= opt.free_over;
                  const isPickupOpt = opt.key === 'pickup';
                  return (
                    <OptionCard
                      key={opt.key}
                      name="shipping_method"
                      value={opt.key}
                      on={shipKey === opt.key}
                      onSelect={() => { setShipKey(opt.key); setShipError(false); }}
                      icon={opt.cvs ? <IconStore size={16} /> : isPickupOpt ? <IconPackage size={16} /> : <IconTruck size={16} />}
                      title={opt.label}
                      trailing={
                        <span className="ui-num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', color: isFree || opt.fee === 0 ? '#15803d' : 'var(--ui-ink)' }}>
                          {opt.fee === 0 ? '免運費' : isFree ? '免運' : `NT$ ${money(opt.fee)}`}
                        </span>
                      }
                      desc={
                        opt.free_over
                          ? isFree
                            ? `已滿 NT$ ${money(opt.free_over)},免運`
                            : `滿 NT$ ${money(opt.free_over)} 免運(還差 NT$ ${money(opt.free_over - subtotal)})`
                          : undefined
                      }
                      note={opt.note ? `※ ${opt.note}` : undefined}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* 2026-10-15:付款方式;2026-10-22:順序 信用卡 → LINE Pay → ATM 轉帳 → 匯款(人工核帳)
              Phase 28:只有一種(通常是匯款)就不用選、不顯示;兩種以上才顯示;一種都沒有顯示提示 */}
          {showPay && (
            <section className="ck-sec" aria-labelledby="pay-h">
              <div className="ck-sec-h"><span className="ck-n" aria-hidden>{nPay}</span><h2 id="pay-h">付款方式</h2><span>必選</span></div>
              <div className="ck-opts" role="radiogroup" aria-label="付款方式">
                {/* Phase 36:超商取貨付款 — 只在選了店到店時出現,排第一(選了超商的人多半就是要到店付) */}
                {codOn && (
                  <OptionCard name="payment_method" value="cod" on={payMethod === 'cod'} onSelect={() => setPayMethod('cod')} icon={<IconStore size={16} />} title="超商取貨付款" trailing={<Badge>到店付款</Badge>} desc={`到店取貨時付款 NT$ ${money(grandTotal)}(含運費)${codCfg?.note ? `。${codCfg.note}` : ''}`} />
                )}
                {ecpayOn && (
                  <OptionCard name="payment_method" value="ecpay_credit" on={payMethod === 'ecpay_credit'} onSelect={() => setPayMethod('ecpay_credit')} icon={<IconCreditCard size={16} />} title="信用卡" trailing={<Badge>立即付款</Badge>} desc="送出後前往綠界刷卡,付款完成訂單自動更新" />
                )}
                {linePayOn && (
                  <OptionCard name="payment_method" value="line_pay" on={payMethod === 'line_pay'} onSelect={() => setPayMethod('line_pay')} icon={<IconWallet size={16} />} title="LINE Pay" trailing={<Badge>立即付款</Badge>} desc="送出後直接前往 LINE Pay 付款,不用回報後 5 碼" />
                )}
                {ecpayAtmOn && (
                  <OptionCard name="payment_method" value="ecpay_atm" on={payMethod === 'ecpay_atm'} onSelect={() => setPayMethod('ecpay_atm')} icon={<IconBank size={16} />} title="ATM 轉帳" trailing={<Badge>免回報</Badge>} desc="送出後取得專屬轉帳帳號,3 天內轉帳,系統自動對帳" />
                )}
                {qrCfg && (
                  <OptionCard name="payment_method" value="qr" on={payMethod === 'qr'} onSelect={() => setPayMethod('qr')} icon={<IconWallet size={16} />} title={`掃碼付款(${qrCfg.label})`} desc="下單後到訂單頁掃 QR 付款,付完按「我已付款」,賣家核帳後出貨" />
                )}
                {bankOn && (
                  <OptionCard name="payment_method" value="bank" on={payMethod === 'bank'} onSelect={() => setPayMethod('bank')} icon={<IconBank size={16} />} title="匯款至店家帳戶" desc="匯款後到訂單頁回報帳號後 5 碼,等待人工核帳" />
                )}
                {!bankOn && !ecpayOn && !linePayOn && !ecpayAtmOn && !qrCfg && !codOn && (
                  <p className="ui-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>賣家還沒設定收款方式,下單後賣家會聯絡你付款。</p>
                )}
              </div>
            </section>
          )}

          <section className="ck-sec" aria-labelledby="addr-h">
            <div className="ck-sec-h">
              <span className="ck-n" aria-hidden>{nAddr}</span>
              <h2 id="addr-h">{cvs || isPickup ? '取貨資訊' : '收件資訊'}</h2>
              <span>{isPickup ? '來店取貨時核對' : cvs ? '超商取件時核對' : '收件人會收到出貨通知'}</span>
            </div>
            <div className="ck-sec-b">
            {/* 會員有過訂單 → 一鍵帶入上次的收件資料(姓名、電話、地址) */}
            {member && lastShip && !cvs && (
              <Button type="button" variant="outline" size="sm" className="ck-last" onClick={() => setPrefill((p) => ({ name: lastShip.recipient, phone: lastShip.phone, address: lastShip.address, v: p.v + 1 }))}>
                用上次的收件資料:{lastShip.recipient} · {lastShip.address.slice(0, 12)}{lastShip.address.length > 12 ? '…' : ''}
              </Button>
            )}
            <div className="ck-row2">
              <div className="ck-field">
                <label className="ui-label" htmlFor="recipient" style={{ marginBottom: 0 }}>{cvs || isPickup ? '取件人姓名' : '收件人姓名'} <i>*</i></label>
                {/* key 跟著預填版本換:會員資料載進來、按「用上次的」時重掛一次,把預設值填進去 */}
                <input key={`n${prefill.v}`} id="recipient" name="recipient" type="text" required defaultValue={prefill.name} className="ui-input" placeholder="王小明" autoComplete="name" />
              </div>
              <div className="ck-field">
                <label className="ui-label" htmlFor="phone" style={{ marginBottom: 0 }}>聯絡電話 <i>*</i></label>
                <input key={`p${prefill.v}`} id="phone" name="phone" type="tel" required defaultValue={prefill.phone} className="ui-input" placeholder="0912 345 678" autoComplete="tel" pattern="[0-9+\-() ]{8,20}" title="請填 8 到 20 位的電話號碼" />
              </div>
            </div>
            {/* 2026-11-06:訪客可以留 Email — 之後用信箱登入時會把這張單對回會員;會員直接帶自己的 */}
            {member?.email ? (
              <input type="hidden" name="guestEmail" value={member.email} />
            ) : (
              <div className="ck-field">
                <label className="ui-label" htmlFor="guest-email" style={{ marginBottom: 0 }}>Email<span className="ui-muted" style={{ fontWeight: 400 }}>(選填)</span></label>
                <input id="guest-email" name="guestEmail" type="email" className="ui-input" placeholder="name@example.com" autoComplete="email" />
                <p className="ck-hint">之後用這個信箱登入,就能在「我的訂單」看到這張單。</p>
              </div>
            )}
            {isPickup ? (
              /* 2026-11-06:門市自取不填地址 */
              <div className="ck-pick">自取不用填地址。取貨地點與營業時間請看訂單頁和賣家的聯絡資訊,到店時報姓名和電話即可。</div>
            ) : cvs ? (
              /* Phase 29:超商店到店 — 填取貨門市,不填地址;取件要核對姓名與手機 */
              <>
                <div className="ck-row2">
                  <div className="ck-field">
                    <label className="ui-label" htmlFor="cvs-store-name" style={{ marginBottom: 0 }}>{CVS_CHAINS[cvs].short} 取貨門市 <i>*</i></label>
                    <input id="cvs-store-name" name="cvs_store_name" type="text" required maxLength={40} className="ui-input" placeholder="例:大安門市" autoComplete="off" />
                  </div>
                  <div className="ck-field">
                    <label className="ui-label" htmlFor="cvs-store-id" style={{ marginBottom: 0 }}>店號 <i>*</i></label>
                    <input id="cvs-store-id" name="cvs_store_id" type="text" required inputMode="numeric" pattern="[0-9]{3,10}" className="ui-input" placeholder="例:123456" autoComplete="off" />
                  </div>
                </div>
                <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                  店號可以到{' '}
                  <a href={CVS_CHAINS[cvs].mapUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--ui-accent-ink)', fontWeight: 500 }}>{CVS_CHAINS[cvs].short} 官方門市查詢</a>
                  {' '}找。取貨時超商會核對姓名和手機,請填本名。
                </p>
              </>
            ) : (
              <div className="ck-field">
                <span className="ui-label" style={{ marginBottom: 0 }}>寄送地址 <i>*</i></span>
                {/* 2026-09-11(回饋 #8):縣市/區下拉 + 詳細地址,送出仍是單一 address 字串;key 跟預填版本換 */}
                <TwAddressFields key={`a${prefill.v}`} required initial={prefill.address} inputStyle={inputStyle} />
              </div>
            )}
            {/* 統編不出現在結帳頁,連 placeholder 都不提(2026-09-11 Peter 決定,2026-11-07 再次確認) */}
            <div className="ck-field">
              <label className="ui-label" htmlFor="note" style={{ marginBottom: 0 }}>備註(選填)</label>
              <Textarea id="note" name="note" rows={3} placeholder="有其他需求請寫在這裡,例如指定到貨時段、包裝需求" />
            </div>
            </div>
          </section>

          {error && <div className="ck-alert" role="alert">{error}</div>}

          {submitBtn('ck-submit-m')}
        </form>

        {/* ---------- 右:摘要 ---------- */}
        <Card className="ck-sum">
          <h2>商品明細 <span className="ui-num">{totalQty} 件</span></h2>
          {/* Phase 35:有團購商品才分兩組;沒有就照舊一串列到底 */}
          {gbItems.length > 0 ? (
            <>
              {stallItems.length > 0 && (
                <>
                  <div className="ck-grp">攤位 <span>· 下單後 1–3 個工作天出貨</span></div>
                  {stallItems.map(renderItem)}
                </>
              )}
              <div className="ck-grp">
                團購
                {/* gbInfo 還沒回來前只印「團購」,不先閃一下「目前沒開團」 */}
                <span>{!gbInfo ? '' : currentGb ? `· ${currentGb.name} · ${fmtArrivalPhrase(currentGb.expected_arrival_on)}` : '· 目前沒開團'}</span>
              </div>
              {gbItems.map(renderItem)}
              <p className="ck-grp-hint">整張單會等到貨後一起出,想先拿現貨請分開下單</p>
            </>
          ) : (
            items.map(renderItem)
          )}

          {gift && (
            <div className="ck-gift">
              <div className="ck-gift-t">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconGift size={14} /> 滿額贈</span>
                <span className="ui-num" style={{ color: gift.next ? 'var(--ui-ink)' : '#15803d' }}>{gift.next ? `還差 NT$ ${money(gift.gap)}` : '已達最高門檻'}</span>
              </div>
              <div className="ck-bar"><div style={{ width: `${gift.pct}%` }} /></div>
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

          {/* Phase 33:折扣碼(攤位有啟用中的碼才顯示;輸入框不放進 form,Enter 才不會送出整張訂單) */}
          {dcOffered && items.length > 0 && (
            <div className="ck-dc">
              {dcApplied ? (
                <div className="ck-dc-chip" role="status">
                  <IconCheck size={14} />
                  <span className="t">
                    折扣碼 {dcApplied.code} 已套用
                    {dcApplied.per_customer_once && <span className="s">每人限用一次,送出時以聯絡電話確認</span>}
                  </span>
                  <button type="button" className="x" aria-label="移除折扣碼" onClick={() => { setDcApplied(null); setDcError(null); }}>
                    <IconX size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="ck-dc-row">
                    <input
                      className="ui-input"
                      placeholder="折扣碼"
                      aria-label="折扣碼"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={20}
                      value={dcInput}
                      onChange={(e) => { setDcInput(e.target.value.toUpperCase()); setDcError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyNow(); } }}
                      aria-invalid={!!dcError}
                    />
                    <Button type="button" variant="outline" size="md" disabled={!dcInput.trim() || dcBusy} onClick={() => { void applyNow(); }}>
                      {dcBusy ? '確認中…' : '套用'}
                    </Button>
                  </div>
                  {dcError && <p className="ck-dc-err" role="alert">{dcError}</p>}
                </>
              )}
            </div>
          )}

          <div className="ck-tot">
            <div className="r"><span>商品小計</span><span className="ui-num" style={{ color: 'var(--ui-ink)' }}>NT$ {money(subtotal)}</span></div>
            {discount > 0 && dcApplied && (
              <div className="r">
                <span>折扣碼 {dcApplied.code}</span>
                <span className="ui-num" style={{ color: '#15803d' }} aria-live="polite">−NT$ {money(discount)}</span>
              </div>
            )}
            {shipOptions.length > 0 && (
              <div className="r">
                <span>運費{shipOption ? `(${shipOption.label})` : ''}</span>
                {shipOption ? (
                  <span className="ui-num" style={{ color: shipFee === 0 ? '#15803d' : 'var(--ui-ink)' }}>{shipFee === 0 ? '免運' : `NT$ ${money(shipFee)}`}</span>
                ) : (
                  <span>請選配送方式</span>
                )}
              </div>
            )}
            <div className="g"><span>合計</span><span className="ui-num">NT$ {money(grandTotal)}</span></div>
          </div>

          {submitBtn('ck-submit-d')}
        </Card>
      </div>
    </div>
  );
}

/**
 * 購物車數量輸入框:可直接打字改;打字過程允許清空,離開欄位時空值/0 恢復原數量(整列刪除用 × 按鈕)。
 */
function QtyInput({ qty, onCommit }: { qty: number; onCommit: (n: number) => void }) {
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
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }}
      onBlur={() => {
        const n = parseInt(text ?? '', 10);
        if (Number.isFinite(n) && n > 0) onCommit(n);
        setText(null);
      }}
    />
  );
}
