import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '退款政策 · NEOP STALL',
};

export default function RefundPage() {
  return (
    <article style={prose}>
      <h1 style={h1}>退款政策</h1>
      <p style={meta}>上次更新:2026-06-04(初版範本)</p>

      <section>
        <h2 style={h2}>一、退換貨期限(7 日鑑賞期)</h2>
        <p>
          依《消費者保護法》第 19 條,你享有商品收到後 **7 日內**
          無條件解除契約之權利(俗稱「7 日鑑賞期」)。請於該期限內以
          Email 或 LINE 訊息通知賣家欲退貨。
        </p>
        <p style={small}>
          ⚠️ **不適用 7 日鑑賞期**之商品(依消保法施行細則第 17 條):
          客製化商品、易腐敗 / 期限商品、報紙雜誌、已拆封之影音 / 軟體 / 個人衛生用品。
          上架時應於商品頁面明確標示。
        </p>
      </section>

      <section>
        <h2 style={h2}>二、退款條件</h2>
        <ul style={ul}>
          <li>商品**未拆封 / 未使用**,且包裝完整、配件齊全</li>
          <li>於收到商品後 7 日內(含寄回的物流時間)主動聯繫</li>
          <li>非屬上述不適用之商品類型</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>三、瑕疵 / 寄錯 / 短少</h2>
        <p>
          如收到商品**瑕疵、與描述不符、寄錯品項、短少**,請於 3 日內附**照片**
          以 LINE / Email 通知賣家。賣家會無條件接受退貨,**運費由賣家負擔**。
        </p>
      </section>

      <section>
        <h2 style={h2}>四、退款方式</h2>
        <ul style={ul}>
          <li><strong>原路退款</strong>:LINE Pay / 信用卡(若有接金流時)</li>
          <li><strong>銀行匯款退回</strong>:請提供帳戶資料,3-5 工作天內匯回</li>
          <li><strong>下次訂單折抵</strong>(經買賣雙方同意)</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>五、退款時間</h2>
        <ul style={ul}>
          <li>賣家收到退回商品並驗收完成後 **7 工作天內**處理退款</li>
          <li>金流業者實際入帳時間以該業者規定為準</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>六、運費負擔</h2>
        <ul style={ul}>
          <li>**正常 7 日鑑賞期退貨**:消費者負擔退回運費</li>
          <li>**商品瑕疵 / 寄錯 / 短少**:賣家負擔來回運費</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>七、無法退貨情況</h2>
        <ul style={ul}>
          <li>已過 7 日鑑賞期(以宅配到貨日為起算)</li>
          <li>已拆封使用之個人衛生 / 食品 / 易腐敗品</li>
          <li>客製化商品(姓名刻印、訂做尺寸等)</li>
          <li>商品包裝、配件、贈品有缺漏</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>八、爭議處理</h2>
        <p>
          如對退款結果有爭議,得向**中華民國消費者文教基金會**申訴,
          或循行政院消費者保護會法定程序處理。
        </p>
      </section>

      <section>
        <h2 style={h2}>九、聯絡方式</h2>
        <p>
          退款 / 退貨申請:<a href="mailto:peter@neop.tw" style={link}>peter@neop.tw</a>
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
const small: React.CSSProperties = {
  fontSize: 12,
  color: '#71717a',
  background: '#fafafa',
  padding: '10px 14px',
  borderRadius: 6,
  border: '1px solid #e4e4e7',
};
const link: React.CSSProperties = {
  color: '#0070f3',
};
