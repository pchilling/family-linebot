import type { Metadata } from 'next';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { getTenantPublic, orderPayable, supabaseAdmin } from '@/lib/supabase';
import { CopyButton } from './copy-button';
import { reportPaymentLast5, reportQrPaid } from './actions';
import { startLinePayAndRedirect } from '../../checkout/actions';
import { IconBank, IconCheck, IconCheckCircle, IconClock, IconCreditCard, IconPackage, IconPencil, IconStore, IconTruck, IconUndo, IconWallet, IconX } from '@/lib/icons';
import { OtpInput } from '@/lib/otp-input';
import { Badge, Button, ButtonLink, Card } from '@/lib/ui';
import { bankDisplayName, bankTransferFromRow } from '@/lib/bank-transfer';
import { CVS_CHAINS, codPaymentFromRow, isCvsChain } from '@/lib/cvs';
import { fmtArrivalPhrase, toGroupBuyPublic, type GroupBuyPublic, type GroupBuyStatus } from '@/lib/groupbuy';

type Props = {
  params: Promise<{ slug: string; order_no: string }>;
  // 2026-10-15:LINE Pay 導回帶的狀態(done / cancel / failed)
  // 2026-10-22:綠界導回帶的狀態(done / atm / failed / cancelled_order)
  // 2026-10-23:k = 訂單存取碼;沒帶對的碼只看得到狀態,個資遮蔽、不能付款或回報
  searchParams?: Promise<{ linepay?: string; ecpay?: string; k?: string }>;
};

type OrderItemRow = {
  qty: number;
  price_at_purchase: number;
  subtotal_twd: number;
  variant_name: string | null;
  product_name: string;
  image_url: string | null;
  is_groupbuy: boolean; // Phase 35:團購品名旁標「團購」
};

type OrderDetail = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  atm_bank_code: string | null;
  atm_vaccount: string | null;
  atm_expire_at: string | null;
  total_twd: number;
  discount_code: string | null; // Phase 33:用過的折扣碼(文字,碼刪了照樣顯示)
  discount_twd: number;
  shipping_method: string | null;
  shipping_fee_twd: number;
  payment_last5: string | null;
  payment_reported_at: string | null;
  payment_note: string | null; // Phase 27:掃碼付款回報的備註
  invoice_tax_id: string | null;
  invoice_title: string | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  cvs_type: string | null; // Phase 29:超商店到店('711' | 'family')
  cvs_store_id: string | null;
  cvs_store_name: string | null;
  tracking_no: string | null; // 攤主寄件後填的單號
  note: string | null;
  guest_email: string | null;
  created_at: string;
  paid_at: string | null; // 2026-11-05:進度時間軸用(trigger 自動填)
  shipped_at: string | null;
  access_key: string | null; // Phase 22:訂單存取碼(網址 ?k=),對得上才看得到個資
  groupBuy: GroupBuyPublic | null; // Phase 35(2026-11-07):這張單屬於哪一團(時間軸多一步「等待團購到貨」)
  items: OrderItemRow[];
};

// Phase 22:沒帶存取碼時個資只給部分,讓本人認得出是自己的單、外人看不出完整資料
function maskName(s: string | null): string {
  if (!s) return '';
  return s.length <= 1 ? s : s[0] + '＊'.repeat(Math.min(s.length - 1, 3));
}
function maskPhone(s: string | null): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 6 ? `${d.slice(0, 4)}***${d.slice(-2)}` : '***';
}
function maskAddress(s: string | null): string {
  if (!s) return '';
  return `${s.slice(0, 6)}＊＊＊`;
}
function maskEmail(s: string): string {
  const [u, d] = s.split('@');
  return `${(u ?? '').slice(0, 2)}***@${d ?? ''}`;
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

async function getOrder(tenantId: string, orderNo: string): Promise<OrderDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, status, payment_status, payment_method, atm_bank_code, atm_vaccount, atm_expire_at, total_twd, discount_code, discount_twd, shipping_method, shipping_fee_twd, payment_last5, payment_reported_at, payment_note, invoice_tax_id, invoice_title, shipping_recipient, shipping_phone, shipping_address, cvs_type, cvs_store_id, cvs_store_name, tracking_no, note, guest_email, created_at, paid_at, shipped_at, access_key, group_buy_id, group_buys(id, name, description, status, ends_at, expected_arrival_on, arrived_at), order_items(qty, price_at_purchase, subtotal_twd, products(name, image_url, media, channel), product_variants(variant_name, image_url))',
    )
    .eq('tenant_id', tenantId)
    .eq('order_no', orderNo)
    .maybeSingle();

  if (error || !data) return null;

  type Row = Omit<OrderDetail, 'items' | 'groupBuy'> & {
    group_buy_id: string | null;
    group_buys: {
      id: string;
      name: string;
      description: string | null;
      status: GroupBuyStatus;
      ends_at: string | null;
      expected_arrival_on: string | null;
      arrived_at: string | null;
    } | null;
    order_items: {
      qty: number;
      price_at_purchase: number;
      subtotal_twd: number;
      products: { name: string; image_url: string | null; media: { type: string; url: string }[] | null; channel: string | null } | null;
      product_variants: { variant_name: string; image_url: string | null } | null;
    }[] | null;
  };
  const row = data as unknown as Row;
  const items: OrderItemRow[] = (row.order_items ?? []).map((i) => ({
    qty: i.qty,
    price_at_purchase: i.price_at_purchase,
    subtotal_twd: i.subtotal_twd,
    product_name: i.products?.name ?? '(已下架商品)',
    // 沒有規格的商品,系統規格名是 'default',客人不用看到(2026-11-09)
    variant_name: i.product_variants?.variant_name && i.product_variants.variant_name !== 'default' ? i.product_variants.variant_name : null,
    is_groupbuy: i.products?.channel === 'groupbuy',
    // 縮圖:規格圖 → 商品 media 第一張圖 → 舊的 image_url
    image_url:
      i.product_variants?.image_url ??
      (Array.isArray(i.products?.media) ? i.products.media.find((m) => m.type === 'image')?.url : undefined) ??
      i.products?.image_url ??
      null,
  }));

  return {
    id: row.id,
    order_no: row.order_no,
    status: row.status,
    payment_status: row.payment_status,
    payment_method: row.payment_method ?? null,
    atm_bank_code: row.atm_bank_code ?? null,
    atm_vaccount: row.atm_vaccount ?? null,
    atm_expire_at: row.atm_expire_at ?? null,
    total_twd: row.total_twd,
    discount_code: row.discount_code ?? null,
    discount_twd: row.discount_twd ?? 0,
    shipping_method: row.shipping_method ?? null,
    shipping_fee_twd: row.shipping_fee_twd ?? 0,
    payment_last5: row.payment_last5 ?? null,
    payment_reported_at: row.payment_reported_at ?? null,
    payment_note: row.payment_note ?? null,
    invoice_tax_id: row.invoice_tax_id ?? null,
    invoice_title: row.invoice_title ?? null,
    shipping_recipient: row.shipping_recipient,
    shipping_phone: row.shipping_phone,
    shipping_address: row.shipping_address,
    cvs_type: row.cvs_type ?? null,
    cvs_store_id: row.cvs_store_id ?? null,
    cvs_store_name: row.cvs_store_name ?? null,
    tracking_no: row.tracking_no ?? null,
    note: row.note,
    guest_email: row.guest_email,
    created_at: row.created_at,
    paid_at: row.paid_at ?? null,
    shipped_at: row.shipped_at ?? null,
    access_key: row.access_key ?? null,
    groupBuy: row.group_buys ? toGroupBuyPublic(row.group_buys) : null,
    items,
  };
}

const STATUS_LABEL: Record<string, string> = {
  open: '處理中',
  paid: '已付款',
  shipped: '已出貨',
  delivered: '已送達',
  cancelled: '已取消',
  refunded: '已退款',
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: '等待匯款',
  paid: '已收款',
  failed: '付款失敗',
  refunded: '已退款',
};

const METHOD_LABEL: Record<string, string> = {
  bank: '匯款至店家帳戶',
  line_pay: 'LINE Pay',
  ecpay_credit: '信用卡',
  ecpay_atm: 'ATM 轉帳',
  qr: '掃碼付款',
  cod: '超商取貨付款', // Phase 36
};

const money = (n: number) => n.toLocaleString('en-US');

const CSS = `
.od{max-width:720px;margin:0 auto}
.od-status{padding:18px 20px;border-radius:10px;border:1px solid;display:flex;align-items:center;gap:14px;margin-bottom:20px}
.od-status .ic{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.od-status h1{margin:0;font-size:1.125rem;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.od-status p{margin:4px 0 0;font-size:.8125rem;opacity:.9;line-height:1.5}
.od-status .no{display:flex;align-items:baseline;gap:4px;margin-top:8px;font-size:.8125rem;flex-wrap:wrap}
.od-status .no strong{font-size:.875rem;letter-spacing:.01em}
.od-status .no em{font-style:normal;white-space:nowrap}
.od-tl{list-style:none;margin:0;padding:0}
.od-tl li.s{position:relative;display:grid;grid-template-columns:30px 1fr;column-gap:14px;padding-bottom:20px;animation:od-rise .35s ease both}
.od-tl li.s:nth-child(1){animation-delay:.05s}.od-tl li.s:nth-child(3){animation-delay:.15s}.od-tl li.s:nth-child(5){animation-delay:.25s}.od-tl li.s:nth-child(7){animation-delay:.35s}.od-tl li.s:nth-child(9){animation-delay:.45s}.od-tl li.s:nth-child(11){animation-delay:.55s}
.od-tl li.s:last-child{padding-bottom:0}
.od-tl li.s::before{content:"";position:absolute;left:14px;top:30px;bottom:-2px;width:2px;background:var(--ui-line)}
.od-tl li.s:last-child::before{display:none}
.od-tl li.s[data-line="true"]::before{background:var(--ui-accent)}
.od-tl li.ln{display:none}
.od-tl .ic{width:30px;height:30px;border-radius:50%;border:2px solid var(--ui-line);background:var(--ui-surface);display:grid;place-items:center;color:var(--ui-faint);position:relative;z-index:1;box-sizing:border-box;font-size:.75rem;font-weight:600}
.od-tl li[data-state="done"] .ic{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-on-accent)}
.od-tl li[data-state="current"] .ic{border-color:var(--ui-accent);color:var(--ui-accent)}
.od-tl li[data-state="current"] .ic::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:2px solid var(--ui-accent);animation:od-ping 1.6s cubic-bezier(0,0,.2,1) infinite}
.od-tl .t{display:flex;flex-direction:column;gap:2px;padding-top:4px;min-width:0}
.od-tl .t b{font-size:.875rem;font-weight:500;color:var(--ui-ink)}
.od-tl li[data-state="pending"] .t b{color:var(--ui-faint);font-weight:400}
.od-tl .t small{font-size:.75rem;color:var(--ui-muted);font-variant-numeric:tabular-nums}
.od-tl li[data-state="current"] .t small{color:var(--ui-ink)}
.od-tl .t em{font-style:normal;font-size:.75rem;color:var(--ui-muted);line-height:1.5;margin-top:2px;overflow-wrap:anywhere}
.od-nowstep{display:none;align-items:center;gap:12px;margin-top:18px;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line)}
.od-nowstep .ic{width:34px;height:34px;border-radius:50%;border:2px solid var(--ui-accent);color:var(--ui-accent);background:var(--ui-surface);display:grid;place-items:center;flex-shrink:0;font-size:.8125rem;font-weight:600;box-sizing:border-box}
.od-nowstep .ic[data-state="done"]{background:var(--ui-accent);color:var(--ui-on-accent)}
.od-nowstep b{display:block;font-size:.9375rem;font-weight:600}
.od-nowstep small{display:block;font-size:.75rem;color:var(--ui-muted);margin-top:2px;line-height:1.5;overflow-wrap:anywhere}
/* 2026-11-09(Peter 選 C2):電腦版橫式 — 第一步靠左、最後一步靠右,圓圈之間是連接線;每步只留標題和時間,說明集中到底下「現在這一步」 */
@media (min-width:640px){
  .od-tl{display:flex;align-items:flex-start;padding:0 4px}
  .od-tl li.s{display:flex;flex-direction:column;align-items:center;text-align:center;flex:0 0 auto;max-width:150px;padding-bottom:0}
  .od-tl li.s::before{display:none}
  .od-tl li.ln{display:block;flex:1 1 0;height:2px;background:var(--ui-line);margin:14px 8px 0}
  .od-tl li.ln[data-on="true"]{background:var(--ui-accent)}
  .od-tl .t{align-items:center;padding-top:8px}
  .od-tl .t b{white-space:nowrap}
  .od-tl .t em{display:none}
  .od-nowstep{display:flex}
}
.od-card{padding:18px 20px;margin-bottom:14px}
.od-card h2{margin:0 0 12px;font-size:.875rem;font-weight:600;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.od-card h2 span{font-size:.75rem;color:var(--ui-muted);font-weight:400}
.od-next{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.od-next .ic{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.od-next b{display:block;font-size:.9375rem;font-weight:600}
.od-next small{display:block;font-size:.75rem;color:var(--ui-muted);margin-top:1px}
.od-kv{display:grid;grid-template-columns:88px 1fr;gap:8px 16px;font-size:.875rem;margin:0}
.od-kv dt{color:var(--ui-muted)}.od-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.od-item{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--ui-line-soft);align-items:center}
.od-item:first-of-type{border-top:0;padding-top:0}
.od-th{width:48px;height:60px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-line-soft);overflow:hidden;position:relative;flex-shrink:0;display:grid;place-items:center;color:#d4d4d8}
.od-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.od-it-n{font-size:.875rem;font-weight:500;line-height:1.4}
.od-it-v{font-size:.75rem;color:var(--ui-muted)}
.od-tot{margin-top:10px;padding-top:12px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:6px;font-size:.875rem}
.od-tot .r{display:flex;justify-content:space-between;gap:12px;color:#52525b}
.od-tot .g{display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;margin-top:2px;border-top:1px solid var(--ui-line);color:var(--ui-ink);font-weight:600}
.od-tot .g span:last-child{font-size:1.25rem}
.od-note{font-size:.8125rem;color:#52525b;line-height:1.7;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line)}
.od-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875rem;line-height:1.9;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line);white-space:pre-wrap;overflow-wrap:anywhere}
.od-warn{padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:.8125rem;line-height:1.6;margin-bottom:12px}
.od-err{padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:.8125rem;line-height:1.6;margin-bottom:14px}
.od-contact{font-size:.875rem;line-height:1.8;white-space:pre-wrap}
.od-pay{display:flex;flex-direction:column;gap:12px}
.od-report{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
@keyframes od-ping{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(1.7);opacity:0}}
@keyframes od-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (max-width:640px){.od-kv{grid-template-columns:72px 1fr}.od-status{padding:16px}}
@media (prefers-reduced-motion:reduce){.od-tl li,.od-tl .ic::after{animation:none}}
`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { order_no } = await params;
  return { title: `訂單 ${order_no}`, robots: { index: false } };
}

/**
 * 訂單頁(2026-10-23 改版,照 Phase 24 原型):狀態橫幅 → 進度 → 下一步(匯款 / LINE Pay / 綠界)→ 訂單資訊 →
 * 商品明細 → 寄送資訊 → 聯絡賣家。存取碼、遮蔽、回報後 5 碼等規則跟改版前相同。
 */
export default async function OrderPage({ params, searchParams }: Props) {
  const { slug, order_no } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const linePayState = sp?.linepay ?? null;
  const ecpayState = sp?.ecpay ?? null;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const order = await getOrder(tenant.id, order_no);
  if (!order) notFound();

  // Phase 22:存取碼對得上才是「本人開的連結」;單號是連號的,沒這層任何人改個數字就能翻別人的地址電話
  const unlocked = !!order.access_key && (sp?.k ?? '') === order.access_key;
  const lockedNotice = (
    <div className="od-warn">
      為保護個資,這個網址只能看訂單狀態。完整資訊、付款與回報功能請從 LINE 通知或下單完成頁的連結開啟;沒有連結的話可到
      <a href={`/${slug}/order-lookup`} style={{ color: '#92400e', fontWeight: 600, margin: '0 2px' }}>查我的訂單</a>
      用電話或 Email 驗證後進入。
    </div>
  );
  const lockedHint = <div className="od-warn" style={{ marginBottom: 0 }}>請從 LINE 通知或下單完成頁的連結開啟這張訂單,才能進行付款或回報。</div>;

  // 額外拉 tenant.contact_info + payment_info + bank_transfer + shipping_rules(沒在 getTenantPublic)
  const { data: tenantExtra } = await supabaseAdmin
    .from('tenants')
    .select('contact_info, payment_info, bank_transfer, shipping_rules, qr_payment, cod_payment')
    .eq('id', tenant.id)
    .maybeSingle();
  type ExtraRow = {
    contact_info: string | null;
    payment_info: string | null;
    bank_transfer: unknown;
    shipping_rules: { options?: { key: string; label: string }[] } | null;
    qr_payment: { enabled?: boolean; image_url?: string; label?: string; note?: string; link_url?: string } | null;
    cod_payment: unknown; // Phase 36:取貨付款的說明文字
  } | null;
  const codCfg = codPaymentFromRow((tenantExtra as ExtraRow)?.cod_payment);
  const contactInfo = (tenantExtra as ExtraRow)?.contact_info ?? null;
  const paymentInfo = (tenantExtra as ExtraRow)?.payment_info ?? null;
  // Phase 28:分欄的匯款資訊;沒填就退回舊的 payment_info 文字
  const bank = bankTransferFromRow((tenantExtra as ExtraRow)?.bank_transfer);
  const hasBankInfo = !!bank || !!paymentInfo;
  // Phase 27:掃碼付款設定(訂單已經選了 qr 就算攤主後來關掉也要顯示 QR,不然客人付不了)
  const qrRaw = (tenantExtra as ExtraRow)?.qr_payment ?? null;
  const qrCfg = qrRaw?.image_url
    ? { image_url: qrRaw.image_url, label: (qrRaw.label ?? '').trim() || '掃碼付款', note: (qrRaw.note ?? '').trim() || null, link_url: (qrRaw.link_url ?? '').trim() || null }
    : null;
  const bankAccount = bank?.account ?? extractBankAccount(paymentInfo);
  const shipLabel = ((tenantExtra as ExtraRow)?.shipping_rules?.options ?? []).find((o) => o.key === order.shipping_method)?.label ?? null;
  const grandTotal = orderPayable(order); // Phase 33:商品小計 − 折扣 + 運費

  const createdAt = new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  // 自取訂單沒有「出貨/送達」,文案改「備貨/取貨」(DB 狀態共用 shipped/delivered)
  const isPickup = order.shipping_method === 'pickup';
  // Phase 29:超商店到店
  const cvs = isCvsChain(order.cvs_type) ? order.cvs_type : null;
  const isLinePayOrder = order.payment_method === 'line_pay';
  const isEcpayAtm = order.payment_method === 'ecpay_atm';
  const isEcpayCredit = order.payment_method === 'ecpay_credit';
  const isOnlinePayOrder = isLinePayOrder || isEcpayAtm || isEcpayCredit;
  // Phase 27:掃碼付款 — 人工核帳,流程同匯款,但回報的是「我已付款」而不是後 5 碼
  const isQrOrder = order.payment_method === 'qr';
  // Phase 36(2026-11-08):超商取貨付款 — 到店才付,沒有「付款 / 回報 / 核帳」那幾步;寄出 → 到店取貨付款 → 完成
  const isCodOrder = order.payment_method === 'cod';
  const atmExpired = !!order.atm_expire_at && new Date(order.atm_expire_at).getTime() < Date.now();
  const atmReady = isEcpayAtm && !!order.atm_vaccount && !atmExpired;
  const atmExpireLabel = order.atm_expire_at
    ? new Date(order.atm_expire_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const ecpayPayUrl = (m: 'atm' | 'credit') =>
    `/api/ecpay/pay?slug=${encodeURIComponent(slug)}&orderNo=${encodeURIComponent(order.order_no)}&method=${m}&k=${encodeURIComponent(order.access_key ?? '')}`;
  const stage =
    order.status === 'delivered' ? 4
    : order.status === 'shipped' ? 3
    : order.payment_status === 'paid' ? 2
    : order.payment_reported_at ? 1
    : 0;

  // 狀態語意色跟品牌色分開:待付款琥珀、已收款綠、已出貨藍、取消灰
  const tone = {
    amber: { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', ic: '#fef3c7' },
    green: { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534', ic: '#dcfce7' },
    blue: { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8', ic: '#dbeafe' },
    gray: { bg: '#f4f4f5', bd: '#e4e4e7', fg: '#52525b', ic: '#e4e4e7' },
  };
  const banner = isCancelled
    ? {
        icon: order.status === 'cancelled' ? <IconX size={20} /> : <IconUndo size={20} />,
        title: order.status === 'cancelled' ? '訂單已取消' : '訂單已退款',
        desc: order.status === 'cancelled' ? '如有疑問請聯絡賣家' : '退款會依原付款方式退回,入帳時間依銀行而定',
        ...tone.gray,
      }
    : isCodOrder && stage < 3
      ? {
          icon: <IconPackage size={20} />,
          title: '訂單成立,賣家備貨中',
          desc: `寄出後會通知您,到店取貨時付款 NT$ ${money(orderPayable(order))},不用先匯款`,
          ...tone.amber,
        }
    : stage === 0
      ? {
          icon: <IconClock size={20} />,
          title: isLinePayOrder
            ? '訂單成立,請完成 LINE Pay 付款'
            : isEcpayCredit
              ? '訂單成立,請完成信用卡付款'
              : isEcpayAtm
                ? (atmReady ? '訂單成立,請在期限內完成 ATM 轉帳' : '訂單成立,請取得 ATM 轉帳帳號')
                : isQrOrder
                  ? '訂單成立,請掃碼付款後回報'
                  : '訂單成立,請匯款後回報後 5 碼',
          desc: isLinePayOrder || isEcpayCredit ? '請在 24 小時內完成付款,逾期訂單會自動取消' : isEcpayAtm ? '請在繳費期限內轉帳,系統會自動確認' : '3 天內未付款訂單會自動取消',
          ...tone.amber,
        }
      : stage === 1
        ? { icon: <IconClock size={20} />, title: isQrOrder ? '已回報付款,等待賣家核帳' : '已回報後 5 碼,等待賣家核帳', desc: '賣家核帳後會轉為已付款', ...tone.amber }
        : stage === 2
          ? { icon: <IconCheckCircle size={20} />, title: '已收款,商品準備中', desc: isPickup ? '備貨完成會通知您取貨' : '出貨後會再通知您', ...tone.green }
          : stage === 3
            ? {
                icon: isPickup ? <IconPackage size={20} /> : <IconTruck size={20} />,
                title: isPickup ? '已備貨,歡迎取貨' : cvs ? '已寄出,請等超商到店通知' : '已出貨',
                desc: isPickup ? '請於營業時間至門市取貨' : cvs ? `到店後 ${CVS_CHAINS[cvs].short} 會發簡訊通知,請憑姓名和手機取件${isCodOrder ? `,取貨時付款 NT$ ${money(grandTotal)}` : ''}` : '請留意物流通知',
                ...tone.blue,
              }
            : { icon: <IconCheckCircle size={20} />, title: isPickup ? '已取貨,感謝您的訂購' : '已送達,感謝您的訂購', desc: '有任何問題歡迎聯絡我們', ...tone.green };
  // 2026-11-05(Peter 選的直式時間軸):每一步有時間和一句說明,現在這步會呼吸。
  // 線上付款(LINE Pay / 刷卡 / ATM)沒有「回報」那步,四步;匯款 / 掃碼要回報再核帳,五步。
  const fmtT = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
  const isPaid = order.payment_status === 'paid';
  const reported = !!order.payment_reported_at;
  const isShipped = order.status === 'shipped' || order.status === 'delivered';
  const isDelivered = order.status === 'delivered';
  const payName = isLinePayOrder ? 'LINE Pay' : isEcpayCredit ? '信用卡' : 'ATM 轉帳';
  type TlStep = { key: string; done: boolean; title: string; time: string | null; hint: string | null; desc: string | null };
  const timeline: TlStep[] = [
    { key: 'placed', done: true, title: '下單完成', time: fmtT(order.created_at), hint: null, desc: null },
    // Phase 36:取貨付款沒有付款 / 回報 / 核帳那幾步,直接到「寄出」
    ...(isCodOrder
      ? []
      : isOnlinePayOrder
      ? [{ key: 'paid', done: isPaid, title: isPaid ? `${payName}付款完成` : `${payName}付款`, time: isPaid ? fmtT(order.paid_at) : null, hint: '等待您完成付款', desc: null }]
      : [
          // 客人沒回報、賣家直接核帳的單,「回報」那步沒有自己的時間,整步省略
          ...(reported || !isPaid
            ? [{
                key: 'reported',
                done: reported,
                title: isQrOrder ? (reported ? '已回報付款' : '掃碼付款後回報') : (reported ? '已回報匯款後五碼' : '匯款後回報後五碼'),
                time: reported ? fmtT(order.payment_reported_at) : null,
                hint: '等待您付款並回報',
                desc: null,
              }]
            : []),
          { key: 'paid', done: isPaid, title: isPaid ? '賣家已收款' : '賣家核帳', time: isPaid ? fmtT(order.paid_at) : null, hint: '賣家核對中,通常一個工作天內', desc: null },
        ]),
    // Phase 35(2026-11-07):團購單在「收款」與「出貨」之間多一步「等待團購到貨」,團 arrived / done 後打勾
    ...(order.groupBuy
      ? (() => {
          const gb = order.groupBuy;
          const arrived = gb.status === 'arrived' || gb.status === 'done';
          return [{
            key: 'groupbuy',
            done: arrived,
            title: arrived ? '團購商品已到貨' : '等待團購到貨',
            time: arrived ? fmtT(gb.arrived_at) : null,
            hint: `${fmtArrivalPhrase(gb.expected_arrival_on)},到貨後一起出`,
            desc: gb.name,
          }];
        })()
      : []),
    {
      key: 'shipped',
      done: isShipped,
      title: isShipped ? (isPickup ? '已備貨,可以取貨' : cvs ? `已寄出 · ${CVS_CHAINS[cvs].label}` : '已出貨') : isPickup ? '備貨' : '出貨',
      time: isShipped ? fmtT(order.shipped_at) : null,
      hint: isPickup ? '賣家備貨中' : '賣家準備出貨中',
      desc: isShipped && unlocked
        ? [
            order.tracking_no ? `寄件單號 ${order.tracking_no}` : null,
            // 「送達 / 取貨」那步拿掉了(見下),怎麼取件寫在出貨這步
            isPickup ? '請於營業時間至門市取貨'
              : cvs && !isCodOrder ? `到店後會收到超商簡訊,憑姓名和手機到${order.cvs_store_name ? ` ${order.cvs_store_name} ` : '門市'}取件`
              : cvs ? '到店後會收到超商簡訊'
              : '請留意物流通知',
          ].filter(Boolean).join(',') || null
        : null,
    },
    // 2026-11-09(Peter 決定):宅配 / 自取 / 店到店系統不會知道客人何時收到或取走,後台也沒有「已送達」按鈕,
    // 「送達 / 取貨」那步會永遠停在運送中、看起來像卡住 → 不顯示,出貨(備貨)就是最後一步。
    // 取貨付款例外:超商撥款後賣家按「確認收款」會變已取貨,留「到店取貨付款 → 完成」兩步。
    ...(isCodOrder
      ? [
          {
            key: 'done',
            done: isDelivered,
            title: isDelivered ? '已取貨付款' : '到店取貨付款',
            time: isDelivered ? fmtT(order.paid_at) : null,
            hint: `到店後付 NT$ ${money(grandTotal)},憑姓名和手機取件`,
            desc: !isDelivered && isShipped && unlocked ? `憑姓名和手機到${order.cvs_store_name ? ` ${order.cvs_store_name} ` : '門市'}取件` : null,
          },
          // Phase 36:取貨付款最後一步「完成」— 賣家確認收到超商撥款
          { key: 'cod_done', done: isDelivered, title: '完成', time: null, hint: '賣家確認收到超商撥款後完成', desc: null },
        ]
      : []),
  ];
  const currentIdx = timeline.findIndex((s) => !s.done);
  // 全部完成(例如宅配已出貨)就把最後一步當「現在這一步」,電腦版底下的框顯示寄件單號等資訊
  const nowIdx = currentIdx >= 0 ? currentIdx : timeline.length - 1;
  const nowStep = timeline[nowIdx];
  const statusShort = isPickup && order.status === 'shipped' ? '已備貨' : isPickup && order.status === 'delivered' ? '已取貨' : isCodOrder && order.status === 'open' ? '待出貨' : isCodOrder && order.status === 'shipped' ? '已寄出' : order.status === 'open' && order.payment_status === 'pending' ? '待付款' : (STATUS_LABEL[order.status] ?? order.status);
  const paymentText = `${METHOD_LABEL[order.payment_method ?? 'bank'] ?? '匯款'} · ${order.payment_status === 'pending' && isCodOrder ? '到店付款' : order.payment_status === 'pending' && isOnlinePayOrder ? '等待付款' : (PAYMENT_LABEL[order.payment_status] ?? order.payment_status)}`;
  const giftCount = order.items.filter((i) => i.price_at_purchase === 0).length;

  return (
    <div className="od ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---------- 狀態橫幅 ---------- */}
      <div className="od-status" style={{ background: banner.bg, borderColor: banner.bd, color: banner.fg }}>
        <span className="ic" style={{ background: banner.ic }}>{banner.icon}</span>
        <div style={{ minWidth: 0 }}>
          <h1>{banner.title}</h1>
          <p>{banner.desc}</p>
          <div className="no"><em>訂單編號</em> <strong className="ui-num">{order.order_no}</strong><CopyButton text={order.order_no} /></div>
        </div>
      </div>

      {/* ---------- 進度(取消/退款不顯示) ---------- */}
      {!isCancelled && (
        <Card className="od-card">
          <h2>訂單進度</h2>
          <ol className="od-tl" aria-label="訂單進度">
            {timeline.map((s, i) => {
              const state = s.done ? 'done' : i === currentIdx ? 'current' : 'pending';
              const lineOn = s.done && !!timeline[i + 1]?.done;
              return (
                <Fragment key={s.key}>
                  <li className="s" data-state={state} data-line={lineOn ? 'true' : 'false'} aria-current={state === 'current' ? 'step' : undefined}>
                    <span className="ic">{s.done ? <IconCheck size={13} /> : i + 1}</span>
                    <div className="t">
                      <b>{s.title}</b>
                      {s.time ? <small>{s.time}</small> : state === 'current' && s.hint ? <small>{s.hint}</small> : null}
                      {s.desc && <em>{s.desc}</em>}
                    </div>
                  </li>
                  {/* 電腦版橫式的連接線;手機直式用 li.s::before 畫,這個藏起來 */}
                  {i < timeline.length - 1 && <li className="ln" role="presentation" aria-hidden="true" data-on={lineOn ? 'true' : 'false'} />}
                </Fragment>
              );
            })}
          </ol>
          {/* 電腦版:現在這一步(全部完成就是最後一步)的說明集中在這裡;手機版說明直接在各步底下 */}
          {nowStep && (() => {
            const parts = [nowStep.done ? nowStep.time : nowStep.hint, nowStep.desc].filter(Boolean);
            return (
              <div className="od-nowstep">
                <span className="ic" data-state={nowStep.done ? 'done' : 'current'}>{nowStep.done ? <IconCheck size={14} /> : nowIdx + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{nowStep.title}</b>
                  {parts.length > 0 && <small>{parts.join(' · ')}</small>}
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {!unlocked && !isCancelled && lockedNotice}

      {/* 逾期自動取消後客人才按付款 → 告知沒有收費 */}
      {(linePayState === 'cancelled_order' || ecpayState === 'cancelled_order') && (
        <div className="od-err">這筆訂單已經取消,<strong>沒有向您收取任何費用</strong>。需要的話請重新下單,謝謝。</div>
      )}

      {/* ---------- 下一步:LINE Pay ---------- */}
      {isLinePayOrder && order.payment_status !== 'paid' && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: '#dcfce7', color: '#16a34a' }}><IconWallet size={17} /></span>
            <div><b>下一步:LINE Pay 付款</b><small>付款完成後訂單會自動更新,不需回報帳號後 5 碼</small></div>
          </div>
          {(linePayState === 'cancel' || linePayState === 'failed') && (
            <div className="od-warn">{linePayState === 'cancel' ? '您取消了這次付款,訂單仍然保留,可以再付一次。' : '付款沒有完成,款項未被扣除,請再試一次或聯絡我們。'}</div>
          )}
          {unlocked ? (
            <form action={startLinePayAndRedirect}>
              <input type="hidden" name="tenant_slug" value={slug} />
              <input type="hidden" name="order_no" value={order.order_no} />
              <input type="hidden" name="k" value={order.access_key ?? ''} />
              <Button type="submit" size="lg" className="ui-num" style={{ width: '100%', background: '#06c755', color: '#fff' }}>用 LINE Pay 付款 · NT$ {money(grandTotal)}</Button>
            </form>
          ) : lockedHint}
        </Card>
      )}

      {/* ---------- 下一步:綠界(信用卡 / ATM) ---------- */}
      {(isEcpayAtm || isEcpayCredit) && order.payment_status !== 'paid' && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: isEcpayAtm ? '#ccfbf1' : '#dbeafe', color: isEcpayAtm ? '#0f766e' : '#1d4ed8' }}>
              {isEcpayAtm ? <IconBank size={17} /> : <IconCreditCard size={17} />}
            </span>
            <div>
              <b>{isEcpayAtm ? (atmReady ? '下一步:ATM 轉帳' : '下一步:取得轉帳帳號') : '下一步:信用卡付款'}</b>
              <small>付款完成後訂單會自動更新,不需回報帳號後 5 碼</small>
            </div>
          </div>
          {(ecpayState === 'failed' || (isEcpayAtm && atmExpired)) && (
            <div className="od-warn">{ecpayState === 'failed' ? '付款沒有完成,款項未被扣除,請再試一次或聯絡我們。' : `這組轉帳帳號已過期(期限 ${atmExpireLabel}),請重新取得一組新帳號。`}</div>
          )}
          {!unlocked ? lockedHint : atmReady ? (
            <div className="od-pay">
              <div className="od-mono">{`銀行代碼:${order.atm_bank_code}\n轉帳帳號:${order.atm_vaccount}\n轉帳金額:NT$ ${money(grandTotal)}\n繳費期限:${atmExpireLabel}`}</div>
              <CopyButton big text={order.atm_vaccount ?? ''} label={`複製帳號 ${order.atm_vaccount}`} />
              <p className="ui-muted" style={{ margin: 0, fontSize: '.8125rem', lineHeight: 1.6 }}>這組帳號只能用在這筆訂單,金額要完全一樣。轉帳後系統會自動確認,不用回報。</p>
              <p className="ui-muted" style={{ margin: 0, fontSize: '.8125rem', textAlign: 'center' }}>改用 <a href={ecpayPayUrl('credit')} style={{ color: 'var(--ui-ink)' }}>信用卡付款</a></p>
            </div>
          ) : (
            <div className="od-pay">
              <ButtonLink href={ecpayPayUrl(isEcpayAtm ? 'atm' : 'credit')} variant="primary" size="lg" className="ui-num" style={{ width: '100%' }}>
                {isEcpayAtm ? '取得 ATM 轉帳帳號' : `用信用卡付款 · NT$ ${money(grandTotal)}`}
              </ButtonLink>
              {/* ATM 單可以改刷卡;信用卡單不提供改 ATM(ATM 選項 2026-10-22 起預設關) */}
              {isEcpayAtm && <p className="ui-muted" style={{ margin: 0, fontSize: '.8125rem', textAlign: 'center' }}>改用 <a href={ecpayPayUrl('credit')} style={{ color: 'var(--ui-ink)' }}>信用卡付款</a></p>}
            </div>
          )}
        </Card>
      )}

      {/* ---------- 下一步:掃碼付款(Phase 27)---------- */}
      {isQrOrder && stage <= 1 && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: '#fef3c7', color: '#b45309' }}><IconWallet size={17} /></span>
            <div><b>下一步:掃碼付款</b><small>{qrCfg ? `用 ${qrCfg.label} 掃碼付款,付完按「我已付款」,賣家核帳後出貨` : '賣家會主動聯繫您付款方式'}</small></div>
          </div>
          {!unlocked ? lockedHint : (
            <div className="od-pay">
              {qrCfg && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid var(--ui-line)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCfg.image_url} alt={`${qrCfg.label} 收款 QR`} style={{ width: 'min(240px, 70vw)', height: 'auto', borderRadius: 8, background: '#fff', display: 'block' }} />
                  <div className="ui-num" style={{ fontSize: '.9375rem' }}>應付 <strong style={{ fontSize: '1.25rem' }}>NT$ {money(grandTotal)}</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.8125rem' }}><em style={{ fontStyle: 'normal', whiteSpace: 'nowrap' }}>訂單編號</em> <strong className="ui-num">{order.order_no}</strong><CopyButton text={order.order_no} /></div>
                  {qrCfg.link_url && <ButtonLink href={qrCfg.link_url} target="_blank" rel="noreferrer" variant="primary" size="md" style={{ width: '100%' }}>開啟 {qrCfg.label}</ButtonLink>}
                  <p className="ui-muted" style={{ margin: 0, fontSize: '.7813rem', lineHeight: 1.6, textAlign: 'center' }}>
                    {qrCfg.note ?? '金額請自行輸入,轉帳備註填訂單編號。'}
                    <br />
                    手機掃不到自己的螢幕:長按 QR 儲存圖片,再到 App 用「掃描相簿圖片」讀取。
                  </p>
                </div>
              )}
              {order.payment_reported_at ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.875rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#16a34a', display: 'inline-flex' }}><IconCheck size={16} /></span>
                    <span style={{ fontWeight: 500 }}>已回報付款</span>
                    <span className="ui-muted" style={{ fontSize: '.75rem' }}>
                      {new Date(order.payment_reported_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 送出 · 等待賣家核帳
                    </span>
                    {order.payment_note && <span className="ui-muted" style={{ fontSize: '.8125rem', width: '100%' }}>備註:{order.payment_note}</span>}
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary className="ui-muted" style={{ fontSize: '.8125rem', cursor: 'pointer' }}>要補充備註?重新回報</summary>
                    <form id="report" action={reportQrPaid} className="od-report" style={{ marginTop: 10 }}>
                      <input type="hidden" name="tenant_slug" value={slug} />
                      <input type="hidden" name="order_no" value={order.order_no} />
                      <input type="hidden" name="k" value={order.access_key ?? ''} />
                      <input name="note" className="ui-input" maxLength={100} placeholder="例:LINE Pay 轉帳 14:32,暱稱小明" style={{ flex: '1 1 200px' }} />
                      <Button type="submit" variant="outline" size="md">更新</Button>
                    </form>
                  </details>
                </div>
              ) : (
                <div id="report" style={{ scrollMarginTop: 80 }}>
                  <div style={{ fontSize: '.8125rem', fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><IconPencil size={14} /> 付完款按這裡回報</div>
                  <form action={reportQrPaid} className="od-report">
                    <input type="hidden" name="tenant_slug" value={slug} />
                    <input type="hidden" name="order_no" value={order.order_no} />
                    <input type="hidden" name="k" value={order.access_key ?? ''} />
                    <input name="note" className="ui-input" maxLength={100} placeholder="備註(選填):轉帳時間、暱稱或後幾碼" style={{ flex: '1 1 200px' }} />
                    <Button type="submit" variant="primary" size="lg" style={{ flex: '1 0 auto' }}>我已付款</Button>
                  </form>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ---------- 到店付款(Phase 36):取貨付款的單不顯示匯款與回報,只講到店付多少、在哪個門市 ---------- */}
      {isCodOrder && !isPaid && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: '#fef3c7', color: '#b45309' }}><IconStore size={17} /></span>
            <div>
              <b>到店取貨時付款 NT$ {money(grandTotal)}</b>
              <small>{isShipped ? '包裹到店後超商會發簡訊,憑姓名和手機取件並付款' : '賣家寄出後會通知您;不用先匯款'}</small>
            </div>
          </div>
          <div className="od-pay">
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '8px 12px', fontSize: '.875rem', alignItems: 'center' }}>
              <span className="ui-muted" style={{ fontSize: '.8125rem' }}>金額</span>
              <span className="ui-num" style={{ fontSize: '1.1875rem', fontWeight: 600 }}>NT$ {money(grandTotal)}</span>
              {cvs && (
                <>
                  <span className="ui-muted" style={{ fontSize: '.8125rem' }}>門市</span>
                  <span style={{ fontWeight: 500 }}>
                    {CVS_CHAINS[cvs].short} {order.cvs_store_name}
                    {order.cvs_store_id && <span className="ui-muted ui-num" style={{ marginLeft: 6, fontSize: '.8125rem' }}>店號 {order.cvs_store_id}</span>}
                  </span>
                </>
              )}
            </div>
            <p className="ui-muted" style={{ margin: 0, fontSize: '.8125rem', lineHeight: 1.6 }}>{codCfg?.note ?? '包裹到店後請在 7 天內領取,逾期會被退回。'}</p>
          </div>
        </Card>
      )}

      {/* ---------- 下一步:匯款 + 回報後 5 碼 ---------- */}
      {!isOnlinePayOrder && !isQrOrder && !isCodOrder && stage <= 1 && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: '#fef3c7', color: '#b45309' }}><IconBank size={17} /></span>
            <div><b>{hasBankInfo ? '下一步:匯款' : '下一步:等候匯款資訊'}</b><small>{hasBankInfo ? '匯款後填帳號後 5 碼,賣家核帳後轉已付款' : '賣家會主動私訊您匯款方式'}</small></div>
          </div>
          {!unlocked ? lockedHint : (
            <div className="od-pay">
              {bank ? (
                <>
                  {/* Phase 28:分欄顯示,帳號單獨一行好對、好複製 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '8px 12px', fontSize: '.875rem', alignItems: 'center' }}>
                    {bankDisplayName(bank) && (
                      <>
                        <span className="ui-muted" style={{ fontSize: '.8125rem' }}>銀行</span>
                        <span style={{ fontWeight: 500 }}>{bankDisplayName(bank)}</span>
                      </>
                    )}
                    <span className="ui-muted" style={{ fontSize: '.8125rem' }}>帳號</span>
                    <span className="ui-num" style={{ fontSize: '1.1875rem', fontWeight: 600, letterSpacing: '.04em' }}>{bank.account}</span>
                    {bank.holder && (
                      <>
                        <span className="ui-muted" style={{ fontSize: '.8125rem' }}>戶名</span>
                        <span style={{ fontWeight: 500 }}>{bank.holder}</span>
                      </>
                    )}
                  </div>
                  {bank.note && <p className="ui-muted" style={{ margin: 0, fontSize: '.8125rem', lineHeight: 1.6 }}>{bank.note}</p>}
                  <CopyButton big text={bank.account} label={`複製帳號 ${bank.account}`} />
                </>
              ) : paymentInfo ? (
                <>
                  <div className="od-mono">{paymentInfo}</div>
                  {bankAccount && <CopyButton big text={bankAccount} label={`複製帳號 ${bankAccount}`} />}
                </>
              ) : (
                <p className="ui-muted" style={{ margin: 0, fontSize: '.875rem', lineHeight: 1.6 }}>請保留此訂單編號,完成匯款後通知賣家對帳。</p>
              )}
              {order.payment_reported_at ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.875rem' }}>
                    <span style={{ color: '#16a34a', display: 'inline-flex' }}><IconCheck size={16} /></span>
                    <span style={{ fontWeight: 500 }}>已回報後 5 碼</span>
                    <span className="ui-muted" style={{ fontSize: '.75rem' }}>
                      {new Date(order.payment_reported_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 送出
                    </span>
                    <span className="ui-num" style={{ marginLeft: 'auto', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '.2em', color: '#15803d' }}>{order.payment_last5}</span>
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary className="ui-muted" style={{ fontSize: '.8125rem', cursor: 'pointer' }}>填錯了?重新回報</summary>
                    <form id="report" action={reportPaymentLast5} className="od-report" style={{ marginTop: 10 }}>
                      <input type="hidden" name="tenant_slug" value={slug} />
                      <input type="hidden" name="order_no" value={order.order_no} />
                      <input type="hidden" name="k" value={order.access_key ?? ''} />
                      <OtpInput name="last5" required boxSize={38} />
                      <Button type="submit" variant="outline" size="md">更新</Button>
                    </form>
                  </details>
                </div>
              ) : (
                <div id="report" style={{ scrollMarginTop: 80 }}>
                  <div style={{ fontSize: '.8125rem', fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><IconPencil size={14} /> 匯款後填帳號後 5 碼</div>
                  <form action={reportPaymentLast5} className="od-report">
                    <input type="hidden" name="tenant_slug" value={slug} />
                    <input type="hidden" name="order_no" value={order.order_no} />
                    <input type="hidden" name="k" value={order.access_key ?? ''} />
                    <OtpInput name="last5" required />
                    <Button type="submit" variant="primary" size="lg" style={{ flex: '1 0 auto' }}>送出回報</Button>
                  </form>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {!isOnlinePayOrder && !isCancelled && order.payment_status === 'paid' && (
        <Card className="od-card" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#166534', fontWeight: 600, fontSize: '.875rem' }}>
          <IconCheckCircle size={18} /> 已收到您的款項,無需再回報。
        </Card>
      )}

      {/* ---------- 訂單資訊 ---------- */}
      <Card className="od-card">
        <h2>訂單資訊 <span className="ui-num">{createdAt} 成立</span></h2>
        <dl className="od-kv">
          <dt>訂單編號</dt><dd className="ui-num" style={{ fontWeight: 600 }}>{order.order_no}</dd>
          <dt>狀態</dt><dd><Badge style={{ borderColor: banner.bd, color: banner.fg, background: banner.bg }}>{statusShort}</Badge></dd>
          <dt>付款</dt><dd>{paymentText}</dd>
          <dt>配送</dt><dd>{shipLabel ?? (isPickup ? '門市自取' : order.shipping_method ? order.shipping_method : '—')}</dd>
          {/* Phase 35:團購單標明哪一團 */}
          {order.groupBuy && (<><dt>團購</dt><dd>{order.groupBuy.name}</dd></>)}
          {order.tracking_no && (
            <>
              <dt>寄件單號</dt>
              <dd className="ui-num" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{order.tracking_no}</span>
                {cvs && (
                  <a href={CVS_CHAINS[cvs].trackUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.8125rem', color: 'var(--ui-accent-ink)', fontWeight: 500 }}>
                    到 {CVS_CHAINS[cvs].short} 查件
                  </a>
                )}
              </dd>
            </>
          )}
        </dl>
      </Card>

      {/* ---------- 商品明細 ---------- */}
      <Card className="od-card">
        <h2>商品明細 <span className="ui-num">{order.items.reduce((s, i) => s + i.qty, 0)} 件</span></h2>
        {order.items.map((item, idx) => (
          <div key={idx} className="od-item">
            <div className="od-th">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" />
              ) : (
                <IconPackage size={18} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="od-it-n">
                {item.product_name}
                {item.price_at_purchase === 0 && giftCount > 0 && <Badge style={{ marginLeft: 6, fontSize: '.6875rem', padding: '1px 8px' }}>滿額贈</Badge>}
                {item.is_groupbuy && <Badge style={{ marginLeft: 6, fontSize: '.6875rem', padding: '1px 8px', borderColor: '#bbf7d0', color: '#15803d', background: '#f0fdf4' }}>團購</Badge>}
              </div>
              <div className="od-it-v ui-num">{item.variant_name ? `${item.variant_name} · ` : ''}NT$ {money(item.price_at_purchase)} × {item.qty}</div>
            </div>
            <span className="ui-num" style={{ fontWeight: 600, fontSize: '.875rem', color: item.subtotal_twd === 0 ? '#15803d' : undefined }}>NT$ {money(item.subtotal_twd)}</span>
          </div>
        ))}
        <div className="od-tot">
          {(order.shipping_fee_twd > 0 || order.shipping_method || order.discount_twd > 0) && (
            <>
              <div className="r"><span>商品小計</span><span className="ui-num" style={{ color: 'var(--ui-ink)' }}>NT$ {money(order.total_twd)}</span></div>
              {/* Phase 33:折扣碼只折商品小計 */}
              {order.discount_twd > 0 && (
                <div className="r"><span>折扣碼 {order.discount_code}</span><span className="ui-num" style={{ color: '#15803d' }}>−NT$ {money(order.discount_twd)}</span></div>
              )}
              <div className="r">
                <span>運費{shipLabel ? `(${shipLabel})` : ''}</span>
                <span className="ui-num" style={{ color: order.shipping_fee_twd === 0 ? '#15803d' : 'var(--ui-ink)' }}>{order.shipping_fee_twd === 0 ? '免運' : `NT$ ${money(order.shipping_fee_twd)}`}</span>
              </div>
            </>
          )}
          <div className="g"><span>應付總額</span><span className="ui-num">NT$ {money(grandTotal)}</span></div>
        </div>
      </Card>

      {/* ---------- 寄送資訊 ---------- */}
      <Card className="od-card">
        <h2>{cvs ? '取貨資訊' : '寄送資訊'} {!unlocked && <span style={{ color: '#b45309' }}>部分遮蔽</span>}</h2>
        <dl className="od-kv">
          <dt>{cvs ? '取件人' : '收件人'}</dt><dd>{unlocked ? order.shipping_recipient : maskName(order.shipping_recipient)}</dd>
          <dt>電話</dt><dd className="ui-num">{unlocked ? order.shipping_phone : maskPhone(order.shipping_phone)}</dd>
          {cvs ? (
            <>
              <dt>取貨門市</dt>
              <dd>
                {CVS_CHAINS[cvs].short} {order.cvs_store_name}
                {order.cvs_store_id && <span className="ui-muted ui-num" style={{ marginLeft: 6, fontSize: '.8125rem' }}>店號 {order.cvs_store_id}</span>}
              </dd>
            </>
          ) : (
            <>
              <dt>地址</dt><dd>{unlocked ? order.shipping_address : maskAddress(order.shipping_address)}</dd>
            </>
          )}
          {order.guest_email && (<><dt>Email</dt><dd>{unlocked ? order.guest_email : maskEmail(order.guest_email)}</dd></>)}
          {unlocked && order.invoice_tax_id && (<><dt>統一編號</dt><dd className="ui-num">{order.invoice_tax_id}</dd></>)}
          {unlocked && order.invoice_title && (<><dt>發票抬頭</dt><dd>{order.invoice_title}</dd></>)}
          <dt>備註</dt><dd style={{ whiteSpace: 'pre-wrap', color: unlocked && order.note ? undefined : 'var(--ui-muted)' }}>{unlocked ? (order.note || '—') : '—'}</dd>
        </dl>
      </Card>

      {/* ---------- 聯絡賣家 ---------- */}
      {(contactInfo || unlocked) && (
        <Card className="od-card">
          {contactInfo && (
            <>
              <h2>聯絡賣家</h2>
              <div className="od-contact">{contactInfo}</div>
            </>
          )}
          {unlocked && (
            <p className="od-note" style={{ margin: contactInfo ? '12px 0 0' : 0 }}>這個頁面的網址帶有專屬存取碼,請勿轉傳給他人。遺失連結可到「查我的訂單」用電話驗證。</p>
          )}
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <ButtonLink href={`/${slug}`} variant="outline" size="md">繼續購物</ButtonLink>
      </div>
    </div>
  );
}
