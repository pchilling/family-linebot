import crypto from 'node:crypto';
import { messagingApi, WebhookEvent } from '@line/bot-sdk';

const { MessagingApiClient } = messagingApi;

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

export const lineClient = new MessagingApiClient({
  channelAccessToken,
});

/**
 * LINE webhook 簽章驗證
 * LINE 用 channel secret 對 request body 做 HMAC-SHA256 base64,放 x-line-signature header
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac('SHA256', channelSecret)
    .update(rawBody)
    .digest('base64');
  return signature === expected;
}

/**
 * 取 event 的純文字內容(訊息 / postback / 其他)— 用來 echo
 */
export function describeEvent(event: WebhookEvent): string {
  switch (event.type) {
    case 'message':
      if (event.message.type === 'text') return `你說:${event.message.text}`;
      return `[收到 ${event.message.type} 訊息]`;
    case 'follow':
      return '歡迎加入!';
    case 'unfollow':
      return '';
    case 'postback':
      return `[postback: ${event.postback.data}]`;
    default:
      return `[event: ${event.type}]`;
  }
}
