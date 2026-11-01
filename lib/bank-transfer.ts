/**
 * 匯款資訊(2026-11-01):tenants.bank_transfer jsonb 的型別、台灣常見銀行代號、顯示用的小工具。
 *
 * 以前匯款資訊是一整段 free text(tenants.payment_info),攤主自己排版;
 * 改成分開存銀行代號 / 銀行名稱 / 帳號 / 戶名 / 說明,客人看到的頁面才能把帳號單獨一行加複製鈕。
 * payment_info 先留著當備用:攤主還沒填新欄位時照樣顯示舊文字(見 order 頁、LIFF、LINE 通知)。
 *
 * 後台的銀行欄位是「下拉 + 自己打」(input + datalist):選清單會帶「808 玉山銀行」,
 * 自己打也可以;parseBankInput 把這串拆回代號與名稱。
 */

export type BankTransfer = {
  bank_code: string | null; // 3 碼,例如 808
  bank_name: string | null; // 例如 玉山銀行
  account: string; // 只留數字與連字號
  holder: string | null; // 戶名
  note: string | null; // 給客人的說明,例如「匯款後回訂單頁填後五碼」
};

/** 台灣常見銀行(代號照金管會總行代號),後台下拉用;不在清單的攤主可以自己打 */
export const TW_BANKS: { code: string; name: string }[] = [
  { code: '004', name: '臺灣銀行' },
  { code: '005', name: '土地銀行' },
  { code: '006', name: '合作金庫' },
  { code: '007', name: '第一銀行' },
  { code: '008', name: '華南銀行' },
  { code: '009', name: '彰化銀行' },
  { code: '011', name: '上海商業儲蓄銀行' },
  { code: '012', name: '台北富邦銀行' },
  { code: '013', name: '國泰世華銀行' },
  { code: '016', name: '高雄銀行' },
  { code: '017', name: '兆豐銀行' },
  { code: '021', name: '花旗銀行' },
  { code: '048', name: '王道銀行' },
  { code: '050', name: '臺灣企銀' },
  { code: '052', name: '渣打銀行' },
  { code: '053', name: '台中銀行' },
  { code: '054', name: '京城銀行' },
  { code: '081', name: '匯豐銀行' },
  { code: '102', name: '華泰銀行' },
  { code: '103', name: '臺灣新光銀行' },
  { code: '108', name: '陽信銀行' },
  { code: '118', name: '板信銀行' },
  { code: '147', name: '三信銀行' },
  { code: '700', name: '中華郵政' },
  { code: '803', name: '聯邦銀行' },
  { code: '805', name: '遠東銀行' },
  { code: '806', name: '元大銀行' },
  { code: '807', name: '永豐銀行' },
  { code: '808', name: '玉山銀行' },
  { code: '809', name: '凱基銀行' },
  { code: '810', name: '星展銀行' },
  { code: '812', name: '台新銀行' },
  { code: '816', name: '安泰銀行' },
  { code: '822', name: '中國信託' },
  { code: '823', name: '將來銀行' },
  { code: '824', name: 'LINE Bank' },
  { code: '826', name: '樂天銀行' },
];

/** 後台銀行欄位的字串 →(代號, 名稱)。接受「808 玉山銀行」「808」「玉山銀行」三種寫法 */
export function parseBankInput(raw: string): { code: string | null; name: string | null } {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { code: null, name: null };
  const m = s.match(/^(\d{3})\s*(.*)$/);
  if (m) {
    const code = m[1];
    const rest = m[2].trim();
    const known = TW_BANKS.find((b) => b.code === code);
    return { code, name: rest || known?.name || null };
  }
  const byName = TW_BANKS.find((b) => b.name === s);
  return { code: byName?.code ?? null, name: s };
}

/** 從資料庫 jsonb 讀回來,帳號是必要欄位,沒有就當沒設定 */
export function bankTransferFromRow(row: unknown): BankTransfer | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const account = typeof r.account === 'string' ? r.account.trim() : '';
  if (!account) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    bank_code: str(r.bank_code),
    bank_name: str(r.bank_name),
    account,
    holder: str(r.holder),
    note: str(r.note),
  };
}

/** 銀行顯示名:「808 玉山銀行」;只有其中一個就顯示那個 */
export function bankDisplayName(b: Pick<BankTransfer, 'bank_code' | 'bank_name'>): string {
  return [b.bank_code, b.bank_name].filter(Boolean).join(' ');
}

/** 組成純文字(LINE 通知、沒辦法排版的地方用) */
export function formatBankTransferText(b: BankTransfer): string {
  const lines: string[] = [];
  const bank = bankDisplayName(b);
  if (bank) lines.push(`銀行:${bank}`);
  lines.push(`帳號:${b.account}`);
  if (b.holder) lines.push(`戶名:${b.holder}`);
  if (b.note) lines.push(b.note);
  return lines.join('\n');
}
