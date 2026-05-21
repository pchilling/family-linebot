/**
 * Dashboard loading skeleton。Next.js Suspense 自動切換,
 * 點 admin 進來時馬上看畫面骨架,不再 blank。
 */
export default function Loading() {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
          `,
        }}
      />
      {/* Hero skeleton */}
      <div style={{ marginBottom: 40 }}>
        <Bar w={140} h={11} mb={8} />
        <Bar w={280} h={32} />
      </div>

      {/* Metric cards skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} />
        ))}
      </div>

      {/* List sections skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 24,
        }}
      >
        {[0, 1].map((i) => (
          <ListCard key={i} />
        ))}
      </div>
    </div>
  );
}

function Card() {
  return (
    <div
      style={{
        padding: 20,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 8,
      }}
    >
      <Bar w={80} h={10} mb={12} />
      <Bar w={120} h={28} mb={6} />
      <Bar w={100} h={11} />
    </div>
  );
}

function ListCard() {
  return (
    <div
      style={{
        padding: 24,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 8,
      }}
    >
      <Bar w={120} h={18} mb={20} />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: '12px 0',
            borderTop: i > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
          }}
        >
          <Bar w="60%" h={14} mb={6} />
          <Bar w="40%" h={11} />
        </div>
      ))}
    </div>
  );
}

function Bar({
  w = '100%',
  h = 14,
  mb = 0,
}: {
  w?: string | number;
  h?: number;
  mb?: number;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        marginBottom: mb,
        background: '#e4e4e7',
        borderRadius: 4,
        animation: 'skeleton-pulse 1.4s ease-in-out infinite',
      }}
    />
  );
}
