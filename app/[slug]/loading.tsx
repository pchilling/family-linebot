/**
 * 公開攤位首頁 loading skeleton。
 * 學員 / 客人點商品連結時馬上看畫面骨架,不再 blank。
 */
export default function Loading() {
  return (
    <div>
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

      {/* Banner placeholder */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1200 / 630',
          background: '#e4e4e7',
          borderRadius: 10,
          marginBottom: '2rem',
          animation: 'skeleton-pulse 1.4s ease-in-out infinite',
        }}
      />

      {/* Products grid placeholder */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <ProductCard key={i} />
        ))}
      </div>
    </div>
  );
}

function ProductCard() {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 5',
          background: '#e4e4e7',
          animation: 'skeleton-pulse 1.4s ease-in-out infinite',
        }}
      />
      <div style={{ padding: '0.875rem 1rem 1rem' }}>
        <div
          style={{
            height: 16,
            background: '#e4e4e7',
            borderRadius: 4,
            marginBottom: 8,
            animation: 'skeleton-pulse 1.4s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 12,
            width: '60%',
            background: '#e4e4e7',
            borderRadius: 4,
            animation: 'skeleton-pulse 1.4s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  );
}
