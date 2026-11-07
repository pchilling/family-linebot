/**
 * 超商店到店(Phase 29,2026-11-01,第一階段不接 API)
 *
 * 店到店一律「同一家超商寄、同一家超商取」,所以 7-ELEVEN 和全家是兩個不同的配送方式:
 * tenants.shipping_rules.options[] 裡 cvs 欄位標記是哪一家,key 固定 cvs_711 / cvs_family。
 * 客人結帳選門市(店名 + 店號),攤主自己到 ibon / FamiPort 寄件,再回訂單填寄件單號。
 * 第二階段接綠界物流後,門市用電子地圖選、寄件單由系統建、物流狀態自動回寫。
 */

export type CvsChain = '711' | 'family';

export const CVS_CHAINS: Record<
  CvsChain,
  {
    key: string; // shipping option key(固定)
    label: string; // 配送方式名稱
    short: string; // 短名,放在門市前面
    mapUrl: string; // 官方門市查詢(客人查店號用)
    trackUrl: string; // 官方包裹查詢(客人查寄件單號用)
    shipHint: string; // 給攤主的寄件提示
  }
> = {
  '711': {
    key: 'cvs_711',
    label: '7-ELEVEN 店到店',
    short: '7-ELEVEN',
    mapUrl: 'https://emap.pcsc.com.tw/',
    trackUrl: 'https://eservice.7-11.com.tw/e-tracking/search.aspx',
    shipHint: '到 7-ELEVEN 用 ibon「交貨便」寄件,輸入客人的門市、姓名、手機,印標籤貼上後到櫃檯寄出。',
  },
  family: {
    key: 'cvs_family',
    label: '全家 店到店',
    short: '全家',
    mapUrl: 'https://www.family.com.tw/Marketing/Map',
    trackUrl: 'https://www.famiport.com.tw/Web_Famiport/page/process.aspx',
    shipHint: '到全家用 FamiPort「店到店」寄件,輸入客人的門市、姓名、手機,印標籤貼上後到櫃檯寄出。',
  },
};

export const CVS_CHAIN_LIST: CvsChain[] = ['711', 'family'];

export function isCvsChain(v: unknown): v is CvsChain {
  return v === '711' || v === 'family';
}

/** 寄送資訊上的門市字串:「7-ELEVEN 大安門市(店號 123456)」 */
export function cvsStoreText(chain: CvsChain, storeName: string, storeId: string): string {
  return `${CVS_CHAINS[chain].short} ${storeName}(店號 ${storeId})`;
}

// ====================
// Phase 36(2026-11-08):超商取貨付款(規格 docs/CVS_PICKUP.md)
// 平台不接物流 API:攤主用自己的賣貨便 / 好賣+ 寄,取貨付款的錢由超商直接撥給攤主。
// 設定存 tenants.cod_payment jsonb:{ enabled, note, max_twd };訂單 payment_method = 'cod'。
// ====================

export type CodPayment = {
  enabled: boolean;
  /** 給客人的說明(結帳選項下方、訂單頁) */
  note: string | null;
  /** 單筆上限(含運),null = 不限;依攤主用的超商規定自己填 */
  max_twd: number | null;
};

/** 結帳頁 / LIFF 拿到的公開版本(只有開著才會給) */
export type CodPaymentPublic = { note: string | null; max_twd: number | null };

export function codPaymentFromRow(raw: unknown): CodPayment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { enabled?: unknown; note?: unknown; max_twd?: unknown };
  const max = typeof r.max_twd === 'number' && Number.isFinite(r.max_twd) && r.max_twd > 0 ? Math.floor(r.max_twd) : null;
  const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null;
  return { enabled: r.enabled === true, note, max_twd: max };
}

/** 攤主有開才回公開版本,沒開回 null(結帳不顯示這個選項) */
export function codPaymentPublicFromRow(raw: unknown): CodPaymentPublic | null {
  const cfg = codPaymentFromRow(raw);
  if (!cfg || !cfg.enabled) return null;
  return { note: cfg.note, max_twd: cfg.max_twd };
}

/** 這張單能不能選取貨付款:攤主有開、配送是超商店到店、應付沒超上限 */
export function codAllowed(cfg: CodPaymentPublic | null, isCvs: boolean, payableTwd: number): boolean {
  if (!cfg || !isCvs) return false;
  if (cfg.max_twd !== null && payableTwd > cfg.max_twd) return false;
  return true;
}

/** 客人在結帳、訂單頁看到的錯誤 / 提示文案,前後端共用 */
export const COD_NOT_ALLOWED_ERROR = '這張訂單不能選超商取貨付款(要選超商店到店、金額也不能超過賣家設定的上限),請改選其他付款方式';

/**
 * 後台「複製寄件資料」:貼進賣貨便 / 好賣+ 用的一段純文字。
 * codTwd 有值 = 取貨付款(含運的應付);null = 已付款,取貨不付款。
 */
export function cvsShipmentText(p: {
  recipient: string | null;
  phone: string | null;
  chain: CvsChain;
  storeName: string | null;
  storeId: string | null;
  codTwd: number | null;
  orderNo: string;
}): string {
  return [
    `收件人:${p.recipient ?? ''}`,
    `手機:${p.phone ?? ''}`,
    `門市:${cvsStoreText(p.chain, p.storeName ?? '', p.storeId ?? '')}`,
    p.codTwd !== null ? `取貨付款:NT$ ${p.codTwd.toLocaleString('en-US')}(含運)` : '已付款,取貨不付款',
    `訂單:${p.orderNo}`,
  ].join('\n');
}
