import type { Metadata, Viewport } from 'next';

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
  themeColor: '#18181b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
