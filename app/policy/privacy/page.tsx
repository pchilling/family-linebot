import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私權政策 · NEOP STALL',
};

export default function PrivacyPage() {
  return (
    <article style={prose}>
      <h1 style={h1}>隱私權政策</h1>
      <p style={meta}>上次更新:2026-06-04(初版範本)</p>

      <section>
        <h2 style={h2}>一、適用範圍</h2>
        <p>
          本政策適用於使用 NEOP STALL 平台、子網域(例:`/oilswa` 等攤位)、
          LINE Bot 及 LIFF 介面所收集之個人資料。**不適用於**第三方連結(例:
          LINE Pay、外部物流網站)所收集之資料。
        </p>
      </section>

      <section>
        <h2 style={h2}>二、收集的資料</h2>
        <ul style={ul}>
          <li><strong>必要</strong>:姓名、電話、寄送地址、Email、訂單明細</li>
          <li><strong>LINE 整合</strong>:LINE 顯示名、頭像、LINE User ID(僅當你加 bot 好友或使用 LIFF 時)</li>
          <li><strong>自動收集</strong>:瀏覽器類型、IP 位址、訪問時間(伺服器 log,保留 30 天)</li>
          <li><strong>選填</strong>:生日(用於生日優惠)、地址(用於出貨)</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>三、資料用途</h2>
        <ul style={ul}>
          <li>處理訂單、出貨、收款、客服</li>
          <li>透過 LINE 推送訂單通知 / 出貨通知 / 課程提醒</li>
          <li>內部分析:商品銷售統計、攤位營運報表(以匯總方式,不識別個人)</li>
          <li>防止詐欺、濫用、資安事件調查</li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>四、第三方分享</h2>
        <p>本平台會在下列必要範圍內與第三方分享你的資料:</p>
        <ul style={ul}>
          <li><strong>LINE Corporation</strong>:LIFF / Messaging API 必要技術整合</li>
          <li><strong>Supabase Inc.</strong>:資料儲存(主機位於 AWS Tokyo)</li>
          <li><strong>Vercel Inc.</strong>:應用程式部署與 CDN</li>
          <li><strong>物流業者</strong>:出貨資訊(姓名 / 地址 / 電話)</li>
          <li><strong>金流業者</strong>(若有接,目前手動匯款):支付資訊</li>
        </ul>
        <p>**不會**將資料販售給第三方廣告商。</p>
      </section>

      <section>
        <h2 style={h2}>五、你的權利</h2>
        <p>依《個人資料保護法》第 3 條,你有以下權利:</p>
        <ul style={ul}>
          <li>查詢、閱覽你的個資</li>
          <li>請求複製本</li>
          <li>請求補充、更正</li>
          <li>請求停止蒐集、處理、利用</li>
          <li>請求刪除</li>
        </ul>
        <p>行使方式:寄信至 <a href="mailto:peter@neop.tw" style={link}>peter@neop.tw</a>,
        我們將於 30 天內處理。但**訂單交易紀錄依商業會計法須保存 5 年**,期間內不得刪除。</p>
      </section>

      <section>
        <h2 style={h2}>六、Cookie / 本地儲存</h2>
        <p>
          本平台使用瀏覽器 localStorage 儲存購物車內容(不會傳到伺服器)。
          管理後台使用 Cookie 維持登入狀態。停用 Cookie 可能導致部分功能無法使用。
        </p>
      </section>

      <section>
        <h2 style={h2}>七、資料安全</h2>
        <p>
          本平台採用 HTTPS 加密傳輸、密碼 hash 儲存、Row-Level Security 隔離各攤位資料。
          但網際網路本質無法保證 100% 安全,如發生資料外洩,將於 72 小時內主動告知並通報主管機關。
        </p>
      </section>

      <section>
        <h2 style={h2}>八、未成年人</h2>
        <p>
          本平台不主動向 18 歲以下未成年人提供服務。如發現未成年人使用,
          將於通知法定代理人後刪除其資料。
        </p>
      </section>

      <section>
        <h2 style={h2}>九、政策變更</h2>
        <p>
          本政策修訂時,將於本頁面公告。重大變更會額外以 Email 通知(若你已提供)。
        </p>
      </section>

      <section>
        <h2 style={h2}>十、聯絡我們</h2>
        <p>
          個資相關詢問:<a href="mailto:peter@neop.tw" style={link}>peter@neop.tw</a>
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
