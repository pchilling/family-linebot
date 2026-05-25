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
 * - message text:keyword 命中才回(不再 echo「你說:XX」,避免吵)
 *   → 學員在 support mode 內打字 silent 紀錄 + broadcast,bot 不講話
 * - non-text message:silent(LINE@ Manager 直接看)
 * - follow:歡迎
 * - postback:根據 action= 切 Rich Menu handler
 *
 * 簽到不走 keyword(老人不打字),只走教室 QR → /m/checkin?class_id=xxx
 */
export function describeEvent(event: WebhookEvent): string {
  switch (event.type) {
    case 'message':
      if (event.message.type === 'text') {
        return getKeywordReply(event.message.text) ?? '';
      }
      return '';
    case 'follow':
      return '歡迎加入!請點下方主選單開始使用 🙂';
    case 'unfollow':
      return '';
    case 'postback':
      return getPostbackReply(event.postback.data);
    default:
      return '';
  }
}

/**
 * Text message keyword 觸發。沒命中回 null,讓 caller 走 echo fallback。
 *
 * 注:「真人」keyword 已拿掉(2026-05-21)— 改用客服 postback + Quick Reply 按鈕 explicit flow。
 * 避免學員打字當作客服請求被誤 capture。
 */
function getKeywordReply(text: string): string | null {
  const t = text.trim();
  if (t === '進階' || /^advance(d)?$/i.test(t)) {
    return [
      '🌿 進階教室',
      '',
      '進階教室是給已參加過基礎課的學員深入學習芳療 / 精油應用的課程系列。',
      '',
      '想了解更多請點主選單「💬 專屬客服」聯繫我們。',
    ].join('\n');
  }
  return null;
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
        '• 訂單 / 出貨進度',
        '• 課程報名 / 變更',
        '• 商品諮詢 / 推薦',
        '• 進階教室 / 組織培訓',
        '',
        '— 客服時間 —',
        '週一至週五 10:00 – 18:00',
        '非營業時間留言我們上線會回覆 🙂',
        '',
        '👇 想開始請按下方按鈕',
      ].join('\n');

    case 'start_support':
      return [
        '🙋 我們在聽',
        '',
        '請描述您的問題,我們收到後會盡快回覆。',
        '',
        '(接下來 30 分鐘內您打的訊息會被標記為客服請求,客服上線就會看到)',
      ].join('\n');

    case 'cancel_support':
      return [
        '好的 👌',
        '',
        '有需要再點主選單的「💬 專屬客服」即可。',
      ].join('\n');

    default:
      return `[未識別 postback: ${data}]`;
  }
}

/**
 * 客服 postback 用的 Quick Reply 按鈕 — 「我要詢問」/「取消」
 * 學員按客服 → bot 回 FAQ + 這兩個 chip 在輸入框上方
 * 按「我要詢問」 → action=start_support → 進 support mode
 * 按「取消」 → action=cancel_support → 不進
 */
export function getContactQuickReplyItems(): messagingApi.QuickReplyItem[] {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: '📝 我要詢問',
        data: 'action=start_support',
        displayText: '我要詢問',
      },
    },
    {
      type: 'action',
      action: {
        type: 'postback',
        label: '取消',
        data: 'action=cancel_support',
        displayText: '取消',
      },
    },
  ];
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

/**
 * 把本月課程組成 LINE Flex Carousel(Phase C,2026-05-25)。
 * 每場活動一張 bubble:cover 圖 + 名 + 時間 + 地點 + 「報名」button → LIFF /m/events。
 * 最多 12 場(LINE 上限),超過取前 10。
 * 沒任何活動或 LIFF_ID_EVENTS 缺,回 null(caller fallback text 版)。
 */
export function buildMonthlyClassesFlex(
  classes: ClassRow[],
): messagingApi.FlexMessage | null {
  if (classes.length === 0) return null;
  const liffEventsId = process.env.NEXT_PUBLIC_LIFF_ID_EVENTS ?? process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffEventsId) return null;
  const eventsUrl = `https://liff.line.me/${liffEventsId}`;
  const fallbackImage = 'https://family-linebot-delta.vercel.app/icon.svg';

  const bubbles: messagingApi.FlexBubble[] = classes.slice(0, 10).map((c) => {
    const dt = new Date(c.scheduled_at);
    const dateStr = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
    const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'narrow' });
    const timeStr = dt.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
    const region = c.regions?.name ?? '';

    // 狀態 badge — 只有收費課 + 有 capacity 才算
    // 已滿:紅;剩 ≤3 位:橘;剩 >3 位:綠;沒設 capacity 不顯示
    const confirmed = c.confirmed_count ?? 0;
    const waitlist = c.waitlist_count ?? 0;
    const cap = c.capacity;
    let badgeText = '';
    let badgeColor = '';
    let badgeBg = '';
    if (c.is_paid && cap !== null && cap > 0) {
      const remaining = Math.max(0, cap - confirmed);
      if (remaining === 0) {
        badgeText = waitlist > 0 ? `🔴 已滿 · 候補 ${waitlist}` : '🔴 已滿';
        badgeColor = '#dc2626';
        badgeBg = '#fef2f2';
      } else if (remaining <= 3) {
        badgeText = `🟠 僅剩 ${remaining} 位`;
        badgeColor = '#d97706';
        badgeBg = '#fff7ed';
      } else {
        badgeText = `🟢 還有 ${remaining} 位`;
        badgeColor = '#16a34a';
        badgeBg = '#f0fdf4';
      }
    }

    const bodyContents: messagingApi.FlexBox['contents'] = [];
    if (badgeText) {
      bodyContents.push({
        type: 'box' as const,
        layout: 'baseline' as const,
        contents: [
          {
            type: 'text' as const,
            text: badgeText,
            size: 'xs',
            color: badgeColor,
            weight: 'bold',
          },
        ],
        backgroundColor: badgeBg,
        cornerRadius: 'md',
        paddingAll: 'sm',
        paddingStart: 'md',
        paddingEnd: 'md',
        margin: 'none',
      });
    }
    bodyContents.push({
      type: 'text' as const,
      text: c.name,
      weight: 'bold',
      size: 'md',
      wrap: true,
      color: '#18181b',
      margin: badgeText ? 'md' : 'none',
    });
    bodyContents.push({
      type: 'text' as const,
      text: `📅 ${dateStr}(${wd})${timeStr}`,
      size: 'xs',
      color: '#52525b',
      margin: 'sm',
    });
    if (region) {
      bodyContents.push({
        type: 'text' as const,
        text: `📍 ${region}`,
        size: 'xs',
        color: '#71717a',
        margin: 'xs',
      });
    }
    if (c.instructor) {
      bodyContents.push({
        type: 'text' as const,
        text: `👤 ${c.instructor}`,
        size: 'xs',
        color: '#71717a',
        margin: 'xs',
      });
    }
    if (c.is_paid && c.price_twd) {
      bodyContents.push({
        type: 'text' as const,
        text: `💰 NT$ ${c.price_twd}`,
        size: 'xs',
        color: '#92400e',
        weight: 'bold',
        margin: 'xs',
      });
    }
    // 課程介紹(若有)— 支援 \n 換行,最多 6 行,150 字以內
    if (c.description) {
      const desc = c.description.length > 150 ? c.description.slice(0, 150) + '…' : c.description;
      bodyContents.push({
        type: 'separator' as const,
        margin: 'md',
        color: '#e4e4e7',
      });
      bodyContents.push({
        type: 'text' as const,
        text: desc,
        size: 'sm', // 大一點(原 xs 太小)
        color: '#374151',
        wrap: true, // 配合 \n 換行才會生效
        margin: 'md',
        maxLines: 6,
      });
    }
    if (!c.is_paid) {
      bodyContents.push({
        type: 'box' as const,
        layout: 'baseline' as const,
        margin: 'md',
        contents: [
          {
            type: 'text' as const,
            text: '🆓 免費課程 · 直接到場',
            size: 'xs',
            color: '#16a34a',
            weight: 'bold',
          },
        ],
      });
    }

    return {
      type: 'bubble' as const,
      size: 'kilo' as const,
      hero: {
        type: 'image' as const,
        url: c.image_url ?? fallbackImage,
        size: 'full' as const,
        aspectRatio: '4:5' as const, // 4:5 直式,跟商品 / IG 同感
        aspectMode: 'cover' as const,
        action: {
          type: 'uri' as const,
          label: '查看',
          uri: eventsUrl,
        },
      },
      body: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'none' as const,
        contents: bodyContents,
      },
      footer: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: c.is_paid ? '#18181b' : '#71717a',
            height: 'sm' as const,
            action: {
              type: 'uri' as const,
              label: c.is_paid ? '立刻報名' : '查看詳情',
              uri: eventsUrl,
            },
          },
        ],
      },
    };
  });

  return {
    type: 'flex',
    altText: `本月課程 ${classes.length} 場`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 把最新消息組成 LINE Flex Carousel(Phase 7.10,2026-05-25)。
 * 解原本純文字 reply 的問題:
 *   1. 內文有數字會被 LINE auto-link 變藍(電話樣式)
 *   2. 多則公告擠一坨難讀
 * 每則 1 個 bubble:📰 icon + 日期 + 粗體標題 + separator + 內文(wrap,maxLines 10)。
 * 沒任何 news 回 null,caller fallback 純文字。
 */
export type NewsForFlex = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  published_at: string;
};

export function buildNewsFlex(items: NewsForFlex[]): messagingApi.FlexMessage | null {
  if (items.length === 0) return null;

  const bubbles: messagingApi.FlexBubble[] = items.slice(0, 10).map((n) => {
    const dateStr = n.published_at
      ? new Date(n.published_at).toLocaleDateString('zh-TW', {
          timeZone: 'Asia/Taipei',
          month: 'numeric',
          day: 'numeric',
        })
      : '';

    const bodyContents: messagingApi.FlexBox['contents'] = [
      {
        type: 'text' as const,
        text: n.title,
        weight: 'bold' as const,
        size: 'lg',
        color: '#18181b',
        wrap: true,
        maxLines: 3,
      },
    ];
    if (dateStr) {
      bodyContents.push({
        type: 'text' as const,
        text: `日期:${dateStr}`,
        size: 'xs',
        color: '#71717a',
        margin: 'sm',
      });
    }

    if (n.body && n.body.trim().length > 0) {
      // 不截行數,字數防呆 2000(LINE Flex JSON 上限 50KB)
      const text = n.body.length > 2000 ? n.body.slice(0, 2000) + '…' : n.body;
      bodyContents.push({
        type: 'separator' as const,
        margin: 'md',
        color: '#e4e4e7',
      });
      bodyContents.push({
        type: 'text' as const,
        text,
        size: 'sm',
        color: '#374151',
        wrap: true,
        margin: 'md',
      });
    }

    const bubble: messagingApi.FlexBubble = {
      type: 'bubble' as const,
      size: 'mega' as const,
      body: {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'none' as const,
        paddingAll: 'lg' as const,
        contents: bodyContents,
      },
    };

    // 如果有 link_url,加 footer button
    if (n.link_url && n.link_url.trim().length > 0) {
      bubble.footer = {
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'sm' as const,
        contents: [
          {
            type: 'button' as const,
            style: 'primary' as const,
            color: '#18181b',
            height: 'sm' as const,
            action: {
              type: 'uri' as const,
              label: '🔗 開啟連結',
              uri: n.link_url.trim(),
            },
          },
        ],
      };
    }

    return bubble;
  });

  return {
    type: 'flex',
    altText: `最新消息 ${items.length} 則`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
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
