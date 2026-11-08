/**
 * 綠界 ECPay 全方位金流(AIO)串接(2026-10-22)
 *
 * 金鑰(廠商後台「系統開發管理 → 系統介接設定」,用「金流、MPOS」那一列):
 *   Phase 34(2026-11-06)起每攤位各自存在 tenants.payment_config.ecpay
 *  (merchant_id 明文、hash_key_enc / hash_iv_enc 是 lib/secret-box.ts 的密文),所有函式都要帶 tenantId。
 *   愛油哇(DEFAULT_TENANT_ID)在 DB 還沒有時退回環境變數 ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV(過渡期,匯入後可刪)。
 *   沙盒仍看 ECPAY_ENV=sandbox(全域環境變數,只給本機):所有攤位走綠界測試站、用文件公開的測試特店、忽略 DB。
 *   回呼驗簽一律先找訂單 → tenant_id → 用該攤位的金鑰算 CheckMacValue。
 *
 * 流程(跟 LINE Pay 不同:綠界是「瀏覽器表單跳轉」,不是我們呼叫 API):
 *   1. 我們組一份參數 + 檢查碼,讓客人的瀏覽器 POST 到綠界付款頁(/api/ecpay/pay GET 負責)
 *   2a. 信用卡:客人刷完 → 綠界 Server 端 POST 付款結果到 ReturnURL(/api/ecpay/notify)
 *       + 瀏覽器 POST 回 OrderResultURL(/api/ecpay/pay POST)→ 導到訂單頁
 *   2b. ATM:綠界先產生虛擬帳號 → Server 端 POST 取號結果到 PaymentInfoURL(/api/ecpay/notify)
 *       + 瀏覽器 POST 回 ClientRedirectURL(/api/ecpay/pay POST);客人轉帳後再 POST 到 ReturnURL
 *   3. Server 端通知收到後一定要回純文字「1|OK」,不然綠界 5–15 分鐘後重送,一天最多 4 次
 *
 * 真正的付款狀態以 Server 端 ReturnURL 為準(瀏覽器那一步客人可能中途關掉)。
 * 兩邊都會進 applyEcpayPaymentResult,設計成重複呼叫不會重複處理。
 */
import crypto from 'node:crypto';
import { buildPaymentFlexMessage, lineClientFor, notifyAdmin } from '@/lib/line';
import { getTenantPaymentConfig, orderPayable, supabaseAdmin } from '@/lib/supabase';
import { maskTail, openSecret, SecretBoxError } from '@/lib/secret-box';
import type { PaymentKeyState } from '@/lib/linepay';

const STAGE_HOST = 'https://payment-stage.ecpay.com.tw';
const PROD_HOST = 'https://payment.ecpay.com.tw';

/** 綠界文件「測試介接資訊」公開的測試特店,不是機密 */
const STAGE_TEST_MERCHANT = {
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIV: 'EkRm7iFT261dpevs',
};

/** ATM 虛擬帳號繳費期限(天)— 跟 cron 的匯款逾期取消一致 */
export const ATM_EXPIRE_DAYS = 3;

type EcpayConfig = {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  host: string;
  sandbox: boolean;
};

/** 純 env 判斷:ECPAY_ENV=sandbox(全域,只給本機)。不需攤位、不載金鑰 */
export function isEcpaySandbox(): boolean {
  return (process.env.ECPAY_ENV ?? '').trim().toLowerCase() === 'sandbox';
}

/** 只回有沒有正式的環境變數金鑰,不回值;後台匯入按鈕與 action 用 */
export function hasEcpayEnvKeys(): boolean {
  return (
    !!process.env.ECPAY_MERCHANT_ID?.trim() &&
    !!process.env.ECPAY_HASH_KEY?.trim() &&
    !!process.env.ECPAY_HASH_IV?.trim()
  );
}

/**
 * Phase 34:依攤位拿金鑰(module 私有,不 export 原始 config)。由上往下第一個命中:
 *   1. ECPAY_ENV=sandbox → 全攤位用綠界測試特店,忽略 DB
 *   2. payment_config.ecpay 有完整欄位且解密成功 → 用 DB(包含愛油哇;DB 優先於 env)
 *   3. payment_config.ecpay 有但解密失敗(任一欄)→ null(不退 env)
 *   4. 沒子鍵且 tenantId === DEFAULT_TENANT_ID → 讀 env(過渡期退路)
 *   5. 其他 → null
 */
/** 沙盒提示每個 process 印一次就好 */
let warnedSandbox = false;

async function getConfig(tenantId: string): Promise<EcpayConfig | null> {
  if (isEcpaySandbox()) {
    if (!warnedSandbox) {
      warnedSandbox = true;
      console.warn('[payment-config] 沙盒模式', 'ecpay');
    }
    return { ...STAGE_TEST_MERCHANT, host: STAGE_HOST, sandbox: true };
  }

  const row = await getTenantPaymentConfig(tenantId);
  const sealed = row?.ecpay ?? null;
  if (sealed) {
    if (!sealed.merchant_id || !sealed.hash_key_enc || !sealed.hash_iv_enc) return null;
    let field = 'ecpay.hash_key';
    try {
      const hashKey = openSecret(sealed.hash_key_enc, `${tenantId}:ecpay.hash_key`);
      field = 'ecpay.hash_iv';
      const hashIV = openSecret(sealed.hash_iv_enc, `${tenantId}:ecpay.hash_iv`);
      return { merchantId: sealed.merchant_id, hashKey, hashIV, host: PROD_HOST, sandbox: false };
    } catch (e) {
      if (e instanceof SecretBoxError) {
        console.error('[payment-config] 解密失敗', tenantId, field, e.code);
        return null;
      }
      throw e;
    }
  }

  if (tenantId && tenantId === process.env.DEFAULT_TENANT_ID) {
    const merchantId = process.env.ECPAY_MERCHANT_ID?.trim();
    const hashKey = process.env.ECPAY_HASH_KEY?.trim();
    const hashIV = process.env.ECPAY_HASH_IV?.trim();
    if (!merchantId || !hashKey || !hashIV) return null;
    console.warn('[payment-config] 使用環境變數退路', 'ecpay', tenantId);
    return { merchantId, hashKey, hashIV, host: PROD_HOST, sandbox: false };
  }
  return null;
}

/** 這個攤位的金鑰有沒有設好(DB 解得開,或 DEFAULT_TENANT_ID 的 env 退路)— 沒設就不顯示綠界的付款選項 */
export async function isEcpayConfigured(tenantId: string): Promise<boolean> {
  return (await getConfig(tenantId)) !== null;
}

/** 後台「設定 → 收款」顯示用(Phase 34)。masked 只有 hash_key / hash_iv 的遮罩,永遠不含明文 / 密文 */
export async function getEcpayKeyState(tenantId: string): Promise<PaymentKeyState> {
  const sandbox = isEcpaySandbox();
  const row = await getTenantPaymentConfig(tenantId);
  const sealed = row?.ecpay ?? null;
  if (sealed) {
    try {
      const hashKey = openSecret(sealed.hash_key_enc, `${tenantId}:ecpay.hash_key`);
      const hashIV = openSecret(sealed.hash_iv_enc, `${tenantId}:ecpay.hash_iv`);
      return {
        state: 'db',
        id: sealed.merchant_id,
        masked: { hash_key: maskTail(hashKey), hash_iv: maskTail(hashIV) },
        sandbox,
        updatedAt: sealed.updated_at ?? null,
        source: sealed.source ?? 'form',
      };
    } catch (e) {
      if (!(e instanceof SecretBoxError)) throw e;
      return {
        state: 'broken',
        brokenCode: e.code,
        id: sealed.merchant_id ?? null,
        masked: {},
        sandbox,
        updatedAt: sealed.updated_at ?? null,
        source: sealed.source ?? null,
      };
    }
  }
  if (tenantId && tenantId === process.env.DEFAULT_TENANT_ID && hasEcpayEnvKeys()) {
    return {
      state: 'env',
      id: process.env.ECPAY_MERCHANT_ID!.trim(),
      masked: {
        hash_key: maskTail(process.env.ECPAY_HASH_KEY!.trim()),
        hash_iv: maskTail(process.env.ECPAY_HASH_IV!.trim()),
      },
      sandbox,
      updatedAt: null,
      source: null,
    };
  }
  return { state: 'empty', id: null, masked: {}, sandbox, updatedAt: null, source: null };
}

export type EcpayFields = Record<string, string>;

// ====================
// 檢查碼(CheckMacValue)
// ====================

/**
 * 綠界版 URL encode:規則跟 .NET 的 HttpUtility.UrlEncode 一樣 —
 * 空白變 +,保留 - _ . ! * ( ) 不編碼,其餘(含 ~ 和 ')都要編碼,最後整串轉小寫。
 * JS 的 encodeURIComponent 差在:空白是 %20、~ 和 ' 不會編碼,這裡補回去。
 */
function ecpayUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7E')
    .replace(/'/g, '%27')
    .toLowerCase();
}

/**
 * 檢查碼:參數(不含 CheckMacValue)依名稱 A→Z 排序(不分大小寫),
 * 組成 HashKey=…&k1=v1&…&HashIV=…,綠界版 URL encode → SHA256 → 轉大寫。
 * 送出去的參數和收到的通知都用同一套算;收到的通知一定要先驗過才能信。
 */
function computeCheckMacValue(fields: EcpayFields, cfg: EcpayConfig): string {
  const keys = Object.keys(fields)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  const raw =
    `HashKey=${cfg.hashKey}&` +
    keys.map((k) => `${k}=${fields[k]}`).join('&') +
    `&HashIV=${cfg.hashIV}`;
  return crypto.createHash('sha256').update(ecpayUrlEncode(raw), 'utf8').digest('hex').toUpperCase();
}

function verifyWith(fields: EcpayFields, cfg: EcpayConfig): boolean {
  const given = (fields.CheckMacValue ?? '').toUpperCase();
  if (!given) return false;
  const expected = computeCheckMacValue(fields, cfg);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * 驗綠界送來的通知(Server 端或瀏覽器導回都要驗),沒驗過的資料一律不信。
 * Phase 34:tenantId 必須來自 DB 裡訂單的 tenant_id(先 findEcpayOrder 再驗),不能由請求內容決定。
 */
export async function verifyEcpayCallback(tenantId: string, fields: EcpayFields): Promise<boolean> {
  const cfg = await getConfig(tenantId);
  if (!cfg) {
    console.error('[ecpay] 攤位未設定金鑰,無法驗簽', tenantId);
    return false;
  }
  return verifyWith(fields, cfg);
}

// ====================
// 建立付款(組表單參數)
// ====================

export type EcpayMethod = 'atm' | 'credit';

/**
 * 特店交易編號:只能英數、最長 20 碼,而且綠界不收重複的 —
 * 客人取消再按一次付款就要換一組,所以後面接時間戳。
 * 例:OW-202610-0010 → OW2026100010 + 7 碼時間 = 19 碼。
 */
export function makeMerchantTradeNo(orderNo: string): string {
  const base = orderNo.replace(/[^A-Za-z0-9]/g, '').slice(0, 13);
  const suffix = Date.now().toString(36).toUpperCase().slice(-7);
  return (base + suffix).slice(0, 20);
}

/** 綠界要的台北時間格式 yyyy/MM/dd HH:mm:ss */
function taipeiNow(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

/** 綠界不收特殊字元;# 是 ItemName 的分隔符,也要拿掉 */
function sanitizeText(s: string, max: number): string {
  return s.replace(/[&<>'"#%\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export type EcpayCheckout = { action: string; fields: EcpayFields };

/**
 * 組一份要 POST 到綠界付款頁的表單。回 null = 金鑰沒設。
 * 金額一律由呼叫端以 DB 的訂單金額帶進來,不信任前端。
 */
export async function buildEcpayCheckout(params: {
  /** Phase 34:訂單所屬攤位,決定用哪組特店與金鑰 */
  tenantId: string;
  merchantTradeNo: string;
  amount: number;
  method: EcpayMethod;
  tradeDesc: string;
  itemName: string;
  /** 訂單 id,放 CustomField1;通知回來時交易編號對不上還能靠它反查 */
  orderId: string;
  /** Server 端付款結果通知 */
  returnUrl: string;
  /** Server 端 ATM 取號結果通知 */
  paymentInfoUrl: string;
  /** 瀏覽器導回(信用卡用 OrderResultURL,ATM 用 ClientRedirectURL) */
  browserReturnUrl: string;
  /** 付款頁「返回商店」按鈕 */
  clientBackUrl: string;
}): Promise<EcpayCheckout | null> {
  const cfg = await getConfig(params.tenantId);
  if (!cfg) return null;
  const fields: EcpayFields = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: params.merchantTradeNo,
    MerchantTradeDate: taipeiNow(),
    PaymentType: 'aio',
    TotalAmount: String(Math.round(params.amount)),
    TradeDesc: sanitizeText(params.tradeDesc, 200),
    ItemName: sanitizeText(params.itemName, 400),
    ReturnURL: params.returnUrl,
    ChoosePayment: params.method === 'atm' ? 'ATM' : 'Credit',
    EncryptType: '1',
    ClientBackURL: params.clientBackUrl,
    CustomField1: params.orderId,
  };
  if (params.method === 'atm') {
    fields.ExpireDate = String(ATM_EXPIRE_DAYS);
    fields.PaymentInfoURL = params.paymentInfoUrl;
    fields.ClientRedirectURL = params.browserReturnUrl;
  } else {
    // ATM 這類非即時付款不支援 OrderResultURL,只有信用卡帶
    fields.OrderResultURL = params.browserReturnUrl;
  }
  fields.CheckMacValue = computeCheckMacValue(fields, cfg);
  return { action: `${cfg.host}/Cashier/AioCheckOut/V5`, fields };
}

// ====================
// 查詢訂單(每日抓漏用)
// ====================

export type EcpayTradeQuery =
  | {
      ok: true;
      /** TradeStatus = 1 才是已付款;0 = 建單未付款 */
      paid: boolean;
      tradeStatus: string;
      tradeNo: string;
      tradeAmt: number;
      paymentType: string;
      paymentDate: string;
    }
  | { ok: false; error: string };

/**
 * 問綠界「這筆特店交易編號付了沒」。
 * 回應是 k=v&k=v 字串,也帶 CheckMacValue,驗過才信。
 * 綠界有頻率限制(太密集會 403 鎖 30 分鐘),cron 逐筆呼叫之間請隔一下。
 */
export async function queryEcpayTrade(tenantId: string, merchantTradeNo: string): Promise<EcpayTradeQuery> {
  const cfg = await getConfig(tenantId);
  if (!cfg) return { ok: false, error: '這個攤位沒有設定綠界金鑰' };
  const fields: EcpayFields = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  fields.CheckMacValue = computeCheckMacValue(fields, cfg);

  let text: string;
  try {
    const res = await fetch(`${cfg.host}/Cashier/QueryTradeInfo/V5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(20000),
    });
    text = await res.text();
    if (!res.ok) {
      console.error('[ecpay query] HTTP 錯誤', res.status, text.slice(0, 200));
      return { ok: false, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    console.error('[ecpay query] 連線失敗', e);
    return { ok: false, error: '無法連線綠界' };
  }

  const parsed = Object.fromEntries(new URLSearchParams(text)) as EcpayFields;
  if (!parsed.TradeStatus) {
    console.error('[ecpay query] 回應格式不對', merchantTradeNo, text.slice(0, 200));
    return { ok: false, error: text.slice(0, 200) };
  }
  if (!verifyWith(parsed, cfg)) {
    console.error('[ecpay query] 回應檢查碼不符', merchantTradeNo);
    return { ok: false, error: '回應檢查碼不符' };
  }
  return {
    ok: true,
    paid: parsed.TradeStatus === '1',
    tradeStatus: parsed.TradeStatus,
    tradeNo: parsed.TradeNo ?? '',
    tradeAmt: Number(parsed.TradeAmt ?? 0),
    paymentType: parsed.PaymentType ?? '',
    paymentDate: parsed.PaymentDate ?? '',
  };
}

// ====================
// 信用卡退款(後台用,2026-10-22)
// 綠界的信用卡有三個階段,退法不同:
//   已授權(今天剛刷、還沒請款)→ N 放棄授權,一毛手續費都不收
//   要關帳(每天 20:15 自動關帳後到隔天早上 6 點銀行請款完成前)→ 先 E 取消關帳再 N
//   已關帳(請款完成)→ R 退刷,2.75% 手續費退回、NT$1 處理費不退
// 我們沒有串「查狀態」那支(要另一組特店檢查碼),改成依序嘗試:失敗的動作綠界只會回錯,
// 不會動到交易,所以試錯是安全的。部分退款只有已關帳(或要關帳)才做得到。
// 綠界測試站不提供這支 API,只能在正式站試。
// ====================

type CreditAction = 'C' | 'R' | 'E' | 'N';

async function doCreditAction(
  cfg: EcpayConfig,
  params: { merchantTradeNo: string; tradeNo: string; action: CreditAction; amount: number },
): Promise<{ ok: boolean; code: string; message: string }> {
  const fields: EcpayFields = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: params.merchantTradeNo,
    TradeNo: params.tradeNo,
    Action: params.action,
    TotalAmount: String(Math.floor(params.amount)),
  };
  fields.CheckMacValue = computeCheckMacValue(fields, cfg);
  let text: string;
  try {
    const res = await fetch(`${cfg.host}/CreditDetail/DoAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(20000),
    });
    text = await res.text();
  } catch (e) {
    console.error('[ecpay refund] 連線失敗', params.action, params.merchantTradeNo, e);
    return { ok: false, code: 'network', message: '無法連線綠界' };
  }
  // 回應是 k=v&k=v 字串(RtnCode=1 成功);保險起見也接受 JSON
  let parsed: Record<string, string> = Object.fromEntries(new URLSearchParams(text));
  if (!parsed.RtnCode) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      parsed = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)]));
    } catch {
      /* 不是 JSON,維持原樣 */
    }
  }
  const code = parsed.RtnCode ?? 'no_response';
  const message = parsed.RtnMsg ?? text.slice(0, 200);
  console.log('[ecpay refund]', params.action, params.merchantTradeNo, params.amount, code, message);
  return { ok: code === '1', code, message };
}

export type EcpayRefundResult =
  | { ok: true; action: 'N' | 'E+N' | 'R'; message: string }
  | { ok: false; code: 'no_config' | 'sandbox' | 'closing_window' | 'failed'; message: string };

/**
 * 信用卡退款。fullRefund = 整筆都還沒退過而且這次退全額(才有資格用「放棄授權」免手續費)。
 * 成功時回用了哪個動作,後台可以告訴老闆這筆有沒有被扣處理費。
 */
export async function refundEcpayCredit(params: {
  /** Phase 34:訂單所屬攤位(orders.tenant_id),決定用哪組金鑰 */
  tenantId: string;
  merchantTradeNo: string;
  tradeNo: string;
  amount: number;
  fullRefund: boolean;
}): Promise<EcpayRefundResult> {
  const cfg = await getConfig(params.tenantId);
  if (!cfg) return { ok: false, code: 'no_config', message: '這個攤位沒有設定綠界金鑰' };
  if (cfg.sandbox) return { ok: false, code: 'sandbox', message: '綠界測試站不支援退款 API' };
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    return { ok: false, code: 'failed', message: '金額異常' };
  }

  // 每天 20:15–20:30 綠界批次關帳請款,這段時間呼叫會跟它打架
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const mins = tw.getUTCHours() * 60 + tw.getUTCMinutes();
  if (mins >= 20 * 60 + 15 && mins < 20 * 60 + 35) {
    return { ok: false, code: 'closing_window', message: '綠界 20:15–20:30 批次請款中,請 20:35 後再試' };
  }

  const run = (action: CreditAction) =>
    doCreditAction(cfg, { merchantTradeNo: params.merchantTradeNo, tradeNo: params.tradeNo, action, amount: params.amount });
  const tried: string[] = [];

  if (params.fullRefund) {
    let r = await run('N');
    tried.push(`放棄授權:${r.message}`);
    if (r.ok) return { ok: true, action: 'N', message: r.message };

    r = await run('E');
    tried.push(`取消關帳:${r.message}`);
    if (r.ok) {
      const n = await run('N');
      tried.push(`放棄授權:${n.message}`);
      if (n.ok) return { ok: true, action: 'E+N', message: n.message };
      // E 成功 N 失敗:交易回到已授權,再按一次退款就會走到 N;留 log 給人看
      console.error('[ecpay refund] 取消關帳成功但放棄失敗,請再退一次', params.merchantTradeNo, tried);
      await notifyAdmin('綠界退款做到一半:已取消關帳,但放棄授權失敗', [
        `特店交易編號 ${params.merchantTradeNo}`,
        '請到後台對同一筆再按一次退款。',
      ]);
    }

    r = await run('R');
    tried.push(`退刷:${r.message}`);
    if (r.ok) return { ok: true, action: 'R', message: r.message };

    console.error('[ecpay refund] 全額退款三種動作都失敗', params.merchantTradeNo, tried);
    return { ok: false, code: 'failed', message: tried.join(' / ') };
  }

  const r = await run('R');
  if (r.ok) return { ok: true, action: 'R', message: r.message };
  console.error('[ecpay refund] 部分退刷失敗', params.merchantTradeNo, r.code, r.message);
  return { ok: false, code: 'failed', message: `退刷:${r.message}` };
}

// ====================
// 顯示用
// ====================

/** 綠界回傳的 PaymentType(Credit_CreditCard / ATM_LAND / WebATM_TAISHIN…)對到我們的 payment_method */
export function ecpayMethodFromPaymentType(paymentType: string): 'ecpay_atm' | 'ecpay_credit' | null {
  if (paymentType.startsWith('Credit_')) return 'ecpay_credit';
  if (paymentType.startsWith('ATM_') || paymentType.startsWith('WebATM_')) return 'ecpay_atm';
  return null;
}

/** 各種付款方式的中文(訂單頁、後台、通知共用) */
export function paymentMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'line_pay':
      return 'LINE Pay';
    case 'ecpay_atm':
      return 'ATM 轉帳';
    case 'ecpay_credit':
      return '信用卡';
    case 'qr':
      return '掃碼付款';
    case 'bank':
      return '匯款';
    default:
      return '未選擇';
  }
}

// ====================
// 收到通知後更新訂單(Server 端通知與瀏覽器導回共用)
// ====================

type EcpayOrderRow = {
  id: string;
  tenant_id: string; // Phase 34:回呼「先找攤位再驗簽」的唯一依據
  order_no: string;
  total_twd: number;
  discount_twd: number | null; // Phase 33:折扣碼金額,應付用 orderPayable 算
  shipping_fee_twd: number | null;
  payment_status: string;
  status: string;
  ecpay_merchant_trade_no: string | null;
  atm_vaccount: string | null;
  access_key: string | null;
  tenants: { slug: string; name: string } | null;
  users: { line_user_id: string | null } | null;
};

const ORDER_SELECT =
  'id, tenant_id, order_no, total_twd, discount_twd, shipping_fee_twd, payment_status, status, ecpay_merchant_trade_no, atm_vaccount, access_key, tenants(slug, name), users(line_user_id)';

/**
 * 用通知裡的資料找訂單:先比特店交易編號;對不上(客人後來換過付款方式,
 * 編號已被新的蓋掉)再用 CustomField1 的訂單 id 反查。
 */
export async function findEcpayOrder(fields: EcpayFields): Promise<EcpayOrderRow | null> {
  const mtn = (fields.MerchantTradeNo ?? '').trim();
  if (mtn) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select(ORDER_SELECT)
      .eq('ecpay_merchant_trade_no', mtn)
      .maybeSingle();
    if (data) return data as unknown as EcpayOrderRow;
  }
  const orderId = (fields.CustomField1 ?? '').trim();
  if (/^[0-9a-f-]{36}$/i.test(orderId)) {
    const { data } = await supabaseAdmin.from('orders').select(ORDER_SELECT).eq('id', orderId).maybeSingle();
    if (data) return data as unknown as EcpayOrderRow;
  }
  return null;
}

export type EcpayApplyResult =
  | 'paid'
  | 'already_paid'
  | 'ignored'
  | 'not_found'
  | 'amount_mismatch'
  | 'error';

/**
 * 付款成功通知(RtnCode=1)→ 標已付款、存綠界交易編號、推 LINE 通知卡。
 * 可重複呼叫:已付款的單直接回 already_paid,不會推第二次。
 * baseUrl 給通知卡的「查看訂單」連結用。
 *
 * Phase 34 前提:呼叫端一定已用訂單所屬攤位的金鑰驗過簽(notify / pay POST),
 * 或資料來自 queryEcpayTrade(回應已用該攤位金鑰驗過 CheckMacValue);新增呼叫端不得跳過驗簽。
 * 這裡不再自己載金鑰,用同一份 fields 再 findEcpayOrder 必定找到同一筆。
 */
export async function applyEcpayPaymentResult(fields: EcpayFields, baseUrl: string): Promise<EcpayApplyResult> {
  if (fields.RtnCode !== '1') return 'ignored';
  if (fields.SimulatePaid === '1' && !isEcpaySandbox()) {
    // 正式站的「模擬付款」是廠商後台按的,綠界不會撥款,不能當已付款
    console.warn('[ecpay] 正式站收到模擬付款,忽略', fields.MerchantTradeNo);
    return 'ignored';
  }

  const order = await findEcpayOrder(fields);
  if (!order) {
    console.error('[ecpay] 付款通知找不到訂單', fields.MerchantTradeNo, fields.TradeNo, fields.TradeAmt);
    await notifyAdmin('綠界說收到一筆款,但對不到任何訂單', [
      `綠界交易編號 ${fields.TradeNo ?? '-'}`,
      `特店交易編號 ${fields.MerchantTradeNo ?? '-'}`,
      `金額 NT$ ${fields.TradeAmt ?? '-'}`,
      '請到綠界廠商後台查這筆是誰付的。',
    ]);
    return 'not_found';
  }
  // Phase 33:應付 = 商品小計 − 折扣 + 運費(漏掉折扣每張折扣單都會被判金額不符)
  const amount = orderPayable(order);
  if (Number(fields.TradeAmt) !== amount) {
    console.error('[ecpay] 付款金額跟訂單不符', order.order_no, fields.TradeAmt, amount);
    await notifyAdmin('綠界收到的金額跟訂單不一樣,沒有標已收款', [
      `訂單 ${order.order_no}`,
      `綠界收到 NT$ ${fields.TradeAmt},訂單應付 NT$ ${amount}`,
      '請到綠界廠商後台核對後人工處理。',
    ]);
    return 'amount_mismatch';
  }
  if (order.payment_status === 'paid') return 'already_paid';

  const tradeNo = (fields.TradeNo ?? '').trim() || null;
  if (order.status === 'cancelled' || order.status === 'refunded') {
    // 錢已經收了但單早就取消(例如逾期取消後客人才去轉帳)→ 只記付款狀態,留給後台人工退款
    console.error('[ecpay] 已取消的訂單收到付款,需人工退款', order.order_no, tradeNo, amount);
    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'paid', ecpay_trade_no: tradeNo })
      .eq('id', order.id);
    await notifyAdmin('已取消的訂單收到綠界付款,要退錢給客人', [
      `訂單 ${order.order_no}(${order.status === 'refunded' ? '已退款' : '已取消'})`,
      `收到 NT$ ${amount},綠界交易編號 ${tradeNo ?? '-'}`,
      '請到後台訂單詳情用綠界退款退給客人。',
    ]);
    return 'paid';
  }

  const method = ecpayMethodFromPaymentType(fields.PaymentType ?? '');
  // paid_at 由 trigger handle_order_status_change 自動填
  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'paid',
      payment_status: 'paid',
      ecpay_trade_no: tradeNo,
      ...(method ? { payment_method: method } : {}),
    })
    .eq('id', order.id)
    .eq('payment_status', 'pending'); // 期間內被人工標過就不要蓋掉
  if (error) {
    // 錢已經收了,這裡失敗只能靠人工補標或等綠界重送,務必留 log
    console.error('[ecpay] 已收款但更新訂單失敗', order.order_no, tradeNo, error);
    await notifyAdmin('綠界已收款但訂單沒標到已收款', [
      `訂單 ${order.order_no},NT$ ${amount}`,
      `綠界交易編號 ${tradeNo ?? '-'}`,
      '綠界會再重送通知;若一小時後還是未付款,請到後台手動標已收款。',
    ]);
    return 'error';
  }

  const lineUserId = order.users?.line_user_id;
  const slug = order.tenants?.slug;
  if (lineUserId && slug) {
    try {
      // Phase 38:用這張單所屬攤位的 LINE 帳號推(沒設就是愛油哇的)
      const client = await lineClientFor(order.tenant_id);
      await client.pushMessage({
        to: lineUserId,
        messages: [
          buildPaymentFlexMessage({
            kind: 'paid',
            orderNo: order.order_no,
            amountTwd: amount,
            orderUrl: `${baseUrl}/${slug}/order/${order.order_no}${order.access_key ? `?k=${order.access_key}` : ''}`,
            method: paymentMethodLabel(method ?? 'ecpay_credit'),
          }),
        ],
      });
    } catch (e) {
      console.warn('[ecpay] push 失敗', order.order_no, e);
    }
  }
  return 'paid';
}

/** 綠界的繳費期限是 yyyy/MM/dd(到當天 23:59),轉成台北時區的時間點 */
function parseExpireDate(s: string | undefined): string | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59) - 8 * 3600 * 1000;
  return new Date(end).toISOString();
}

export type EcpayAtmResult = 'saved' | 'already_saved' | 'ignored' | 'not_found' | 'error';

/**
 * ATM 取號成功通知(RtnCode=2,帶 BankCode / vAccount / ExpireDate)→
 * 存到訂單上(訂單頁與後台顯示),並推一則 LINE 文字給客人。
 * 可重複呼叫:同一組帳號第二次進來不會再推。
 */
export async function applyEcpayAtmInfo(fields: EcpayFields): Promise<EcpayAtmResult> {
  if (fields.RtnCode !== '2' || !fields.vAccount) return 'ignored';

  const order = await findEcpayOrder(fields);
  if (!order) {
    console.error('[ecpay] 取號通知找不到訂單', fields.MerchantTradeNo);
    return 'not_found';
  }
  if (order.ecpay_merchant_trade_no !== fields.MerchantTradeNo) {
    // 舊的取號結果(客人之後又發動了新的付款)→ 不要蓋掉新的
    return 'ignored';
  }
  if (order.atm_vaccount === fields.vAccount) return 'already_saved';
  if (order.payment_status === 'paid') return 'ignored';

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_method: 'ecpay_atm',
      ecpay_trade_no: (fields.TradeNo ?? '').trim() || null,
      atm_bank_code: fields.BankCode ?? null,
      atm_vaccount: fields.vAccount,
      atm_expire_at: parseExpireDate(fields.ExpireDate),
    })
    .eq('id', order.id);
  if (error) {
    console.error('[ecpay] 存取號資訊失敗', order.order_no, error);
    return 'error';
  }

  const lineUserId = order.users?.line_user_id;
  if (lineUserId) {
    const amount = orderPayable(order); // Phase 33
    try {
      const client = await lineClientFor(order.tenant_id); // Phase 38
      await client.pushMessage({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text:
              `訂單 ${order.order_no} 的 ATM 轉帳資訊\n\n` +
              `銀行代碼:${fields.BankCode ?? '—'}\n` +
              `轉帳帳號:${fields.vAccount}\n` +
              `金額:NT$ ${amount.toLocaleString()}\n` +
              `繳費期限:${fields.ExpireDate ?? ''} 23:59\n\n` +
              `轉帳完成後系統會自動確認付款,不需要回報。這組帳號只能用在這筆訂單。`,
          },
        ],
      });
    } catch (e) {
      console.warn('[ecpay] 取號 push 失敗', order.order_no, e);
    }
  }
  return 'saved';
}
