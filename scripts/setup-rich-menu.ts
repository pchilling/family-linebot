/**
 * 建立 / 更新 Family LINE Bot 的 Rich Menu。
 *
 * 用法:
 *   npm run setup:rich-menu -- <image-path>
 *   e.g. npm run setup:rich-menu -- ./assets/rich-menu.png
 *
 * 圖片規格:2500 x 1686 px(或 2500 x 843 半高),png / jpg
 *
 * 流程:
 *   1. createRichMenu(layout + actions)→ 拿 richMenuId
 *   2. setRichMenuImage 上傳圖片
 *   3. setDefaultRichMenu 設為所有 user 預設選單
 *   印出 richMenuId,記到 tenants.rich_menu_id
 */

import fs from 'node:fs';
import path from 'node:path';
import { messagingApi } from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN in env(check .env.local)');
    process.exit(1);
  }

  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run setup:rich-menu -- <image-path>');
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  const client = new MessagingApiClient({ channelAccessToken: token });
  const blobClient = new MessagingApiBlobClient({ channelAccessToken: token });

  // ====================
  // Layout:上 3 + 下 2(對齊提案 v5 的 5 格設計)
  // 上排:3 欄各 833 / 833 / 834,高 843
  // 下排:2 欄各 1250,高 843
  // ====================
  const TOP_W1 = 833;
  const TOP_W2 = 833;
  const TOP_W3 = 834;
  const BOT_W = 1250;
  const H = 843;

  const richMenu = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'family-linebot default',
    chatBarText: '主選單',
    areas: [
      // 上排
      {
        bounds: { x: 0, y: 0, width: TOP_W1, height: H },
        action: { type: 'postback' as const, data: 'action=monthly-classes', displayText: '📅 本月課程' },
      },
      {
        bounds: { x: TOP_W1, y: 0, width: TOP_W2, height: H },
        action: { type: 'postback' as const, data: 'action=news', displayText: '📰 最新消息' },
      },
      {
        // 商品專區:URI action 直接開愛油哇現有網頁,之後切到自製網頁
        bounds: { x: TOP_W1 + TOP_W2, y: 0, width: TOP_W3, height: H },
        action: { type: 'uri' as const, uri: 'https://www.oilswa.com.tw/', label: '🛍 商品專區' },
      },
      // 下排
      {
        bounds: { x: 0, y: H, width: BOT_W, height: H },
        // 會員中心走 LIFF webview(URI 開 LIFF 短連結)
        action: { type: 'uri' as const, uri: 'https://liff.line.me/2010125926-mRl3l3lO', label: '👤 會員中心' },
      },
      {
        bounds: { x: BOT_W, y: H, width: BOT_W, height: H },
        action: { type: 'postback' as const, data: 'action=contact', displayText: '💬 專屬客服' },
      },
    ],
  };

  console.log('1. createRichMenu …');
  const { richMenuId } = await client.createRichMenu(richMenu);
  console.log(`   richMenuId = ${richMenuId}`);

  console.log('2. uploadRichMenuImage …');
  const imageBuffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  await blobClient.setRichMenuImage(
    richMenuId,
    new Blob([imageBuffer], { type: contentType }),
  );

  console.log('3. setDefaultRichMenu …');
  await client.setDefaultRichMenu(richMenuId);

  console.log('\nDone.');
  console.log(`richMenuId: ${richMenuId}`);
  console.log('→ 把這個 ID 存到 tenants.rich_menu_id');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
