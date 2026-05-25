import { NextRequest, NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { buildMonthlyClassesFlex, describeEvent, formatMonthlyClassesText, getContactQuickReplyItems, lineClient, verifySignature } from '@/lib/line';
import { getClassesForCurrentMonth, getTenantByBotUserId, logMessage, supabaseAdmin, upsertUser } from '@/lib/supabase';
import type { messagingApi } from '@line/bot-sdk';

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

  // 只在 follow event 才打 LINE getProfile API(省 ~300ms);後續 message/postback 假設 user 已 upsert 過
  let displayName: string | null = null;
  let pictureUrl: string | null = null;
  if (lineUserId && event.type === 'follow') {
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

  // Support mode 偵測:explicit button flow(2026-05-21 改造)
  // 學員按客服 → 出現 Quick Reply「我要詢問 / 取消」
  // - 按「我要詢問」 → action=start_support → 進 30 分鐘 support mode
  // - 按「取消」 → action=cancel_support → 清掉 mode
  // - 不再有 keyword 自動觸發(避免打字誤觸)
  let isSupport = false;
  if (event.type === 'postback' && userId) {
    const action = new URLSearchParams(event.postback.data).get('action');
    if (action === 'start_support') {
      await supabaseAdmin
        .from('users')
        .update({ last_support_at: new Date().toISOString() })
        .eq('id', userId);
    } else if (action === 'cancel_support') {
      await supabaseAdmin
        .from('users')
        .update({ last_support_at: null })
        .eq('id', userId);
    }
  } else if (event.type === 'message' && event.message.type === 'text' && userId) {
    // 純粹查 last_support_at 是否在 30 分鐘內,不再認 keyword
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('last_support_at')
      .eq('id', userId)
      .maybeSingle();
    const lastAt = (u as { last_support_at?: string | null } | null)?.last_support_at;
    if (lastAt) {
      const ageMs = Date.now() - new Date(lastAt).getTime();
      if (ageMs < 30 * 60 * 1000) {
        isSupport = true;
      }
    }
  }

  const replyText = await buildReplyText(tenantId, event);
  const canReply = replyText && 'replyToken' in event && event.replyToken;
  // 客服 postback 帶 Quick Reply chips(我要詢問 / 取消),其他都純文字
  const quickReply: messagingApi.QuickReply | undefined =
    event.type === 'postback' &&
    new URLSearchParams(event.postback.data).get('action') === 'contact'
      ? { items: getContactQuickReplyItems() }
      : undefined;

  // inbound log + reply + outbound log 全部並發,降 critical path latency
  const tasks: Promise<unknown>[] = [
    logMessage({
      tenantId,
      userId,
      direction: 'inbound',
      eventType: event.type,
      messageType: messageType ?? undefined,
      content,
      rawEvent: event,
      isSupport,
    }),
  ];

  if (canReply) {
    const replyToken = event.replyToken;

    // Phase C(2026-05-25):本月課程 postback → Flex Carousel(有圖片更生動)
    // 失敗或無資料 fallback 純文字
    let flexMessage: messagingApi.FlexMessage | null = null;
    if (
      event.type === 'postback' &&
      new URLSearchParams(event.postback.data).get('action') === 'monthly-classes'
    ) {
      try {
        const { getClassesForCurrentMonth } = await import('@/lib/supabase');
        const classes = await getClassesForCurrentMonth(tenantId);
        flexMessage = buildMonthlyClassesFlex(classes);
      } catch (e) {
        console.warn('[webhook flex monthly-classes]', e);
      }
    }

    const replyMessage: messagingApi.Message = flexMessage ?? {
      type: 'text',
      text: replyText,
      ...(quickReply ? { quickReply } : {}),
    };
    tasks.push(
      lineClient
        .replyMessage({
          replyToken,
          messages: [replyMessage],
        })
        .catch((e) => console.error('[webhook] reply failed', e)),
    );
    tasks.push(
      logMessage({
        tenantId,
        userId,
        direction: 'outbound',
        eventType: 'reply',
        messageType: flexMessage ? 'flex' : 'text',
        content: flexMessage
          ? { text: replyText, format: 'flex_carousel' }
          : { text: replyText },
      }),
    );
  }

  // Realtime broadcast:只在 support 模式內的 inbound text 才推 admin
  // (避免所有訊息都跳 badge,只看客服問題)
  if (event.type === 'message' && isSupport) {
    void broadcastNewMessage(tenantId, userId, event.message.type);
  }

  await Promise.allSettled(tasks);
}

/**
 * 決定回覆文字:postback 特定 action 從 DB 拉真資料,其餘 fallback 到 describeEvent 的 placeholder。
 */
async function buildReplyText(tenantId: string, event: WebhookEvent): Promise<string> {
  if (event.type !== 'postback') return describeEvent(event);

  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');

  if (action === 'monthly-classes') {
    try {
      const classes = await getClassesForCurrentMonth(tenantId);
      return formatMonthlyClassesText(classes);
    } catch (e) {
      console.error('[buildReplyText monthly-classes]', e);
      return describeEvent(event);
    }
  }

  if (action === 'news') {
    try {
      const newsList = await getRecentNews(tenantId, 3);
      return formatNewsText(newsList);
    } catch (e) {
      console.error('[buildReplyText news]', e);
      return describeEvent(event);
    }
  }

  return describeEvent(event);
}

// ====================
// 最新消息(Phase 6.3 / Bot 月 3)
// ====================
type NewsRow = {
  id: string;
  title: string;
  body: string | null;
  published_at: string;
};

async function getRecentNews(tenantId: string, limit: number): Promise<NewsRow[]> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const { data, error } = await supabaseAdmin
    .from('news')
    .select('id, title, body, published_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error('[getRecentNews]', error);
    return [];
  }
  return (data ?? []) as NewsRow[];
}

/**
 * 透過 Supabase Realtime broadcast 通知前端 admin nav 有新客戶訊息。
 * 用 REST API send,不需要先 subscribe channel。Fire-and-forget。
 */
async function broadcastNewMessage(
  tenantId: string,
  userId: string | null,
  messageType: string,
): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `tenant:${tenantId}:messages`,
            event: 'new_message',
            payload: {
              user_id: userId,
              message_type: messageType,
              at: new Date().toISOString(),
            },
          },
        ],
      }),
    });
  } catch (e) {
    console.warn('[broadcastNewMessage]', e);
  }
}

function formatNewsText(items: NewsRow[]): string {
  if (items.length === 0) {
    return [
      '📰 最新消息',
      '',
      '目前無公告。',
      '',
      '有問題請輸入「真人」或點專屬客服。',
    ].join('\n');
  }

  const lines: string[] = ['📰 最新消息', ''];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const dt = it.published_at
      ? new Date(it.published_at).toLocaleDateString('zh-TW', {
          timeZone: 'Asia/Taipei',
          month: 'numeric',
          day: 'numeric',
        })
      : '';
    lines.push(`【${it.title}】${dt ? ' · ' + dt : ''}`);
    if (it.body) {
      lines.push(it.body);
    }
    if (i < items.length - 1) lines.push('');
  }
  return lines.join('\n');
}

// LINE 平台 Verify 按鈕打 GET
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'LINE webhook endpoint' });
}
