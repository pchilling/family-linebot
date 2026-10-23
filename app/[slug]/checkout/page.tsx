'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../cart-state';
import { TwAddressFields } from '@/lib/tw-districts';
import { IconBank, IconCreditCard, IconGift, IconPackage, IconTruck, IconWallet } from '@/lib/icons';
import { Badge, Button, ButtonLink, Card, OptionCard, Textarea } from '@/lib/ui';
import { createOrder, getCartPricingInfo, getGiftRulesPublic, getShippingOptions, isEcpayAtmAvailable, isEcpayAvailable, isLinePayAvailable, startLinePay, type CartPricingInfo, type GiftConfigPublic, type ShippingOption } from './actions';

// 2026-10-22:付款方式 — 匯款(人工核帳)/ LINE Pay / 綠界 ATM 虛擬帳號 / 綠界信用卡
type PayMethod = 'bank' | 'line_pay' | 'ecpay_atm' | 'ecpay_credit';

type Props = {
  params: Promise<{ slug: string }>;
};

const money = (n: number) => n.toLocaleString('en-US');

const CSS = `
.ck-title{padding:4px 0 24px;display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.ck-title h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em}
.ck-steps{display:flex;gap:6px;font-size:13px;color:var(--ui-muted);align-items:center}
.ck-steps b{color:var(--ui-ink);font-weight:500}
.ck-steps i{width:16px;height:1px;background:var(--ui-line);display:inline-block}
.ck-layout{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:48px;align-items:start}
.ck-form{display:flex;flex-direction:column;gap:36px;min-width:0}
.ck-sec{display:flex;flex-direction:column;gap:12px;scroll-margin-top:80px}
.ck-sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.ck-sec-h h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.ck-sec-h span{font-size:12px;color:var(--ui-muted)}
.ck-opts{display:flex;flex-direction:column;gap:10px}
.ck-field{display:flex;flex-direction:column;gap:6px}
.ck-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ck-sum{position:sticky;top:80px;padding:20px}
.ck-sum h2{margin:0 0 16px;font-size:16px;font-weight:600;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:baseline}
.ck-sum h2 span{font-size:12px;color:var(--ui-muted);font-weight:400}
.ck-item{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--ui-line-soft)}
.ck-item:first-of-type{border-top:0;padding-top:0}
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
.ck-tot{margin-top:16px;padding-top:14px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:8px;font-size:14px}
.ck-tot .r{display:flex;justify-content:space-between;gap:12px;color:#52525b}
.ck-tot .g{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;margin-top:4px;border-top:1px solid var(--ui-line);color:var(--ui-ink);font-weight:600}
.ck-tot .g span:last-child{font-size:22px}
.ck-fine{font-size:12px;color:var(--ui-muted);text-align:center;margin:10px 0 0;line-height:1.6}
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
  const { items, totalQty, updateQty, removeItem, clear } = useCart(slug);
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
  // Phase 26:已登入就預填收件人與電話,並把信箱帶進訂單(查單、對帳號用);沒登入照舊
  const [member, setMember] = useState<{ name: string | null; email: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { member: { name: string | null; email: string | null; phone: string | null } | null }) => setMember(d.member ?? null))
      .catch(() => {});
  }, []);
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
  const shipFee = shipOption ? (shipOption.free_over && subtotal >= shipOption.free_over ? 0 : shipOption.fee) : 0;
  const grandTotal = subtotal + shipFee;

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

  const submitLabel = `${isLinePayPay ? '前往 LINE Pay 付款' : isEcpayPay ? '送出並前往付款' : '送出訂單'} · NT$ ${money(grandTotal)}`;
  const fine = isOnlinePay ? '付款完成後訂單會自動更新,不用回報帳號後 5 碼' : '下單後賣家會私訊匯款方式';
  const submitBtn = (cls: string) => (
    <div className={cls}>
      <Button type="submit" form="ck-form" variant="primary" size="lg" className="ui-num" style={{ width: '100%' }} disabled={submitting}>
        {submitting ? '處理中,訂單建立中…' : submitLabel}
      </Button>
      <p className="ck-fine">{fine}</p>
    </div>
  );

  return (
    <div className="ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="ck-title">
        <h1>結帳</h1>
        <div className="ck-steps" aria-label="步驟"><b>1 填寫資料</b><i /><span>2 付款</span><i /><span>3 完成</span></div>
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
          {/* D#13:配送方式(攤位有設運費規則才顯示) */}
          {shipOptions.length > 0 && (
            <section id="ship-section" className="ck-sec" aria-labelledby="ship-h">
              <div className="ck-sec-h"><h2 id="ship-h">配送方式</h2><span>必選</span></div>
              {shipError && <div className="ck-alert">請先選擇配送方式才能送出訂單</div>}
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
                      icon={isPickupOpt ? <IconPackage size={16} /> : <IconTruck size={16} />}
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

          {/* 2026-10-15:付款方式(攤位有開 LINE Pay 或綠界才顯示;都沒開一律匯款)
              2026-10-22:順序 信用卡 → LINE Pay → ATM 轉帳 → 匯款(人工核帳) */}
          {(linePayOn || ecpayOn) && (
            <section className="ck-sec" aria-labelledby="pay-h">
              <div className="ck-sec-h"><h2 id="pay-h">付款方式</h2><span>必選</span></div>
              <div className="ck-opts" role="radiogroup" aria-label="付款方式">
                {ecpayOn && (
                  <OptionCard name="payment_method" value="ecpay_credit" on={payMethod === 'ecpay_credit'} onSelect={() => setPayMethod('ecpay_credit')} icon={<IconCreditCard size={16} />} title="信用卡" trailing={<Badge>立即付款</Badge>} desc="送出後前往綠界刷卡,付款完成訂單自動更新" />
                )}
                {linePayOn && (
                  <OptionCard name="payment_method" value="line_pay" on={payMethod === 'line_pay'} onSelect={() => setPayMethod('line_pay')} icon={<IconWallet size={16} />} title="LINE Pay" trailing={<Badge>立即付款</Badge>} desc="送出後直接前往 LINE Pay 付款,不用回報後 5 碼" />
                )}
                {ecpayAtmOn && (
                  <OptionCard name="payment_method" value="ecpay_atm" on={payMethod === 'ecpay_atm'} onSelect={() => setPayMethod('ecpay_atm')} icon={<IconBank size={16} />} title="ATM 轉帳" trailing={<Badge>免回報</Badge>} desc="送出後取得專屬轉帳帳號,3 天內轉帳,系統自動對帳" />
                )}
                <OptionCard name="payment_method" value="bank" on={payMethod === 'bank'} onSelect={() => setPayMethod('bank')} icon={<IconBank size={16} />} title="匯款至店家帳戶" desc="匯款後到訂單頁回報帳號後 5 碼,等待人工核帳" />
              </div>
            </section>
          )}

          <section className="ck-sec" aria-labelledby="addr-h">
            <div className="ck-sec-h"><h2 id="addr-h">收件資訊</h2></div>
            <div className="ck-row2">
              <div className="ck-field">
                <label className="ui-label" htmlFor="recipient" style={{ marginBottom: 0 }}>收件人姓名 <i>*</i></label>
                {/* key 跟著會員資料換:資料載進來時重掛一次,把預設值填進去 */}
                <input key={member ? 'm' : 'g'} id="recipient" name="recipient" type="text" required defaultValue={member?.name ?? ''} className="ui-input" placeholder="王小明" autoComplete="name" />
              </div>
              <div className="ck-field">
                <label className="ui-label" htmlFor="phone" style={{ marginBottom: 0 }}>聯絡電話 <i>*</i></label>
                <input key={member ? 'm' : 'g'} id="phone" name="phone" type="tel" required defaultValue={member?.phone ?? ''} className="ui-input" placeholder="0912 345 678" autoComplete="tel" />
              </div>
            </div>
            {member?.email && <input type="hidden" name="guestEmail" value={member.email} />}
            <div className="ck-field">
              <span className="ui-label" style={{ marginBottom: 0 }}>寄送地址 <i>*</i></span>
              {/* 2026-09-11(回饋 #8):縣市/區下拉 + 詳細地址,送出仍是單一 address 字串 */}
              <TwAddressFields required inputStyle={inputStyle} />
            </div>
            <div className="ck-field">
              <label className="ui-label" htmlFor="note" style={{ marginBottom: 0 }}>備註(選填)</label>
              {/* 需要統編直接寫在備註 */}
              <Textarea id="note" name="note" rows={3} placeholder="如需統編發票或有其他需求,請填寫在這裡" />
            </div>
          </section>

          {error && <div className="ck-alert" role="alert">{error}</div>}

          {submitBtn('ck-submit-m')}
        </form>

        {/* ---------- 右:摘要 ---------- */}
        <Card className="ck-sum">
          <h2>商品明細 <span className="ui-num">{totalQty} 件</span></h2>
          {items.map((item) => (
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
          ))}

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

          <div className="ck-tot">
            <div className="r"><span>商品小計</span><span className="ui-num" style={{ color: 'var(--ui-ink)' }}>NT$ {money(subtotal)}</span></div>
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
