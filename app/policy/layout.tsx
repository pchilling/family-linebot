import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '條款 / 政策 · NEOP STALL',
  description: 'NEOP STALL 服務條款、隱私權政策、退款與寄送說明。',
};

const policies = [
  { href: '/policy/terms', label: '服務條款' },
  { href: '/policy/privacy', label: '隱私權政策' },
  { href: '/policy/refund', label: '退款政策' },
  { href: '/policy/shipping', label: '寄送說明' },
];

export default function PolicyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        color: '#18181b',
        fontFamily:
          'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '40px 24px 60px',
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          style={{
            display: 'inline-block',
            fontSize: 12,
            color: '#71717a',
            textDecoration: 'none',
            marginBottom: 24,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          ← NEOP STALL
        </Link>

        {/* 律師審核警告 */}
        <div
          style={{
            padding: '12px 16px',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            color: '#92400e',
            fontSize: 12,
            borderRadius: 8,
            marginBottom: 28,
            lineHeight: 1.6,
          }}
        >
          ⚠️ <strong>本頁面為平台初版範本</strong>,**未經律師審核**。實際對外營運前請委請律師審閱並依業務狀況調整。
        </div>

        {/* Policy nav */}
        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 36,
            paddingBottom: 18,
            borderBottom: '1px solid #e4e4e7',
          }}
        >
          {policies.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                color: '#52525b',
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: 999,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        {children}

        {/* Footer */}
        <footer
          style={{
            marginTop: 60,
            paddingTop: 24,
            borderTop: '1px solid #e4e4e7',
            fontSize: 12,
            color: '#71717a',
            lineHeight: 1.7,
            textAlign: 'center',
          }}
        >
          <div>本平台由 NEO Potential Studio 維運</div>
          <div>聯絡 / 客服:<a href="mailto:peter@neop.tw" style={{ color: '#52525b' }}>peter@neop.tw</a></div>
        </footer>
      </main>
    </div>
  );
}
