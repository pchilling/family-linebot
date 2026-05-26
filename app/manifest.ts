import type { MetadataRoute } from 'next';

/**
 * PWA manifest:讓用戶把網頁加到主畫面當 App。
 * - Admin 用戶(老師):主畫面 NEOP STALL icon → 開啟即進管理頁
 * - 學員透過 LIFF 進來,LIFF 本身就是 webview 不靠 PWA
 * - 訪客逛公開頁 /oilswa 也可加到主畫面當「我家攤位」App
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NEOP STALL · 多攤位電商 + LINE Bot',
    short_name: 'NEOP STALL',
    description: 'NEO Potential Studio — 多攤位 LINE 商務平台',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0A0A0A',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
