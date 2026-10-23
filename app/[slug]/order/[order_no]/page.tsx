import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { CopyButton } from './copy-button';
import { reportPaymentLast5 } from './actions';
import { startLinePayAndRedirect } from '../../checkout/actions';
import { IconBank, IconCheck, IconCheckCircle, IconClock, IconCreditCard, IconPackage, IconPencil, IconTruck, IconUndo, IconWallet, IconX } from '@/lib/icons';
import { OtpInput } from '@/lib/otp-input';
import { Badge, Button, ButtonLink, Card } from '@/lib/ui';

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
  shipping_method: string | null;
  shipping_fee_twd: number;
  payment_last5: string | null;
  payment_reported_at: string | null;
  invoice_tax_id: string | null;
  invoice_title: string | null;
  shipping_recipient: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  note: string | null;
  guest_email: string | null;
  created_at: string;
  access_key: string | null; // Phase 22:訂單存取碼(網址 ?k=),對得上才看得到個資
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
      'id, order_no, status, payment_status, payment_method, atm_bank_code, atm_vaccount, atm_expire_at, total_twd, shipping_method, shipping_fee_twd, payment_last5, payment_reported_at, invoice_tax_id, invoice_title, shipping_recipient, shipping_phone, shipping_address, note, guest_email, created_at, access_key, order_items(qty, price_at_purchase, subtotal_twd, products(name, image_url, media), product_variants(variant_name, image_url))',
    )
    .eq('tenant_id', tenantId)
    .eq('order_no', orderNo)
    .maybeSingle();

  if (error || !data) return null;

  type Row = Omit<OrderDetail, 'items'> & {
    order_items: {
      qty: number;
      price_at_purchase: number;
      subtotal_twd: number;
      products: { name: string; image_url: string | null; media: { type: string; url: string }[] | null } | null;
      product_variants: { variant_name: string; image_url: string | null } | null;
    }[] | null;
  };
  const row = data as unknown as Row;
  const items: OrderItemRow[] = (row.order_items ?? []).map((i) => ({
    qty: i.qty,
    price_at_purchase: i.price_at_purchase,
    subtotal_twd: i.subtotal_twd,
    product_name: i.products?.name ?? '(已下架商品)',
    variant_name: i.product_variants?.variant_name ?? null,
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
    shipping_method: row.shipping_method ?? null,
    shipping_fee_twd: row.shipping_fee_twd ?? 0,
    payment_last5: row.payment_last5 ?? null,
    payment_reported_at: row.payment_reported_at ?? null,
    invoice_tax_id: row.invoice_tax_id ?? null,
    invoice_title: row.invoice_title ?? null,
    shipping_recipient: row.shipping_recipient,
    shipping_phone: row.shipping_phone,
    shipping_address: row.shipping_address,
    note: row.note,
    guest_email: row.guest_email,
    created_at: row.created_at,
    access_key: row.access_key ?? null,
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
};

const money = (n: number) => n.toLocaleString('en-US');

const CSS = `
.od{max-width:720px;margin:0 auto}
.od-status{padding:18px 20px;border-radius:10px;border:1px solid;display:flex;align-items:center;gap:14px;margin-bottom:20px}
.od-status .ic{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.od-status h1{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.od-status p{margin:4px 0 0;font-size:13px;opacity:.9;line-height:1.5}
.od-status .no{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:13px;flex-wrap:wrap}
.od-status .no em{font-style:normal;white-space:nowrap}
.od-steps{display:grid;grid-template-columns:repeat(5,1fr);margin:0 0 24px;position:relative}
.od-step{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px;color:var(--ui-faint);position:relative;text-align:center}
.od-step .dot{width:26px;height:26px;border-radius:50%;border:2px solid var(--ui-line);background:var(--ui-surface);display:grid;place-items:center;font-size:11px;font-weight:600;color:var(--ui-faint);z-index:1;box-sizing:border-box}
.od-step .line{position:absolute;top:12px;left:50%;right:-50%;height:2px;background:var(--ui-line)}
.od-step:last-child .line{display:none}
.od-step[data-done="true"]{color:var(--ui-ink)}
.od-step[data-done="true"] .dot{border-color:var(--ui-accent);background:var(--ui-accent);color:var(--ui-on-accent)}
.od-step[data-line="true"] .line{background:var(--ui-accent)}
.od-step[data-next="true"]{color:var(--ui-ink);font-weight:500}
.od-step[data-next="true"] .dot{border-color:var(--ui-accent);color:var(--ui-accent);animation:od-pulse 1.8s ease-in-out .9s infinite}
.od-card{padding:18px 20px;margin-bottom:14px}
.od-card h2{margin:0 0 12px;font-size:14px;font-weight:600;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.od-card h2 span{font-size:12px;color:var(--ui-muted);font-weight:400}
.od-next{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.od-next .ic{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.od-next b{display:block;font-size:15px;font-weight:600}
.od-next small{display:block;font-size:12px;color:var(--ui-muted);margin-top:1px}
.od-kv{display:grid;grid-template-columns:88px 1fr;gap:8px 16px;font-size:14px;margin:0}
.od-kv dt{color:var(--ui-muted)}.od-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.od-item{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--ui-line-soft);align-items:center}
.od-item:first-of-type{border-top:0;padding-top:0}
.od-th{width:48px;height:60px;border-radius:6px;border:1px solid var(--ui-line);background:var(--ui-line-soft);overflow:hidden;position:relative;flex-shrink:0;display:grid;place-items:center;color:#d4d4d8}
.od-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.od-it-n{font-size:14px;font-weight:500;line-height:1.4}
.od-it-v{font-size:12px;color:var(--ui-muted)}
.od-tot{margin-top:10px;padding-top:12px;border-top:1px solid var(--ui-line);display:flex;flex-direction:column;gap:6px;font-size:14px}
.od-tot .r{display:flex;justify-content:space-between;gap:12px;color:#52525b}
.od-tot .g{display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;margin-top:2px;border-top:1px solid var(--ui-line);color:var(--ui-ink);font-weight:600}
.od-tot .g span:last-child{font-size:20px}
.od-note{font-size:13px;color:#52525b;line-height:1.7;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line)}
.od-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.9;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid var(--ui-line);white-space:pre-wrap;overflow-wrap:anywhere}
.od-warn{padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px;line-height:1.6;margin-bottom:12px}
.od-err{padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.6;margin-bottom:14px}
.od-contact{font-size:14px;line-height:1.8;white-space:pre-wrap}
.od-pay{display:flex;flex-direction:column;gap:12px}
.od-report{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
@keyframes od-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 0 5px rgba(0,0,0,.07)}}
@media (max-width:640px){.od-kv{grid-template-columns:72px 1fr}.od-step{font-size:11px}.od-status{padding:16px}}
@media (prefers-reduced-motion:reduce){.od-step .dot{animation:none}}
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

  // 額外拉 tenant.contact_info + payment_info + shipping_rules(沒在 getTenantPublic)
  const { data: tenantExtra } = await supabaseAdmin
    .from('tenants')
    .select('contact_info, payment_info, shipping_rules')
    .eq('id', tenant.id)
    .maybeSingle();
  type ExtraRow = {
    contact_info: string | null;
    payment_info: string | null;
    shipping_rules: { options?: { key: string; label: string }[] } | null;
  } | null;
  const contactInfo = (tenantExtra as ExtraRow)?.contact_info ?? null;
  const paymentInfo = (tenantExtra as ExtraRow)?.payment_info ?? null;
  const bankAccount = extractBankAccount(paymentInfo);
  const shipLabel = ((tenantExtra as ExtraRow)?.shipping_rules?.options ?? []).find((o) => o.key === order.shipping_method)?.label ?? null;
  const grandTotal = order.total_twd + order.shipping_fee_twd;

  const createdAt = new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const isCancelled = order.status === 'cancelled' || order.status === 'refunded';
  // 自取訂單沒有「出貨/送達」,文案改「備貨/取貨」(DB 狀態共用 shipped/delivered)
  const isPickup = order.shipping_method === 'pickup';
  const isLinePayOrder = order.payment_method === 'line_pay';
  const isEcpayAtm = order.payment_method === 'ecpay_atm';
  const isEcpayCredit = order.payment_method === 'ecpay_credit';
  const isOnlinePayOrder = isLinePayOrder || isEcpayAtm || isEcpayCredit;
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
    : stage === 0
      ? {
          icon: <IconClock size={20} />,
          title: isLinePayOrder
            ? '訂單成立,請完成 LINE Pay 付款'
            : isEcpayCredit
              ? '訂單成立,請完成信用卡付款'
              : isEcpayAtm
                ? (atmReady ? '訂單成立,請在期限內完成 ATM 轉帳' : '訂單成立,請取得 ATM 轉帳帳號')
                : '訂單成立,請匯款後回報後 5 碼',
          desc: isLinePayOrder || isEcpayCredit ? '請在 24 小時內完成付款,逾期訂單會自動取消' : isEcpayAtm ? '請在繳費期限內轉帳,系統會自動確認' : '3 天內未付款訂單會自動取消',
          ...tone.amber,
        }
      : stage === 1
        ? { icon: <IconClock size={20} />, title: '已回報後 5 碼,等待賣家核帳', desc: '賣家核帳後會轉為已付款', ...tone.amber }
        : stage === 2
          ? { icon: <IconCheckCircle size={20} />, title: '已收款,商品準備中', desc: isPickup ? '備貨完成會通知您取貨' : '出貨後會再通知您', ...tone.green }
          : stage === 3
            ? { icon: isPickup ? <IconPackage size={20} /> : <IconTruck size={20} />, title: isPickup ? '已備貨,歡迎取貨' : '已出貨', desc: isPickup ? '請於營業時間至門市取貨' : '請留意物流通知', ...tone.blue }
            : { icon: <IconCheckCircle size={20} />, title: isPickup ? '已取貨,感謝您的訂購' : '已送達,感謝您的訂購', desc: '有任何問題歡迎聯絡我們', ...tone.green };
  const steps = [
    '下單',
    isLinePayOrder ? 'LINE Pay' : isEcpayCredit ? '刷卡' : isEcpayAtm ? 'ATM 轉帳' : '回報五碼',
    '已收款',
    isPickup ? '備貨' : '出貨',
    isPickup ? '取貨' : '送達',
  ];
  const statusShort = isPickup && order.status === 'shipped' ? '已備貨' : isPickup && order.status === 'delivered' ? '已取貨' : order.status === 'open' && order.payment_status === 'pending' ? '待付款' : (STATUS_LABEL[order.status] ?? order.status);
  const paymentText = `${METHOD_LABEL[order.payment_method ?? 'bank'] ?? '匯款'} · ${order.payment_status === 'pending' && isOnlinePayOrder ? '等待付款' : (PAYMENT_LABEL[order.payment_status] ?? order.payment_status)}`;
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
        <div className="od-steps" aria-label="訂單進度">
          {steps.map((s, i) => {
            const done = i <= stage;
            const next = i === stage + 1;
            return (
              <div key={s} className="od-step" data-done={done ? 'true' : 'false'} data-next={next ? 'true' : 'false'} data-line={i < stage ? 'true' : 'false'}>
                <span className="line" />
                <span className="dot">{done ? <IconCheck size={12} /> : i + 1}</span>
                <span>{s}</span>
              </div>
            );
          })}
        </div>
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
              <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>這組帳號只能用在這筆訂單,金額要完全一樣。轉帳後系統會自動確認,不用回報。</p>
              <p className="ui-muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>改用 <a href={ecpayPayUrl('credit')} style={{ color: 'var(--ui-ink)' }}>信用卡付款</a></p>
            </div>
          ) : (
            <div className="od-pay">
              <ButtonLink href={ecpayPayUrl(isEcpayAtm ? 'atm' : 'credit')} variant="primary" size="lg" className="ui-num" style={{ width: '100%' }}>
                {isEcpayAtm ? '取得 ATM 轉帳帳號' : `用信用卡付款 · NT$ ${money(grandTotal)}`}
              </ButtonLink>
              {/* ATM 單可以改刷卡;信用卡單不提供改 ATM(ATM 選項 2026-10-22 起預設關) */}
              {isEcpayAtm && <p className="ui-muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>改用 <a href={ecpayPayUrl('credit')} style={{ color: 'var(--ui-ink)' }}>信用卡付款</a></p>}
            </div>
          )}
        </Card>
      )}

      {/* ---------- 下一步:匯款 + 回報後 5 碼 ---------- */}
      {!isOnlinePayOrder && stage <= 1 && !isCancelled && (
        <Card className="od-card">
          <div className="od-next">
            <span className="ic" style={{ background: '#fef3c7', color: '#b45309' }}><IconBank size={17} /></span>
            <div><b>{paymentInfo ? '下一步:匯款' : '下一步:等候匯款資訊'}</b><small>{paymentInfo ? '匯款後填帳號後 5 碼,賣家核帳後轉已付款' : '賣家會主動私訊您匯款方式'}</small></div>
          </div>
          {!unlocked ? lockedHint : (
            <div className="od-pay">
              {paymentInfo ? (
                <>
                  <div className="od-mono">{paymentInfo}</div>
                  {bankAccount && <CopyButton big text={bankAccount} label={`複製帳號 ${bankAccount}`} />}
                </>
              ) : (
                <p className="ui-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>請保留此訂單編號,完成匯款後通知賣家對帳。</p>
              )}
              {order.payment_reported_at ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <span style={{ color: '#16a34a', display: 'inline-flex' }}><IconCheck size={16} /></span>
                    <span style={{ fontWeight: 500 }}>已回報後 5 碼</span>
                    <span className="ui-muted" style={{ fontSize: 12 }}>
                      {new Date(order.payment_reported_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 送出
                    </span>
                    <span className="ui-num" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 600, letterSpacing: '.2em', color: '#15803d' }}>{order.payment_last5}</span>
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary className="ui-muted" style={{ fontSize: 13, cursor: 'pointer' }}>填錯了?重新回報</summary>
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
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><IconPencil size={14} /> 匯款後填帳號後 5 碼</div>
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
        <Card className="od-card" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#166534', fontWeight: 600, fontSize: 14 }}>
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
                {item.price_at_purchase === 0 && giftCount > 0 && <Badge style={{ marginLeft: 6, fontSize: 11, padding: '1px 8px' }}>滿額贈</Badge>}
              </div>
              <div className="od-it-v ui-num">{item.variant_name ? `${item.variant_name} · ` : ''}NT$ {money(item.price_at_purchase)} × {item.qty}</div>
            </div>
            <span className="ui-num" style={{ fontWeight: 600, fontSize: 14, color: item.subtotal_twd === 0 ? '#15803d' : undefined }}>NT$ {money(item.subtotal_twd)}</span>
          </div>
        ))}
        <div className="od-tot">
          {(order.shipping_fee_twd > 0 || order.shipping_method) && (
            <>
              <div className="r"><span>商品小計</span><span className="ui-num" style={{ color: 'var(--ui-ink)' }}>NT$ {money(order.total_twd)}</span></div>
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
        <h2>寄送資訊 {!unlocked && <span style={{ color: '#b45309' }}>部分遮蔽</span>}</h2>
        <dl className="od-kv">
          <dt>收件人</dt><dd>{unlocked ? order.shipping_recipient : maskName(order.shipping_recipient)}</dd>
          <dt>電話</dt><dd className="ui-num">{unlocked ? order.shipping_phone : maskPhone(order.shipping_phone)}</dd>
          <dt>地址</dt><dd>{unlocked ? order.shipping_address : maskAddress(order.shipping_address)}</dd>
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
