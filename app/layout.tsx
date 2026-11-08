import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';

/**
 * Phase 8.2(2026-05-26):全站字型統一 Space Grotesk + JetBrains Mono。
 * CSS var name 沿用 `--font-geist-*` 是 legacy(原本載 Geist),
 * 留著免改 8 處引用點;實際字型已換。
 */
const displaySans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

const displayMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEOP STALL 管理後台',
  description: '登入管理你的攤位',
  appleWebApp: {
    capable: true,
    title: 'NEOP STALL',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0A0A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" className={`${displaySans.variable} ${displayMono.variable}`}>
      <body
        style={{
          // 2026-09-18:瀏覽器 body 預設 8px 邊距會在頁面四周露出白框(內層底色蓋不到),全站歸零
          margin: 0,
          fontFamily:
            'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
        }}
      >
        {/* Phase 39(2026-11-08):字級跟隨系統設定 — html 字級 100%(跟瀏覽器 / Android 的字型大小設定走),
            iOS Safari 要用 -apple-system-body 才會吃「放大文字」;顧客頁的字級已全部改成 rem,admin 維持 px 不受影響 */}
        <style
          dangerouslySetInnerHTML={{
            __html: 'html{font-size:100%}@supports (font:-apple-system-body){html{font:-apple-system-body}}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
