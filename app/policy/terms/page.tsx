import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務條款 · NEOP STALL',
};

export default function TermsPage() {
  return (
    <article style={prose}>
      <h1 style={h1}>服務條款</h1>
      <p style={meta}>上次更新:2026-06-04(初版範本)</p>

      <section>
        <h2 style={h2}>一、平台說明</h2>
        <p>
          NEOP STALL(下稱「本平台」)由 NEO Potential Studio 維運,提供賣家(以下稱「攤位」)
          建立線上店面與接收訂單之服務。本平台僅作為**技術仲介**,不直接參與
          買賣雙方之實際交易。
        </p>
      </section>

      <section>
        <h2 style={h2}>二、用戶責任</h2>
        <ul style={ul}>
          <li>提供真實之姓名、聯絡資料、寄送地址</li>
          <li>不得使用本平台從事違法、詐欺、騷擾、侵權等行為</li>
          <li>妥善保管登入帳號 / 密碼,因疏忽外洩造成之損失自負</li>
          <li>不得試圖破壞、濫用、繞過本平台技術措施</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>三、攤位責任</h2>
        <ul style={ul}>
          <li>商品資訊(名稱、價格、規格、庫存、出貨時程)應真實準確</li>
          <li>收到訂單後應於合理時程內出貨或主動告知無法出貨</li>
          <li>商品瑕疵 / 短少 / 與描述不符時,應依退款政策處理</li>
          <li>遵守中華民國消費者保護法、公平交易法等相關法令</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>四、平台免責</h2>
        <ul style={ul}>
          <li>本平台不擔保攤位提供商品 / 服務之品質、合法性、正確性</li>
          <li>買賣雙方之爭議由雙方自行協商解決;本平台得協助調解但不擔負連帶責任</li>
          <li>因不可抗力(例如網路中斷、第三方服務當機)導致服務暫停,本平台不負損害賠償責任</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>五、智慧財產權</h2>
        <p>
          攤位上傳之商品圖、文字、影片之著作權屬攤位所有,並授權本平台
          得以於平台範圍內公開展示、傳輸、儲存之必要使用。本平台之 logo、
          設計、程式碼則為 NEO Potential Studio 所有。
        </p>
      </section>

      <section>
        <h2 style={h2}>六、違規處理</h2>
        <p>
          本平台保留依違規嚴重性對攤位 / 用戶採取以下措施之權利:警告、
          下架商品、暫停服務、終止帳號、必要時報警處理。
        </p>
      </section>

      <section>
        <h2 style={h2}>七、服務變更與終止</h2>
        <p>
          本平台得隨時調整、暫停、終止全部或部分服務,並將於合理時程內公告。
          攤位 / 用戶得隨時自行終止使用,終止後仍須承擔終止前產生之義務。
        </p>
      </section>

      <section>
        <h2 style={h2}>八、條款修訂</h2>
        <p>
          本條款得隨時修訂,修訂後於本頁面公告,繼續使用即視為同意修訂版本。
          若不同意請停止使用。
        </p>
      </section>

      <section>
        <h2 style={h2}>九、準據法與管轄</h2>
        <p>
          本條款之解釋與適用,以中華民國法律為準據法。如生爭議,
          雙方同意以**台灣台中地方法院**為第一審管轄法院。
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
