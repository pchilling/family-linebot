import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { describeEvent, lineClient, verifySignature } from '@/lib/line';

export const runtime = 'nodejs';

/**
 * LINE webhook endpoint
 * - 驗證簽章
 * - 5 秒內回 200(LINE 會 retry,慢的工作要 background)
 * - v1:echo / 歡迎訊息(無 DB)
 * - Step 4 之後:寫 users + messages
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as { events: WebhookEvent[] };

  await Promise.all(
    body.events.map(async (event) => {
      const text = describeEvent(event);
      if (!text) return;

      if (event.type === 'message' || event.type === 'follow' || event.type === 'postback') {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text }],
        });
      }
    }),
  );

  return NextResponse.json({ ok: true });
}

// LINE 平台「Verify」按鈕會打 GET,回 200 就好
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'LINE webhook endpoint' });
}
