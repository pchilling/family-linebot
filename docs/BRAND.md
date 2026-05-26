# NEOP STALL Brand Guidelines

> Phase 8(2026-05-26):NEOP Logo Integration
> Phase 8.1(2026-05-26):Brand rename Stall → **NEOP STALL**

## 品牌架構

- **母品牌 = NEOP**(NEO Potential Studio,公司主品牌)
- **產品名 = STALL**(這個多攤位 LINE Bot + 電商 web app)
- **完整稱呼 = NEOP STALL**(平台對外正名,meta / footer / logo lockup 一律用此)

NEOP 只在 admin / 申請流程 / footer 「Made with」露出。
店家公開頁面(LIFF / `/[slug]` 商店頁主視覺)用 tenant 自己的 brand,
不要讓 NEOP 蓋過店家品牌。

---

## Logo Concept

4 個視覺 layer:

| Layer | 意義 |
|---|---|
| `NEOP` 字標 | 公司縮寫 |
| QR code 風 | 連結實體 ↔ 數位 |
| 四葉草 | 多重身分(student / creator / mentor / merchant) |
| `P` = Peter + Potential | 創辦人 + 「潛力」雙關 |

Logo 資產放 `public/brand/`:

| 檔 | 用途 |
|---|---|
| `logo-mark.png` | 方形 icon,sidebar / favicon / apply 頁標 |
| (未來)`wordmark.svg` | 「NEOP」文字 + icon 橫排 |

**字 "NEOP" 不要包進 SVG path** — 用 HTML/CSS 顯示,字型可換、字距可調。

---

## Color Tokens

定義在 `lib/admin-theme.ts` colors 物件:

| Token | Hex | 用途 |
|---|---|---|
| `neopGreen` | `#05C878` | 主色 / CTA button(`bg-neop-green` 對等) |
| `neopGreenBg` | `#E6FAF1` | success bg / 輕度提示(`neop-green-50` 對等) |
| `neopGreenHover` | `#04A263` | button hover / pressed(`neop-green-600` 對等) |
| `neopBlack` | `#0A0A0A` | 強調黑(不用純黑 `#000`,帶一點暖度) |

Tailwind 對應(若未來轉 Tailwind):
```ts
neop: {
  green: '#05C878',
  'green-50': '#E6FAF1',
  'green-600': '#04A263',
  black: '#0A0A0A',
}
```

---

## Usage Rules

### 主 CTA

```ts
style={{
  background: colors.neopGreen,
  color: '#fff',
  // hover via <style> tag:
  // .neop-cta:hover { background: ${colors.neopGreenHover}; }
}}
```

### Focus state(input / button)

```css
.neop-input:focus {
  border-color: var(--neop-green);
  outline: 0;
  box-shadow: 0 0 0 3px rgba(5, 200, 120, 0.15);
}
```

(用 `<style dangerouslySetInnerHTML>` 注入,因為 inline style 無法表達 `:focus`)

### Success / 確認狀態

```ts
style={{
  background: colors.neopGreenBg,  // 淡底
  color: colors.neopGreen,         // 主色文字
  border: `1px solid ${colors.neopGreen}`,
}}
```

### Logo 放置

- **不能放在純白卡片上不加邊框** — 視覺會浮起來
- 卡片背景 ≠ 純白 → OK(目前 `colors.bgCard = #ffffff` 算純白,要加 `borderSubtle`)
- 暗色背景 → logo SVG 自己處理顏色(用 `currentColor` 比較彈性)

### 不可:

- ❌ 拿 NEOP logo 放到店家公開頁(那是 tenant 的品牌)
- ❌ 在 LIFF 露 NEOP(那是 tenant ↔ 客戶接觸點)
- ❌ 改 logo 顏色 / 變形 / 旋轉

---

## Where NEOP shows up

| 頁面 | NEOP 露出? | 細節 |
|---|---|---|
| `/admin/login` | ✓ | 上方 brand 區塊 |
| `/admin/apply` | ✓ | 頂部 logo + 「NEOP STALL」lockup |
| `/admin/[tenant]/*` sidebar | ✓ | sidebar 頂部 logo |
| `/admin/applications` | ✓ | super admin 平台頁 |
| `/[slug]` 公開店 | ❌ | tenant 自己 brand |
| LIFF 全部 | ❌ | tenant ↔ 客戶 |
| 訂單 email / push | ❌ | 都是 tenant 名義 |

---

## Naming

- Platform name:**NEOP STALL**(母品牌 NEOP / 產品 STALL)
- 簡稱可用 **NEOP** (母品牌 reference)或 **STALL**(產品 reference)
- OAuth consent screen 用「NEOP Stall」
- Logo lockup 排版:`<strong>NEOP</strong> <span font-light>STALL</span>`
  - NEOP 粗體 700(母品牌)
  - STALL 細體 300(產品名)
  - 同字級、同顏色 neopBlack,只靠粗細區分階層
  - tracking-tight(`letter-spacing: -0.025em`)
- 客戶看到的是「{tenant 店名}」,看不到 NEOP
