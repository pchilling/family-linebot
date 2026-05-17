import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { describeEvent, lineClient, verifySignature } from '@/lib/line';
import { getTenantByBotUserId, logMessage, upsertUser } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * LINE webhook endpoint
 * 1. 驗證簽章(v1 用 env 單 secret,multi-tenant 之後改 per-tenant)
 * 2. parse body → destination 反查 tenant
 * 3. 每個 event:
 *    - 取 LINE profile(follow / message)
 *    - upsert users
 *    - log inbound message
 *    - reply + log outbound message
 * 4. 5 秒內回 200,LINE 才不會 retry
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    destination: string;
    events: WebhookEvent[];
  };

  // v1:用 destination 反查 tenant;查不到就 log + 200(不可 retry storm)
  const tenant = await getTenantByBotUserId(body.destination);
  if (!tenant) {
    console.warn('[webhook] no tenant for destination', body.destination);
    return NextResponse.json({ ok: true });
  }

  await Promise.all(body.events.map((event) => handleEvent(tenant.id, event)));

  return NextResponse.json({ ok: true });
}

async function handleEvent(tenantId: string, event: WebhookEvent): Promise<void> {
  const lineUserId =
    'source' in event && event.source.type === 'user' ? event.source.userId : null;

  // 取 profile(follow / 文字訊息 才取,其他 event 不打 profile API 省 quota)
  let displayName: string | null = null;
  let pictureUrl: string | null = null;
  if (lineUserId && (event.type === 'follow' || event.type === 'message')) {
    try {
      const profile = await lineClient.getProfile(lineUserId);
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl ?? null;
    } catch (e) {
      console.warn('[webhook] getProfile failed', lineUserId, e);
    }
  }

  // upsert user
  let userId: string | null = null;
  if (lineUserId) {
    const status = event.type === 'unfollow' ? 'left' : 'active';
    userId = await upsertUser({
      tenantId,
      lineUserId,
      displayName,
      pictureUrl,
      status,
    });
  }

  // log inbound
  const messageType =
    event.type === 'message'
      ? event.message.type
      : event.type === 'postback'
        ? 'postback'
        : null;
  const content =
    event.type === 'message'
      ? event.message
      : event.type === 'postback'
        ? event.postback
        : null;

  await logMessage({
    tenantId,
    userId,
    direction: 'inbound',
    eventType: event.type,
    messageType: messageType ?? undefined,
    content,
    rawEvent: event,
  });

  // reply(echo 或 follow 歡迎)
  const replyText = describeEvent(event);
  if (replyText && 'replyToken' in event && event.replyToken) {
    try {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }],
      });
      await logMessage({
        tenantId,
        userId,
        direction: 'outbound',
        eventType: 'reply',
        messageType: 'text',
        content: { text: replyText },
      });
    } catch (e) {
      console.error('[webhook] reply failed', e);
    }
  }
}

// LINE 平台 Verify 按鈕打 GET
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'LINE webhook endpoint' });
}
