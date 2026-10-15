/**
 * LINE Pay Online API v3 串接(2026-10-15)
 *
 * 金鑰(商家中心「管理連結金鑰」的通路 ID / 通路密鑰):
 *   正式:LINEPAY_CHANNEL_ID / LINEPAY_CHANNEL_SECRET
 *   測試:LINEPAY_SANDBOX_CHANNEL_ID / LINEPAY_SANDBOX_CHANNEL_SECRET
 * 設 LINEPAY_ENV=sandbox 走測試站(付款是模擬的,不會真的扣款),不設就是正式站。
 *
 * 流程:request(建立付款,拿 paymentUrl)→ 客人到 LINE Pay 付款 →
 *      導回我們的 confirmUrl → confirm(真正扣款)。沒 confirm 就不會收到錢。
 */
import crypto from 'node:crypto';

const SANDBOX_HOST = 'https://sandbox-api-pay.line.me';
const PROD_HOST = 'https://api-pay.line.me';

type LinePayConfig = {
  channelId: string;
  channelSecret: string;
  host: string;
  sandbox: boolean;
};

function getConfig(): LinePayConfig | null {
  const sandbox = (process.env.LINEPAY_ENV ?? '').trim().toLowerCase() === 'sandbox';
  const channelId = (
    sandbox ? process.env.LINEPAY_SANDBOX_CHANNEL_ID : process.env.LINEPAY_CHANNEL_ID
  )?.trim();
  const channelSecret = (
    sandbox ? process.env.LINEPAY_SANDBOX_CHANNEL_SECRET : process.env.LINEPAY_CHANNEL_SECRET
  )?.trim();
  if (!channelId || !channelSecret) return null;
  return {
    channelId,
    channelSecret,
    host: sandbox ? SANDBOX_HOST : PROD_HOST,
    sandbox,
  };
}

/** 金鑰有沒有設好 — 沒設就不顯示 LINE Pay 付款選項 */
export function isLinePayConfigured(): boolean {
  return getConfig() !== null;
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
  try {
    return JSON.parse(text) as LinePayResponse;
  } catch {
    console.error('[linepay] 回應不是 JSON', res.status, text.slice(0, 300));
    return null;
  }
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
  try {
    return JSON.parse(text) as LinePayResponse;
  } catch {
    console.error('[linepay] GET 回應不是 JSON', res.status, text.slice(0, 300));
    return null;
  }
}

/**
 * 查這筆交易客人到底授權了沒(2026-10-16 自動抓漏用)。
 * returnCode 0000 = 客人已完成授權、可以 confirm 收款;
 * 其他多半是「還沒付」或「已處理過」,照原樣回報給呼叫端判斷。
 */
export async function checkLinePayPaymentStatus(
  transactionId: string,
): Promise<{ authorized: boolean; code: string; message: string }> {
  const cfg = getConfig();
  if (!cfg) return { authorized: false, code: 'no_config', message: 'LINE Pay 尚未設定' };
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
  orderNo: string;
  amount: number;
  productName: string;
  confirmUrl: string;
  cancelUrl: string;
}): Promise<LinePayRequestResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: 'LINE Pay 尚未設定' };
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
  transactionId: string,
  amount: number,
): Promise<LinePayConfirmResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: 'LINE Pay 尚未設定', code: 'no_config' };

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
  transactionId: string,
  refundAmount?: number,
): Promise<LinePayRefundResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: 'LINE Pay 尚未設定', code: 'no_config' };

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
