/**
 * 綠界 Server 端通知入口(2026-10-22)
 *
 * 兩種通知都打這裡(建單時 ReturnURL 與 PaymentInfoURL 都填這個網址):
 *   - 付款結果(RtnCode=1 = 付款成功)→ 標已付款、推 LINE 通知卡
 *   - ATM 取號結果(RtnCode=2,帶虛擬帳號)→ 存帳號與繳費期限、推 LINE 文字
 *
 * 規矩:檢查碼驗過才處理;處理完回純文字「1|OK」(不能有引號、不能小寫),
 * 不然綠界會當沒收到,5–15 分鐘後重送,一天最多 4 次。
 * 我們這邊 DB 更新失敗時故意不回 1|OK,讓綠界重送再試一次。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { applyEcpayAtmInfo, applyEcpayPaymentResult, verifyEcpayCallback, type EcpayFields } from '@/lib/ecpay';

export const dynamic = 'force-dynamic';

async function readFields(req: NextRequest): Promise<EcpayFields> {
  const fields: EcpayFields = {};
  const fd = await req.formData();
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') fields[k] = v;
  }
  return fields;
}

function text(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function POST(req: NextRequest) {
  let fields: EcpayFields;
  try {
    fields = await readFields(req);
  } catch (e) {
    console.error('[ecpay notify] 讀不到表單', e);
    return text('0|BadRequest', 400);
  }

  if (!verifyEcpayCallback(fields)) {
    console.error('[ecpay notify] 檢查碼不符', fields.MerchantTradeNo, fields.RtnCode);
    return text('0|CheckMacValue Error', 400);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
  const rtn = fields.RtnCode;

  if (rtn === '1') {
    const result = await applyEcpayPaymentResult(fields, baseUrl);
    console.log('[ecpay notify] 付款結果', fields.MerchantTradeNo, fields.PaymentType, result);
    if (result === 'error') return text('0|Retry', 500);
    return text('1|OK');
  }
  if (rtn === '2') {
    const result = await applyEcpayAtmInfo(fields);
    console.log('[ecpay notify] ATM 取號', fields.MerchantTradeNo, result);
    if (result === 'error') return text('0|Retry', 500);
    return text('1|OK');
  }

  // 其他代碼 = 付款失敗 / 取號失敗(卡被拒、額度不足…),客人會在付款頁看到,我們只留紀錄
  console.warn('[ecpay notify] 非成功通知', fields.MerchantTradeNo, rtn, fields.RtnMsg);
  return text('1|OK');
}
