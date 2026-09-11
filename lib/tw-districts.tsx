'use client';

import { useState } from 'react';

/**
 * 台灣縣市 → 鄉鎮市區資料 + 地址下拉元件(2026-09-11,回饋清單 #8)。
 * 縣市用「台」不用「臺」(電商表單慣例);splitTwAddress 解析時兩者通吃。
 * 元件輸出仍是單一 address 字串(hidden input),後端 / DB 完全不用改。
 */
export const TW_DISTRICTS: Record<string, string[]> = {
  台北市: ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  新北市: ['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '樹林區', '鶯歌區', '三峽區', '淡水區', '汐止區', '瑞芳區', '土城區', '蘆洲區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'],
  桃園市: ['桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龍潭區', '龜山區', '大園區', '觀音區', '新屋區', '復興區'],
  台中市: ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區'],
  台南市: ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '左鎮區', '玉井區', '楠西區', '南化區', '仁德區', '關廟區', '龍崎區', '官田區', '麻豆區', '佳里區', '西港區', '七股區', '將軍區', '學甲區', '北門區', '新營區', '後壁區', '白河區', '東山區', '六甲區', '下營區', '柳營區', '鹽水區', '善化區', '大內區', '山上區', '新市區', '安定區'],
  高雄市: ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區', '仁武區', '大社區', '岡山區', '路竹區', '阿蓮區', '田寮區', '燕巢區', '橋頭區', '梓官區', '彌陀區', '永安區', '湖內區', '鳳山區', '大寮區', '林園區', '鳥松區', '大樹區', '旗山區', '美濃區', '六龜區', '內門區', '杉林區', '甲仙區', '桃源區', '那瑪夏區', '茂林區', '茄萣區'],
  基隆市: ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
  新竹市: ['東區', '北區', '香山區'],
  嘉義市: ['東區', '西區'],
  新竹縣: ['竹北市', '竹東鎮', '新埔鎮', '關西鎮', '湖口鄉', '新豐鄉', '芎林鄉', '橫山鄉', '北埔鄉', '寶山鄉', '峨眉鄉', '尖石鄉', '五峰鄉'],
  苗栗縣: ['苗栗市', '頭份市', '竹南鎮', '後龍鎮', '通霄鎮', '苑裡鎮', '卓蘭鎮', '造橋鄉', '西湖鄉', '頭屋鄉', '公館鄉', '銅鑼鄉', '三義鄉', '大湖鄉', '獅潭鄉', '三灣鄉', '南庄鄉', '泰安鄉'],
  彰化縣: ['彰化市', '員林市', '和美鎮', '鹿港鎮', '溪湖鎮', '二林鎮', '田中鎮', '北斗鎮', '花壇鄉', '芬園鄉', '大村鄉', '永靖鄉', '伸港鄉', '線西鄉', '福興鄉', '秀水鄉', '埔心鄉', '埔鹽鄉', '大城鄉', '芳苑鄉', '竹塘鄉', '社頭鄉', '二水鄉', '田尾鄉', '埤頭鄉', '溪州鄉'],
  南投縣: ['南投市', '埔里鎮', '草屯鎮', '竹山鎮', '集集鎮', '名間鄉', '鹿谷鄉', '中寮鄉', '魚池鄉', '國姓鄉', '水里鄉', '信義鄉', '仁愛鄉'],
  雲林縣: ['斗六市', '斗南鎮', '虎尾鎮', '西螺鎮', '土庫鎮', '北港鎮', '古坑鄉', '大埤鄉', '莿桐鄉', '林內鄉', '二崙鄉', '崙背鄉', '麥寮鄉', '東勢鄉', '褒忠鄉', '台西鄉', '元長鄉', '四湖鄉', '口湖鄉', '水林鄉'],
  嘉義縣: ['太保市', '朴子市', '布袋鎮', '大林鎮', '民雄鄉', '溪口鄉', '新港鄉', '六腳鄉', '東石鄉', '義竹鄉', '鹿草鄉', '水上鄉', '中埔鄉', '竹崎鄉', '梅山鄉', '番路鄉', '大埔鄉', '阿里山鄉'],
  屏東縣: ['屏東市', '潮州鎮', '東港鎮', '恆春鎮', '萬丹鄉', '長治鄉', '麟洛鄉', '九如鄉', '里港鄉', '鹽埔鄉', '高樹鄉', '萬巒鄉', '內埔鄉', '竹田鄉', '新埤鄉', '枋寮鄉', '新園鄉', '崁頂鄉', '林邊鄉', '南州鄉', '佳冬鄉', '琉球鄉', '車城鄉', '滿州鄉', '枋山鄉', '三地門鄉', '霧台鄉', '瑪家鄉', '泰武鄉', '來義鄉', '春日鄉', '獅子鄉', '牡丹鄉'],
  宜蘭縣: ['宜蘭市', '羅東鎮', '蘇澳鎮', '頭城鎮', '礁溪鄉', '壯圍鄉', '員山鄉', '冬山鄉', '五結鄉', '三星鄉', '大同鄉', '南澳鄉'],
  花蓮縣: ['花蓮市', '鳳林鎮', '玉里鎮', '新城鄉', '吉安鄉', '壽豐鄉', '光復鄉', '豐濱鄉', '瑞穗鄉', '富里鄉', '秀林鄉', '萬榮鄉', '卓溪鄉'],
  台東縣: ['台東市', '成功鎮', '關山鎮', '卑南鄉', '鹿野鄉', '池上鄉', '東河鄉', '長濱鄉', '太麻里鄉', '大武鄉', '綠島鄉', '海端鄉', '延平鄉', '金峰鄉', '達仁鄉', '蘭嶼鄉'],
  澎湖縣: ['馬公市', '湖西鄉', '白沙鄉', '西嶼鄉', '望安鄉', '七美鄉'],
  金門縣: ['金城鎮', '金湖鎮', '金沙鎮', '金寧鄉', '烈嶼鄉', '烏坵鄉'],
  連江縣: ['南竿鄉', '北竿鄉', '莒光鄉', '東引鄉'],
};

export const TW_CITIES = Object.keys(TW_DISTRICTS);

/**
 * 把既有地址字串拆回 縣市 / 區 / 詳細地址(帶入上次訂單或會員地址用)。
 * 「臺」自動視為「台」;解析不了就整串放 rest,選單留空讓用戶自己選。
 */
export function splitTwAddress(addr: string): { city: string; district: string; rest: string } {
  const norm = (addr || '').trim().replace(/^臺/, '台');
  for (const city of TW_CITIES) {
    if (!norm.startsWith(city)) continue;
    let after = norm.slice(city.length);
    // 區名裡的「臺」也通吃(如 霧臺鄉/臺西鄉/臺東市)
    const afterNorm = after.replace(/^臺/, '台');
    for (const d of TW_DISTRICTS[city]) {
      if (afterNorm.startsWith(d)) {
        return { city, district: d, rest: afterNorm.slice(d.length).trim() };
      }
    }
    return { city, district: '', rest: after.trim() };
  }
  return { city: '', district: '', rest: (addr || '').trim() };
}

/**
 * 縣市 / 區 下拉 + 詳細地址輸入。
 * 對表單輸出單一 hidden input(預設 name="address",值 = 縣市+區+詳細),
 * 所以 placeOrder / createOrder / 會員儲存等後端全都不用動。
 */
export function TwAddressFields({
  name = 'address',
  initial = '',
  required = false,
  inputStyle,
}: {
  name?: string;
  initial?: string;
  required?: boolean;
  inputStyle?: React.CSSProperties;
}) {
  const parsed = splitTwAddress(initial);
  const [city, setCity] = useState(parsed.city);
  const [district, setDistrict] = useState(parsed.district);
  const [rest, setRest] = useState(parsed.rest);
  const districts = city ? (TW_DISTRICTS[city] ?? []) : [];
  const full = city && district ? `${city}${district}${rest}` : rest;

  const selectStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '10px 8px',
    fontSize: 14,
    border: '1px solid #d4d4d8',
    borderRadius: 8,
    background: '#fff',
    color: city ? '#18181b' : '#71717a',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    ...inputStyle,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name={name} value={full} />
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={city}
          required={required}
          aria-label="縣市"
          onChange={(e) => {
            setCity(e.target.value);
            setDistrict('');
          }}
          style={selectStyle}
        >
          <option value="">縣市 *</option>
          {TW_CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={district}
          required={required}
          disabled={!city}
          aria-label="鄉鎮市區"
          onChange={(e) => setDistrict(e.target.value)}
          style={{ ...selectStyle, color: district ? '#18181b' : '#71717a' }}
        >
          <option value="">{city ? '鄉鎮市區 *' : '先選縣市'}</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <input
        value={rest}
        required={required}
        aria-label="詳細地址"
        placeholder="路街巷弄號樓(例:文心路二段201號9樓)"
        onChange={(e) => setRest(e.target.value)}
        style={{
          padding: '10px 12px',
          fontSize: 14,
          border: '1px solid #d4d4d8',
          borderRadius: 8,
          background: '#fff',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          width: '100%',
          ...inputStyle,
        }}
      />
    </div>
  );
}
