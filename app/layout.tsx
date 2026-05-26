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
  title: 'NEOP STALL · LINE Bot 商務平台',
  description: 'NEO Potential Studio — 多攤位 LINE Bot + 電商',
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
          fontFamily:
            'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
