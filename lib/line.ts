import crypto from 'node:crypto';
import { messagingApi, WebhookEvent } from '@line/bot-sdk';
import type { ClassRow } from './supabase';

const { MessagingApiClient } = messagingApi;

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

export const lineClient = new MessagingApiClient({
  channelAccessToken,
});

/**
 * LINE webhook 簽章驗證
 * LINE 用 channel secret 對 request body 做 HMAC-SHA256 base64,放 x-line-signature header
 * 用 timingSafeEqual 比對避免 timing attack
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac('SHA256', channelSecret)
    .update(rawBody)
    .digest('base64');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * 取 event 的回覆文字
 * - message:echo
 * - follow:歡迎
 * - postback:根據 action= 切 Rich Menu handler
 *
 * 簽到不走 keyword(老人不打字),只走教室 QR → /m/checkin?class_id=xxx
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

    case 'contact':
      return [
        '💬 專屬客服',
        '',
        '— 常見問題 —',
        '• 訂單 / 出貨進度 → 請提供訂單編號或下單姓名',
        '• 課程報名 / 變更 → 請提供姓名 + 課程名稱',
        '• 商品諮詢 → 直接描述需求,我們幫你推薦',
        '• 進階教室 / 組織內部培訓 → 請輸入「進階」我們會跟你聯繫',
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

/**
 * 把 DB classes 列表組成本月課程 reply text(以台灣時區顯示)。
 * 分台北 / 台中 / 高雄 / 台南 四區。
 */
export function formatMonthlyClassesText(classes: ClassRow[]): string {
  if (classes.length === 0) {
    return [
      '📅 本月課程',
      '',
      '本月尚未公告課程,請留言詢問或關注最新消息。',
    ].join('\n');
  }

  const byRegion: Record<string, ClassRow[]> = {};
  for (const c of classes) {
    const region = c.regions?.name ?? '其他';
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(c);
  }

  const regions = ['台北', '台中', '高雄', '台南'];
  const lines: string[] = ['📅 本月課程'];

  for (const region of regions) {
    const rows = byRegion[region];
    if (!rows || rows.length === 0) continue;
    lines.push('');
    lines.push(`【${region}】`);
    for (const c of rows) {
      lines.push(`• ${formatClassLine(c)}`);
    }
  }

  // 非標準區域 fallback
  for (const region of Object.keys(byRegion)) {
    if (regions.includes(region)) continue;
    lines.push('');
    lines.push(`【${region}】`);
    for (const c of byRegion[region]) {
      lines.push(`• ${formatClassLine(c)}`);
    }
  }

  lines.push('');
  lines.push('想預約 / 報名請直接留言。');
  return lines.join('\n');
}

function formatClassLine(c: ClassRow): string {
  const dt = new Date(c.scheduled_at);
  const dateStr = dt.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
  });
  const wd = dt.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    weekday: 'narrow',
  });
  const timeStr = dt.toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const priceTag = c.is_paid
    ? ` (收費 NT$ ${c.price_twd ?? '-'})`
    : '';
  return `${dateStr}(${wd}) ${timeStr} ${c.name}${priceTag}`;
}
