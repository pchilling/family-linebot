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
