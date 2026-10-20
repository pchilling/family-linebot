/**
 * 商品列表載入骨架(2026-10-20):點進商品頁的瞬間先顯示表格輪廓,不空白。
 */
export default function Loading() {
  return (
    <main style={{ padding: '24px 32px 48px' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <Bar w={120} h={24} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Bar w={84} h={36} r={8} />
          <Bar w={104} h={36} r={8} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Bar w={320} h={36} r={7} />
        <Bar w={64} h={36} r={7} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[72, 56, 64, 56, 72, 90, 56].map((w, i) => <Bar key={i} w={w} h={30} r={999} />)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: 38, background: '#fafafa', borderBottom: '1px solid #e4e4e7' }} />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderBottom: '1px solid #f4f4f5' }}>
            <Bar w={44} h={56} r={6} />
            <div style={{ flex: 1 }}>
              <Bar w={180} h={14} mb={6} />
              <Bar w={120} h={11} />
            </div>
            <Bar w={110} h={14} />
            <Bar w={200} h={28} r={6} />
            <Bar w={96} h={30} r={8} />
            <Bar w={64} h={30} r={7} />
          </div>
        ))}
      </div>
    </main>
  );
}

function Bar({ w = '100%', h = 14, mb = 0, r = 4 }: { w?: string | number; h?: number; mb?: number; r?: number }) {
  return (
    <div style={{ width: w, height: h, marginBottom: mb, background: '#e4e4e7', borderRadius: r, animation: 'sk-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
  );
}
