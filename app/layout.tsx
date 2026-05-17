import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Family LINE Bot',
  description: 'NEO Potential Studio - 家族事業 LINE Bot',
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
