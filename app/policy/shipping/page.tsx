import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '寄送說明 · NEOP STALL',
};

export default function ShippingPage() {
  return (
    <article style={prose}>
      <h1 style={h1}>寄送說明</h1>
      <p style={meta}>上次更新:2026-06-04(初版範本)</p>

      <section>
        <h2 style={h2}>一、寄送方式</h2>
        <p>實際寄送方式以各攤位於商品頁說明為準,常見選項:</p>
        <ul style={ul}>
          <li><strong>宅配</strong>(黑貓 / 新竹貨運 / 嘉里大榮等)</li>
          <li><strong>超商取貨</strong>(7-11 交貨便、全家店到店)</li>
          <li><strong>面交 / 自取</strong>(同城內,由賣家安排)</li>
          <li><strong>郵局掛號</strong>(輕量商品)</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>二、出貨時程</h2>
        <ul style={ul}>
          <li><strong>確認付款後 1-3 工作天</strong>內出貨(週六日 / 國定假日順延)</li>
          <li>大量訂單 / 預購商品 / 客製商品另行於商品頁說明</li>
          <li>出貨後將透過 LINE 推送出貨通知(若已加 bot 為好友)</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>三、運費</h2>
        <ul style={ul}>
          <li>實際運費依商品重量、體積、寄送地區及方式計算</li>
          <li>於結帳頁面顯示明細</li>
          <li>部分攤位可能提供**滿額免運**(以該攤位公告為準)</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>四、寄送範圍</h2>
        <ul style={ul}>
          <li>**台灣本島**:全區可寄</li>
          <li>**離島**(澎湖 / 金門 / 馬祖):另計運費或部分商品不寄</li>
          <li>**海外**:除非攤位明確標示,否則不寄</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>五、缺貨 / 無法出貨</h2>
        <p>
          若收到訂單後發現缺貨 / 無法出貨,賣家將於 2 工作天內主動聯絡並協商:
        </p>
        <ul style={ul}>
          <li>更換相似商品(經買家同意)</li>
          <li>等待補貨(告知預計時程)</li>
          <li>全額退款</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>六、收件人不在 / 簽收問題</h2>
        <ul style={ul}>
          <li>宅配:第二次配送失敗 → 退回賣家,後續再寄需重新計費</li>
          <li>超商:逾時(通常 7 天)未取 → 退回賣家</li>
          <li>退回賣家後,如要再寄請聯繫客服,運費由買家負擔</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>七、貨件遺失 / 物流毀損</h2>
        <p>
          收到包裹**立即驗收**。若有外觀破損 / 內容物受損,**請當下拍照存證**
          並於 24 小時內通知賣家。賣家會與物流公司申訴並協助處理。
        </p>
      </section>

      <section>
        <h2 style={h2}>八、聯絡方式</h2>
        <p>
          寄送 / 物流問題:<a href="mailto:peter@neop.tw" style={link}>peter@neop.tw</a>
        </p>
      </section>
    </article>
  );
}

const prose: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.8,
  color: '#3f3f46',
};
const h1: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: '#18181b',
  margin: '0 0 6px',
  letterSpacing: '-0.01em',
};
const meta: React.CSSProperties = {
  fontSize: 12,
  color: '#a1a1aa',
  margin: '0 0 28px',
};
const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#18181b',
  margin: '32px 0 12px',
};
const ul: React.CSSProperties = {
  paddingLeft: 22,
  margin: '0 0 12px',
};
const link: React.CSSProperties = {
  color: '#0070f3',
};
