/**
 * LINE Pay Online API v3 串接(2026-10-15)
 *
 * 金鑰(商家中心「管理連結金鑰」的通路 ID / 通路密鑰):
 *   Phase 34(2026-11-06)起每攤位各自存在 tenants.payment_config.linepay
 *  (channel_id 明文、channel_secret_enc 是 lib/secret-box.ts 的密文),所有函式都要帶 tenantId。
 *   愛油哇(DEFAULT_TENANT_ID)在 DB 還沒有時退回環境變數 LINEPAY_CHANNEL_ID / LINEPAY_CHANNEL_SECRET(過渡期,匯入後可刪)。
 *   沙盒仍看 LINEPAY_ENV=sandbox(全域環境變數,只給本機):所有攤位走測試站、讀 LINEPAY_SANDBOX_*、忽略 DB。
 *
 * 流程:request(建立付款,拿 paymentUrl)→ 客人到 LINE Pay 付款 →
 *      導回我們的 confirmUrl → confirm(真正扣款)。沒 confirm 就不會收到錢。
 */
import crypto from 'node:crypto';
import { getTenantPaymentConfig } from '@/lib/supabase';
import { maskTail, openSecret, SecretBoxError, type SecretBoxErrorCode } from '@/lib/secret-box';

const SANDBOX_HOST = 'https://sandbox-api-pay.line.me';
const PROD_HOST = 'https://api-pay.line.me';

type LinePayConfig = {
  channelId: string;
  channelSecret: string;
  host: string;
  sandbox: boolean;
};

function isLinePaySandbox(): boolean {
  return (process.env.LINEPAY_ENV ?? '').trim().toLowerCase() === 'sandbox';
}
/** 沙盒提示每個 process 印一次就好,不然本機 log 會被灌滿 */
let warnedSandbox = false;

/** 只回有沒有正式的環境變數金鑰,不回值;後台匯入按鈕與 action 用。不看 SANDBOX 變數 */
export function hasLinePayEnvKeys(): boolean {
  return !!process.env.LINEPAY_CHANNEL_ID?.trim() && !!process.env.LINEPAY_CHANNEL_SECRET?.trim();
}

/**
 * Phase 34:依攤位拿金鑰(module 私有,不 export 原始 config)。由上往下第一個命中:
 *   1. LINEPAY_ENV=sandbox → 全攤位走 sandbox 金鑰,忽略 DB
 *   2. payment_config.linepay 有完整欄位且解密成功 → 用 DB(包含愛油哇;DB 優先於 env)
 *   3. payment_config.linepay 有但解密失敗 → null(不退 env:悄悄換帳號收錢沒人知道,寧願不可用)
 *   4. 沒子鍵且 tenantId === DEFAULT_TENANT_ID → 讀 env(過渡期退路)
 *   5. 其他 → null
 */
async function getConfig(tenantId: string): Promise<LinePayConfig | null> {
  if (isLinePaySandbox()) {
    const channelId = process.env.LINEPAY_SANDBOX_CHANNEL_ID?.trim();
    const channelSecret = process.env.LINEPAY_SANDBOX_CHANNEL_SECRET?.trim();
    if (!channelId || !channelSecret) return null;
    if (!warnedSandbox) {
      warnedSandbox = true;
      console.warn('[payment-config] 沙盒模式', 'linepay');
    }
    return { channelId, channelSecret, host: SANDBOX_HOST, sandbox: true };
  }

  const row = await getTenantPaymentConfig(tenantId);
  const sealed = row?.linepay ?? null;
  if (sealed) {
    if (!sealed.channel_id || !sealed.channel_secret_enc) return null;
    try {
      const channelSecret = openSecret(sealed.channel_secret_enc, `${tenantId}:linepay.channel_secret`);
      return { channelId: sealed.channel_id, channelSecret, host: PROD_HOST, sandbox: false };
    } catch (e) {
      if (e instanceof SecretBoxError) {
        console.error('[payment-config] 解密失敗', tenantId, 'linepay.channel_secret', e.code);
        return null;
      }
      throw e;
    }
  }

  if (tenantId && tenantId === process.env.DEFAULT_TENANT_ID) {
    const channelId = process.env.LINEPAY_CHANNEL_ID?.trim();
    const channelSecret = process.env.LINEPAY_CHANNEL_SECRET?.trim();
    if (!channelId || !channelSecret) return null;
    console.warn('[payment-config] 使用環境變數退路', 'linepay', tenantId);
    return { channelId, channelSecret, host: PROD_HOST, sandbox: false };
  }
  return null;
}

/** 這個攤位的金鑰有沒有設好(DB 解得開,或 DEFAULT_TENANT_ID 的 env 退路)— 沒設就不顯示 LINE Pay 付款選項 */
export async function isLinePayConfigured(tenantId: string): Promise<boolean> {
  return (await getConfig(tenantId)) !== null;
}

/**
 * 後台「設定 → 收款」顯示用的金鑰狀態(Phase 34)。永遠不含明文 / 密文,只有遮罩字串與明文 id。
 * LINE Pay 與綠界共用這個型別。
 */
export type PaymentKeyState = {
  state: 'empty' | 'env' | 'db' | 'broken';
  /** broken 時的原因,後台分兩種文案 */
  brokenCode?: SecretBoxErrorCode;
  /** 明文 id(channel_id / merchant_id),非敏感;empty 時 null */
  id: string | null;
  /** 敏感欄位的遮罩字串,例 { channel_secret: '••••••••a1b2' };永遠不含明文 / 密文 */
  masked: Record<string, string>;
  /** 本機沙盒開著(後台顯示提示用) */
  sandbox: boolean;
  updatedAt: string | null;
  source: 'form' | 'env_import' | null;
};

export async function getLinePayKeyState(tenantId: string): Promise<PaymentKeyState> {
  const sandbox = isLinePaySandbox();
  const row = await getTenantPaymentConfig(tenantId);
  const sealed = row?.linepay ?? null;
  if (sealed) {
    try {
      const secret = openSecret(sealed.channel_secret_enc, `${tenantId}:linepay.channel_secret`);
      return {
        state: 'db',
        id: sealed.channel_id,
        masked: { channel_secret: maskTail(secret) },
        sandbox,
        updatedAt: sealed.updated_at ?? null,
        source: sealed.source ?? 'form',
      };
    } catch (e) {
      if (!(e instanceof SecretBoxError)) throw e;
      return {
        state: 'broken',
        brokenCode: e.code,
        id: sealed.channel_id ?? null,
        masked: {},
        sandbox,
        updatedAt: sealed.updated_at ?? null,
        source: sealed.source ?? null,
      };
    }
  }
  if (tenantId && tenantId === process.env.DEFAULT_TENANT_ID && hasLinePayEnvKeys()) {
    return {
      state: 'env',
      id: process.env.LINEPAY_CHANNEL_ID!.trim(),
      masked: { channel_secret: maskTail(process.env.LINEPAY_CHANNEL_SECRET!.trim()) },
      sandbox,
      updatedAt: null,
      source: null,
    };
  }
  return { state: 'empty', id: null, masked: {}, sandbox, updatedAt: null, source: null };
}

/**
 * LINE Pay 簽章:Base64(HMAC-SHA256(channelSecret, channelSecret + uri + body + nonce))
 * uri 是不含 host 的路徑,body 必須跟實際送出的字串一模一樣。
 */
function buildHeaders(cfg: LinePayConfig, uri: string, body: string): Record<string, string> {
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', cfg.channelSecret)
    .update(cfg.channelSecret + uri + body + nonce)
    .digest('base64');
  return {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': cfg.channelId,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': signature,
  };
}

/**
 * ⚠️ 2026-10-16 關鍵修正:LINE Pay 的 transactionId 是 19 位數字,
 * 直接 JSON.parse 會超過 JS 的安全整數上限(16 位)而被四捨五入
 * (例:...734123 變成 ...734000),之後拿這個錯誤序號去 confirm 一定失敗,
 * 客人付了款卻收不到。解析前先把它改成字串,完整位數才留得住。
 */
function parseLinePayJson(text: string): LinePayResponse | null {
  try {
    const safe = text.replace(
      /"(transactionId|refundTransactionId)"\s*:\s*(\d+)/g,
      '"$1":"$2"',
    );
    return JSON.parse(safe) as LinePayResponse;
  } catch {
    return null;
  }
}

type LinePayResponse = {
  returnCode?: string;
  returnMessage?: string;
  info?: {
    transactionId?: number | string;
    paymentUrl?: { web?: string; app?: string };
  };
};

async function postToLinePay(
  cfg: LinePayConfig,
  uri: string,
  payload: unknown,
): Promise<LinePayResponse | null> {
  const body = JSON.stringify(payload);
  const res = await fetch(cfg.host + uri, {
    method: 'POST',
    headers: buildHeaders(cfg, uri, body),
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  const json = parseLinePayJson(text);
  if (!json) console.error('[linepay] 回應不是 JSON', res.status, text.slice(0, 300));
  return json;
}

/** GET 的簽章:HMAC(secret, secret + uri + queryString + nonce);沒有 query 就傳空字串 */
async function getFromLinePay(
  cfg: LinePayConfig,
  uri: string,
  queryString = '',
): Promise<LinePayResponse | null> {
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', cfg.channelSecret)
    .update(cfg.channelSecret + uri + queryString + nonce)
    .digest('base64');
  const res = await fetch(cfg.host + uri + (queryString ? `?${queryString}` : ''), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': cfg.channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  const json = parseLinePayJson(text);
  if (!json) console.error('[linepay] GET 回應不是 JSON', res.status, text.slice(0, 300));
  return json;
}

/**
 * 查這筆交易客人到底授權了沒(2026-10-16 自動抓漏用)。
 * returnCode 0000 = 客人已完成授權、可以 confirm 收款;
 * 其他多半是「還沒付」或「已處理過」,照原樣回報給呼叫端判斷。
 */
export async function checkLinePayPaymentStatus(
  tenantId: string,
  transactionId: string,
): Promise<{ authorized: boolean; code: string; message: string }> {
  const cfg = await getConfig(tenantId);
  if (!cfg) return { authorized: false, code: 'no_config', message: '這個攤位沒有設定 LINE Pay 金鑰' };
  let json: LinePayResponse | null;
  try {
    json = await getFromLinePay(cfg, `/v3/payments/requests/${transactionId}/check`);
  } catch (e) {
    console.error('[linepay check] 連線失敗', e);
    return { authorized: false, code: 'network', message: '無法連線 LINE Pay' };
  }
  return {
    authorized: json?.returnCode === '0000',
    code: json?.returnCode ?? 'unknown',
    message: json?.returnMessage ?? '',
  };
}

export type LinePayRequestResult =
  | { ok: true; paymentUrl: string; transactionId: string }
  | { ok: false; error: string };

/**
 * 建立付款:回 LINE Pay 付款頁網址 + 交易序號。
 * 這一步還沒扣款,客人在付款頁按確認、導回 confirmUrl 後 confirm 才真的收款。
 */
export async function requestLinePayPayment(params: {
  /** Phase 34:訂單所屬攤位,決定用哪組金鑰 */
  tenantId: string;
  orderNo: string;
  amount: number;
  productName: string;
  confirmUrl: string;
  cancelUrl: string;
}): Promise<LinePayRequestResult> {
  const cfg = await getConfig(params.tenantId);
  if (!cfg) return { ok: false, error: '這個攤位沒有設定 LINE Pay 金鑰' };
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    return { ok: false, error: '金額異常' };
  }

  // LINE Pay 要求 packages 金額加總 = amount。
  // 贈品(0 元)與運費拆成明細會對不上,所以整單併成一行摘要。
  const payload = {
    amount: params.amount,
    currency: 'TWD',
    orderId: params.orderNo,
    packages: [
      {
        id: params.orderNo,
        amount: params.amount,
        name: params.productName,
        products: [
          {
            name: params.productName,
            quantity: 1,
            price: params.amount,
          },
        ],
      },
    ],
    redirectUrls: {
      confirmUrl: params.confirmUrl,
      cancelUrl: params.cancelUrl,
    },
    // 不指定 locale:LINE Pay 會跟著客人 LINE 的語言走(指定錯值整筆請求會被退)
  };

  let json: LinePayResponse | null;
  try {
    json = await postToLinePay(cfg, '/v3/payments/request', payload);
  } catch (e) {
    console.error('[linepay request] 連線失敗', e);
    return { ok: false, error: '無法連線 LINE Pay,請稍後再試' };
  }

  const web = json?.info?.paymentUrl?.web;
  const txId = json?.info?.transactionId;
  if (json?.returnCode !== '0000' || !web || !txId) {
    console.error('[linepay request] 失敗', json?.returnCode, json?.returnMessage);
    return { ok: false, error: `LINE Pay 建立付款失敗(${json?.returnCode ?? 'no response'})` };
  }
  return { ok: true, paymentUrl: web, transactionId: String(txId) };
}

export type LinePayConfirmResult = { ok: true } | { ok: false; error: string; code: string };

/**
 * 確認付款(真正扣款)。amount 必須跟 request 時一致,否則 LINE Pay 會擋下。
 */
export async function confirmLinePayPayment(
  tenantId: string,
  transactionId: string,
  amount: number,
): Promise<LinePayConfirmResult> {
  const cfg = await getConfig(tenantId);
  if (!cfg) return { ok: false, error: '這個攤位沒有設定 LINE Pay 金鑰', code: 'no_config' };

  let json: LinePayResponse | null;
  try {
    json = await postToLinePay(cfg, `/v3/payments/${transactionId}/confirm`, {
      amount,
      currency: 'TWD',
    });
  } catch (e) {
    console.error('[linepay confirm] 連線失敗', e);
    return { ok: false, error: '無法連線 LINE Pay', code: 'network' };
  }

  if (json?.returnCode !== '0000') {
    console.error('[linepay confirm] 失敗', transactionId, json?.returnCode, json?.returnMessage);
    return {
      ok: false,
      error: json?.returnMessage ?? '付款確認失敗',
      code: json?.returnCode ?? 'unknown',
    };
  }
  return { ok: true };
}

export type LinePayRefundResult = { ok: true } | { ok: false; error: string; code: string };

/**
 * 退款(2026-10-15)。refundAmount 不帶 = 全額退;帶了 = 部分退。
 * ⚠️ 退款不可逆。LINE Pay 自己會擋超額退款與過期交易(一般是原交易 60 天內)。
 */
export async function refundLinePayPayment(
  tenantId: string,
  transactionId: string,
  refundAmount?: number,
): Promise<LinePayRefundResult> {
  const cfg = await getConfig(tenantId);
  if (!cfg) return { ok: false, error: '這個攤位沒有設定 LINE Pay 金鑰', code: 'no_config' };

  const payload =
    refundAmount && refundAmount > 0 ? { refundAmount: Math.floor(refundAmount) } : {};

  let json: LinePayResponse | null;
  try {
    json = await postToLinePay(cfg, `/v3/payments/${transactionId}/refund`, payload);
  } catch (e) {
    console.error('[linepay refund] 連線失敗', e);
    return { ok: false, error: '無法連線 LINE Pay', code: 'network' };
  }

  if (json?.returnCode !== '0000') {
    console.error('[linepay refund] 失敗', transactionId, json?.returnCode, json?.returnMessage);
    return {
      ok: false,
      error: json?.returnMessage ?? '退款失敗',
      code: json?.returnCode ?? 'unknown',
    };
  }
  return { ok: true };
}
