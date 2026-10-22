/**
 * 攤位自己的政策頁(2026-10-22)
 *
 * 原本只有平台層的 /policy/*(標題 NEOP STALL、聯絡寫平台信箱),但退款 / 寄送這些規則
 * 其實是各攤位自己的。這裡一個檔案處理四種文件,店名、聯絡方式、付款方式、寄送方式
 * 都從攤位設定帶入:有開 LINE Pay / 綠界的攤位才會出現那些退款說明,寄送方式列攤位設定的選項。
 * 法規底線(7 日鑑賞期、個資法)各攤位相同,文字共用。
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantBySlug, getTenantPublic, hasFeature, supabaseAdmin } from '@/lib/supabase';

type Doc = 'terms' | 'privacy' | 'refund' | 'shipping';
const DOCS: { key: Doc; label: string }[] = [
  { key: 'terms', label: '服務條款' },
  { key: 'privacy', label: '隱私權政策' },
  { key: 'refund', label: '退款政策' },
  { key: 'shipping', label: '寄送說明' },
];
const UPDATED = '2026-10-22';

type Props = { params: Promise<{ slug: string; doc: string }> };

function isDoc(s: string): s is Doc {
  return DOCS.some((d) => d.key === s);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, doc } = await params;
  const tenant = await getTenantPublic(slug);
  const label = DOCS.find((d) => d.key === doc)?.label ?? '政策';
  return { title: tenant ? `${label} · ${tenant.name}` : label };
}

type ShipOption = { key: string; label: string; fee?: number; free_over?: number | null };
type ExtraRow = {
  contact_info: string | null;
  shipping_rules: { options?: ShipOption[] } | null;
};

export default async function TenantPolicyPage({ params }: Props) {
  const { slug, doc } = await params;
  if (!isDoc(doc)) notFound();
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const [{ data: extraRow }, tenantFull] = await Promise.all([
    supabaseAdmin.from('tenants').select('contact_info, shipping_rules').eq('id', tenant.id).maybeSingle(),
    getTenantBySlug(slug),
  ]);
  const extra = (extraRow as ExtraRow | null) ?? null;
  const contactInfo = extra?.contact_info?.trim() || null;
  const shipOptions = extra?.shipping_rules?.options ?? [];
  const hasLinePay = hasFeature(tenantFull, 'line_pay');
  const hasEcpay = hasFeature(tenantFull, 'ecpay');
  const name = tenant.name;

  const contactBlock = (
    <>
      {contactInfo ? (
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{contactInfo}</p>
      ) : (
        <p style={{ margin: 0 }}>請透過本商店的 LINE 官方帳號聯絡我們。</p>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28, paddingBottom: 16, borderBottom: '1px solid #e4e4e7' }}>
        {DOCS.map((d) => {
          const active = d.key === doc;
          return (
            <a
              key={d.key}
              href={`/${slug}/policy/${d.key}`}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 13,
                textDecoration: 'none',
                background: active ? '#18181b' : '#f4f4f5',
                color: active ? '#fff' : '#52525b',
                fontWeight: active ? 600 : 500,
              }}
            >
              {d.label}
            </a>
          );
        })}
      </nav>

      <article style={prose}>
        {doc === 'refund' && (
          <>
            <h1 style={h1}>退款政策</h1>
            <p style={meta}>{name} · 上次更新:{UPDATED}</p>

            <section>
              <h2 style={h2}>一、退換貨期限(7 日鑑賞期)</h2>
              <p>
                依《消費者保護法》第 19 條,您享有商品收到後 <strong>7 日內</strong>
                無條件解除契約之權利(俗稱「7 日鑑賞期」)。請於該期限內透過 LINE 或下方聯絡方式通知我們欲退貨。
              </p>
              <p style={small}>
                <strong>不適用 7 日鑑賞期</strong>之商品(依消保法施行細則第 17 條):
                客製化商品、易腐敗 / 有期限商品、已拆封之個人衛生用品。商品頁會明確標示。
              </p>
            </section>

            <section>
              <h2 style={h2}>二、退款條件</h2>
              <ul style={ul}>
                <li>商品<strong>未拆封 / 未使用</strong>,且包裝完整、配件齊全</li>
                <li>於收到商品後 7 日內(含寄回的物流時間)主動聯繫</li>
                <li>非屬上述不適用之商品類型</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>三、瑕疵 / 寄錯 / 短少</h2>
              <p>
                如收到商品<strong>瑕疵、與描述不符、寄錯品項、短少</strong>,請於 3 日內附<strong>照片</strong>
                通知我們。我們會無條件接受退貨,<strong>運費由本店負擔</strong>。
              </p>
            </section>

            <section>
              <h2 style={h2}>四、退款方式</h2>
              <ul style={ul}>
                {hasLinePay && (
                  <li><strong>LINE Pay 付款的訂單</strong>:退回您的 LINE Pay 帳戶</li>
                )}
                {hasEcpay && (
                  <li>
                    <strong>信用卡付款的訂單</strong>:退回原刷卡卡片,發卡銀行約需 14–21 個工作天入帳,可能落在下一期帳單
                  </li>
                )}
                <li><strong>匯款付款的訂單</strong>:請提供您的帳戶資料,3–5 個工作天內匯回</li>
                <li><strong>下次訂單折抵</strong>(經雙方同意)</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>五、退款時間</h2>
              <ul style={ul}>
                <li>收到退回商品並驗收完成後 <strong>7 個工作天內</strong>送出退款</li>
                <li>金流業者實際入帳時間以該業者規定為準,手續費不會轉嫁給您</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>六、運費負擔</h2>
              <ul style={ul}>
                <li><strong>正常 7 日鑑賞期退貨</strong>:由您負擔退回運費</li>
                <li><strong>商品瑕疵 / 寄錯 / 短少</strong>:由本店負擔來回運費</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>七、無法退貨情況</h2>
              <ul style={ul}>
                <li>已過 7 日鑑賞期(以到貨日起算)</li>
                <li>已拆封使用之個人衛生 / 食品 / 易腐敗品</li>
                <li>客製化商品</li>
                <li>商品包裝、配件、贈品有缺漏</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>八、爭議處理</h2>
              <p>如對退款結果有爭議,得向中華民國消費者文教基金會申訴,或循行政院消費者保護會法定程序處理。</p>
            </section>

            <section>
              <h2 style={h2}>九、聯絡方式</h2>
              {contactBlock}
            </section>
          </>
        )}

        {doc === 'shipping' && (
          <>
            <h1 style={h1}>寄送說明</h1>
            <p style={meta}>{name} · 上次更新:{UPDATED}</p>

            <section>
              <h2 style={h2}>一、寄送方式</h2>
              {shipOptions.length > 0 ? (
                <ul style={ul}>
                  {shipOptions.map((o) => (
                    <li key={o.key}>
                      <strong>{o.label}</strong>
                      {typeof o.fee === 'number' ? (o.fee > 0 ? `:運費 NT$ ${o.fee.toLocaleString()}` : ':免運') : ''}
                      {o.free_over ? `,滿 NT$ ${o.free_over.toLocaleString()} 免運` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>實際寄送方式與運費以結帳頁顯示為準。</p>
              )}
            </section>

            <section>
              <h2 style={h2}>二、出貨時程</h2>
              <ul style={ul}>
                <li><strong>確認付款後 1–3 個工作天</strong>內出貨(週六日 / 國定假日順延)</li>
                <li>大量訂單 / 預購商品另行於商品頁說明</li>
                <li>出貨後會透過 LINE 通知您(從 LINE 下單的訂單)</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>三、寄送範圍</h2>
              <ul style={ul}>
                <li><strong>台灣本島</strong>:全區可寄</li>
                <li><strong>離島</strong>(澎湖 / 金門 / 馬祖):另計運費或部分商品不寄,下單前請先詢問</li>
                <li><strong>海外</strong>:暫不提供</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>四、缺貨 / 無法出貨</h2>
              <p>若收到訂單後發現缺貨,我們會於 2 個工作天內主動聯絡,與您協商更換相似商品、等待補貨或全額退款。</p>
            </section>

            <section>
              <h2 style={h2}>五、收件人不在 / 簽收問題</h2>
              <ul style={ul}>
                <li>宅配:第二次配送失敗會退回本店,後續再寄需重新計費</li>
                <li>退回後如要再寄請聯繫我們,運費由您負擔</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>六、貨件遺失 / 物流毀損</h2>
              <p>
                收到包裹請<strong>立即驗收</strong>。若有外觀破損 / 內容物受損,<strong>請當下拍照存證</strong>
                並於 24 小時內通知我們,我們會向物流公司申訴並協助處理。
              </p>
            </section>

            <section>
              <h2 style={h2}>七、聯絡方式</h2>
              {contactBlock}
            </section>
          </>
        )}

        {doc === 'privacy' && (
          <>
            <h1 style={h1}>隱私權政策</h1>
            <p style={meta}>{name} · 上次更新:{UPDATED}</p>

            <section>
              <h2 style={h2}>一、適用範圍</h2>
              <p>
                本政策適用於您在 {name} 線上商店(架設於 NEOP STALL 平台)、LINE 官方帳號及其內嵌頁面所留下的個人資料。
                <strong>不適用於</strong>第三方服務(例:LINE Pay、綠界、物流業者)自行收集之資料。
              </p>
            </section>

            <section>
              <h2 style={h2}>二、收集的資料</h2>
              <ul style={ul}>
                <li><strong>必要</strong>:姓名、電話、寄送地址、Email、訂單明細</li>
                <li><strong>LINE 整合</strong>:LINE 顯示名稱、頭像、LINE 使用者識別碼(僅當您加入官方帳號或使用其內嵌頁面時)</li>
                <li><strong>自動收集</strong>:瀏覽器類型、IP 位址、訪問時間(伺服器紀錄,保留 30 天)</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>三、資料用途</h2>
              <ul style={ul}>
                <li>處理訂單、出貨、收款、退款與客服</li>
                <li>透過 LINE 推送訂單、付款、出貨通知</li>
                <li>內部銷售統計(以匯總方式,不識別個人)</li>
                <li>防止詐欺、濫用與資安事件調查</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>四、第三方分享</h2>
              <p>僅在下列必要範圍內與第三方分享您的資料:</p>
              <ul style={ul}>
                <li><strong>LINE Corporation</strong>:官方帳號與內嵌頁面之技術整合</li>
                {hasLinePay && <li><strong>LINE Pay</strong>:線上付款與退款</li>}
                {hasEcpay && <li><strong>綠界科技 ECPay</strong>:信用卡付款與退款(卡號由綠界處理,本店不會取得)</li>}
                <li><strong>物流業者</strong>:出貨所需之姓名 / 地址 / 電話</li>
                <li><strong>NEOP STALL 平台(Supabase、Vercel)</strong>:資料儲存與網站運作</li>
              </ul>
              <p><strong>不會</strong>將資料販售給第三方廣告商。</p>
            </section>

            <section>
              <h2 style={h2}>五、您的權利</h2>
              <p>依《個人資料保護法》第 3 條,您可以查詢、閱覽、請求複製、補充更正、停止處理或刪除您的個資。</p>
              <p>行使方式:透過下方聯絡方式告知我們,將於 30 天內處理。但<strong>訂單交易紀錄依商業會計法須保存 5 年</strong>,期間內不得刪除。</p>
            </section>

            <section>
              <h2 style={h2}>六、Cookie / 本地儲存</h2>
              <p>本商店使用瀏覽器 localStorage 儲存購物車內容(不會傳到伺服器)。停用可能導致部分功能無法使用。</p>
            </section>

            <section>
              <h2 style={h2}>七、資料安全</h2>
              <p>
                採用 HTTPS 加密傳輸,各商店資料相互隔離。但網際網路本質無法保證 100% 安全,
                如發生資料外洩,將於 72 小時內主動告知並通報主管機關。
              </p>
            </section>

            <section>
              <h2 style={h2}>八、政策變更</h2>
              <p>本政策修訂時,將於本頁面公告。</p>
            </section>

            <section>
              <h2 style={h2}>九、聯絡我們</h2>
              {contactBlock}
            </section>
          </>
        )}

        {doc === 'terms' && (
          <>
            <h1 style={h1}>服務條款</h1>
            <p style={meta}>{name} · 上次更新:{UPDATED}</p>

            <section>
              <h2 style={h2}>一、關於本商店</h2>
              <p>
                本線上商店由 {name} 經營,架設於 NEOP STALL 平台(由 NEO Potential Studio 維運)。
                在本商店下單即表示您同意以下條款。
              </p>
            </section>

            <section>
              <h2 style={h2}>二、訂單成立與付款</h2>
              <ul style={ul}>
                <li>送出訂單後,請於訂單頁指定的期限內完成付款;逾期未付款的訂單會自動取消</li>
                <li>線上付款(LINE Pay、信用卡)完成後訂單自動標為已付款;匯款訂單請於訂單頁回報帳號後 5 碼,待本店核帳</li>
                <li>商品價格、庫存以下單當時商店頁面顯示為準</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>三、您的責任</h2>
              <ul style={ul}>
                <li>提供真實之姓名、聯絡資料與寄送地址</li>
                <li>妥善保管訂單連結,勿轉傳他人</li>
                <li>不得以本商店從事違法、詐欺或侵權行為</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>四、本店的責任</h2>
              <ul style={ul}>
                <li>商品資訊(名稱、價格、規格、庫存)真實準確</li>
                <li>收到付款後於合理時程內出貨,無法出貨時主動告知</li>
                <li>商品瑕疵 / 短少 / 與描述不符時,依退款政策處理</li>
                <li>遵守中華民國消費者保護法等相關法令</li>
              </ul>
            </section>

            <section>
              <h2 style={h2}>五、智慧財產權</h2>
              <p>本商店之商品圖、文字、影片之著作權屬 {name} 所有,未經同意不得轉載或作商業使用。</p>
            </section>

            <section>
              <h2 style={h2}>六、條款修訂</h2>
              <p>本條款得隨時修訂,修訂後於本頁面公告,繼續使用即視為同意修訂版本。</p>
            </section>

            <section>
              <h2 style={h2}>七、準據法與管轄</h2>
              <p>本條款以中華民國法律為準據法。如生爭議,雙方同意以台灣台中地方法院為第一審管轄法院。</p>
            </section>

            <section>
              <h2 style={h2}>八、聯絡方式</h2>
              {contactBlock}
            </section>
          </>
        )}
      </article>
    </div>
  );
}

const prose: React.CSSProperties = { fontSize: 14, lineHeight: 1.8, color: '#3f3f46' };
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 700, color: '#18181b', margin: '0 0 6px', letterSpacing: '-0.01em' };
const meta: React.CSSProperties = { fontSize: 12, color: '#a1a1aa', margin: '0 0 28px' };
const h2: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#18181b', margin: '32px 0 12px' };
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 12px' };
const small: React.CSSProperties = { fontSize: 12, color: '#71717a', background: '#fafafa', padding: '10px 14px', borderRadius: 6, border: '1px solid #e4e4e7' };
