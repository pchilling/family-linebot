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
  // Layout:上 3 + 下 2(OILS_WA_五區塊合併_1527x1030,2026-09-17)
  // 圖片頂部有 logo 橫幅,併入上排點擊區(點到照樣觸發該欄按鈕):
  //   上下排分界 y=640(卡片間隙中線)
  //   上排三格分界 x=525 / 1000,下排兩格分界 x=765
  // 下排右格是「Q&A 專屬客服」合併卡 → action=contact
  // (開場文同時給 QA 按鈕與真人客服說明)
  // ====================
  const TOP_X1 = 525;
  const TOP_X2 = 1000;
  const BOT_X = 765;
  const ROW_Y = 640;
  const W = 1527;
  const FULL_H = 1030;

  const richMenu = {
    size: { width: W, height: FULL_H },
    selected: true,
    name: 'family-linebot default',
    chatBarText: '主選單',
    areas: [
      // 上排
      {
        // 卡面文字「三合一行動能量體系課程」= 本月課程列表
        bounds: { x: 0, y: 0, width: TOP_X1, height: ROW_Y },
        action: { type: 'postback' as const, data: 'action=monthly-classes', displayText: '📅 本月課程' },
      },
      {
        bounds: { x: TOP_X1, y: 0, width: TOP_X2 - TOP_X1, height: ROW_Y },
        action: { type: 'postback' as const, data: 'action=news', displayText: '📰 最新消息' },
      },
      {
        // 商品專區:LIFF /m/shop(profile gating + LINE userId binding)
        bounds: { x: TOP_X2, y: 0, width: W - TOP_X2, height: ROW_Y },
        action: { type: 'uri' as const, uri: 'https://liff.line.me/2010125926-aPB1bQtE', label: '🛍 商品專區' },
      },
      // 下排
      {
        bounds: { x: 0, y: ROW_Y, width: BOT_X, height: FULL_H - ROW_Y },
        action: { type: 'uri' as const, uri: 'https://liff.line.me/2010125926-mRl3l3lO', label: '👤 會員中心' },
      },
      {
        // Q&A 專屬客服合併卡:contact 開場 = QA chips + 真人客服說明
        bounds: { x: BOT_X, y: ROW_Y, width: W - BOT_X, height: FULL_H - ROW_Y },
        action: { type: 'postback' as const, data: 'action=contact', displayText: 'Q&A 專屬客服' },
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
