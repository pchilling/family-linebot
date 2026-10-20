/**
 * 商品編輯頁載入骨架(2026-10-20):點「編輯」的瞬間先顯示頁首 + 分頁 + 表格輪廓。
 */
export default function Loading() {
  return (
    <main style={{ padding: '24px 32px 56px' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`,
        }}
      />
      <Bar w={92} h={38} r={999} mb={14} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Bar w={56} h={70} r={8} />
          <div>
            <Bar w={200} h={22} mb={8} />
            <Bar w={260} h={12} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Bar w={96} h={36} r={8} />
          <Bar w={110} h={36} r={8} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid #e4e4e7', marginBottom: 18, paddingBottom: 10 }}>
        {[84, 64, 84, 40].map((w, i) => <Bar key={i} w={w} h={16} />)}
      </div>
      <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <Bar w={40} h={14} mb={6} />
            <Bar w={280} h={11} />
          </div>
          <Bar w={92} h={34} r={8} />
        </div>
        <div style={{ height: 36, background: '#fafafa', borderBottom: '1px solid #e4e4e7' }} />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderBottom: '1px solid #f4f4f5' }}>
            <Bar w={56} h={24} r={5} />
            <Bar w={200} h={32} r={7} />
            <Bar w={90} h={32} r={7} />
            <Bar w={80} h={32} r={7} />
            <Bar w={72} h={32} r={7} />
            <Bar w={84} h={32} r={7} />
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
