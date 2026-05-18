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
 * 取 event 的回覆文字
 * - message:echo
 * - follow:歡迎
 * - postback:根據 action= 切 6 個 Rich Menu handler
 */
export function describeEvent(event: WebhookEvent): string {
  switch (event.type) {
    case 'message':
      if (event.message.type === 'text') return `你說:${event.message.text}`;
      return `[收到 ${event.message.type} 訊息]`;
    case 'follow':
      return '歡迎加入!請點下方主選單開始使用 🙂';
    case 'unfollow':
      return '';
    case 'postback':
      return getPostbackReply(event.postback.data);
    default:
      return `[event: ${event.type}]`;
  }
}

/**
 * Rich Menu postback 對應的回覆文字。
 * 對齊提案 v5 的 5 格(本月課程 / 最新消息 / 商品專區=URI / 進階教室 / 專屬客服)。
 * v1 placeholder,小編後台 / DB / flex message 之後升級。
 */
function getPostbackReply(data: string): string {
  const params = new URLSearchParams(data);
  const action = params.get('action');

  switch (action) {
    case 'monthly-classes':
      return [
        '📅 本月課程',
        '',
        '台北 / 台中 / 高雄 / 台南 四區課表建置中,',
        '小編後台上線後會在這裡更新本月 16 場次。',
        '',
        '目前想預約或詢問課程,請直接留言。',
      ].join('\n');

    case 'news':
      return [
        '📰 最新消息',
        '',
        '年會、領袖挑戰營、組織重要公告 將發布在這裡。',
        '(內容更新功能建置中)',
      ].join('\n');

    case 'advanced':
      return [
        '🎓 進階教室',
        '',
        '組織內部進階培訓資訊與報名入口。',
        '初期請點【💬 專屬客服】詢問,後續會改為關鍵字觸發。',
      ].join('\n');

    case 'contact':
      return [
        '💬 專屬客服',
        '',
        '— 常見問題 —',
        '• 訂單 / 出貨進度 → 請提供訂單編號或下單姓名',
        '• 課程報名 / 變更 → 請提供姓名 + 課程名稱',
        '• 商品諮詢 → 直接描述需求,我們幫你推薦',
        '',
        '— 客服時間 —',
        '週一至週五 10:00 – 18:00',
        '非營業時間留言我們上線會回覆 🙂',
        '',
        '需要真人立刻處理,請輸入「真人」。',
      ].join('\n');

    default:
      return `[未識別 postback: ${data}]`;
  }
}
