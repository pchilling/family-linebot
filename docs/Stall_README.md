# Stall — 個人販賣基礎建設

> 內部代號：Stall（攤位）。最終品牌名待定。

---

## TL;DR

一個讓「想賣東西的人」（從賣二手的朋友、到代購、到自有品牌）都能擁有**美感攤位 + 自動分享卡 + LINE/IG 原生整合**的工具。

**表面上是 SaaS，本質上是 Peter 的資料平台**：自己用、品牌用、朋友用，所有資料由 Peter 掌握。

---

## 1. 這個項目在做什麼

我（Peter）想要一個「賣東西的基礎建設」，同時服務三種使用者：

1. **我自己** — 賣個人物品、二手、創作
2. **我的品牌** — New Era Oil（自有精油品牌，含輔銷品）
3. **我的朋友** — Kim 賣二手、小安代購女裝、Cyndi 代購童裝

所有人共用同一套架構，**但底下的資料庫由我掌握**。朋友用，因為工具好用；我獲得的是底下那層**跨攤位資料**——誰賣什麼、誰買什麼、什麼好賣、回購率、客戶聯絡網——這才是長期最值錢的部分。

> **這不是「先做 SaaS 來賺錢」。這是我的工具，順便讓朋友用，未來可以演化成 SaaS。**

---

## 2. 為什麼存在（市場缺口）

| 對手 | 為什麼不適用我這群人 |
|---|---|
| **蝦皮** | 規模大但雜、沒美感、賣家像商品編號、靠演算法不靠品牌 |
| **Shopify / Cyberbiz** | 對「我只想賣 3 個月二手」的人太重太貴 |
| **IG Shop** | 沒後台、沒庫存、結帳體驗破碎 |
| **Carousell** | 陌生人市集，沒法經營品牌形象 |
| **Linktree** | 不是真的能賣東西，只是貼連結 |

**沒人在做「美 + 輕 + 自帶傳播引擎 + 從個人到品牌的光譜」的交集。**

---

## 3. 核心差異化

### 3.1 Strava 般的分享卡引擎（最核心）

每次**上架、賣掉、補貨、開攤**，系統自動產出有美感的分享卡（IG Story / 貼文 / OG 圖三種尺寸）。

- 賣家不需要 Photoshop，按一下就能分享
- 每張卡都尊重原圖（不亂修圖），用排版包裝弱點
- 卡型由模板決定，依平台規格自動調整 anchor 位置
- 預設帶「Made with Stall」浮水印（付費可隱藏）= 病毒擴散引擎

**設計準則**：
- 一張卡只放 3 層資訊：原圖（70%）/ 商品名+價（20%）/ 攤位歸屬（10%）
- **不放規格、尺寸、描述**——那些是商品詳情頁的工作
- 卡的目標是引發慾望，不是給完整資訊

### 3.2 策展式主題系統（不開放自訂 CSS）

3 套設計師完整設計好的主題包，賣家「選一套，填內容」：

| 主題 | 美學參考 | 適合誰 |
|---|---|---|
| **Apothecary** | Aesop、Le Labo、Diptyque | New Era Oil、premium 代購 |
| **Editorial** | Kinfolk、雜誌、暖質感 | Cyndi 童裝、小安女裝 |
| **Corner Store** | Depop、二手社群、街感 | Kim 二手、Peter 個人 |

賣家**只能改 4 件事**：
- Logo
- 品牌主色（系統自動推算 accent / hover / 文字色）
- Banner / Hero 圖
- 品牌文案

**字型、間距、版型、按鈕風格、互動效果，通通鎖定。** 主題的品質 = Stall 的競爭力。

### 3.3 開攤 / 凍結機制

適合季節性賣家：賣完一波就「凍結」攤位，資料保留，介面下架，不收費。下次想賣再「開攤」。

技術上：`tenants.status = 'hibernated'`，不刪資料，純改狀態。

### 3.4 多渠道輸出（一份內容，多個門）

同一個 tenant 渲染成：

- **網站版** — `stall.com/cyndi`（給 IG bio、Threads、Email 用）
- **LIFF 版** — LINE 內開啟，接 LINE Pay、自動帶身份
- **分享卡** — IG Story / 貼文 / OG 圖三種尺寸

統一資料庫，但渲染層適配各平台。

### 3.5 代銷 / Catalog 模式（給 New Era Oil 用，未來開放）

New Era Oil 有「中央商品目錄」（Catalog），C 分享者（Stall tenant）可以「拉」目錄商品到自己攤位賣，訂單回流給總部發貨，含分潤規則。

一套架構同時解決兩個問題：
- Stall 的「攤位主沒商品要賣」問題
- New Era Oil 的「C 分享者要怎麼賣」問題

未來開放給 Cyndi（她自己當 supplier 給更小代理商）、其他客戶使用。

---

## 4. 使用者光譜（Tiers）

| Tier | 真實人選 | 賣什麼 | 使用週期 | 方案 |
|---|---|---|---|---|
| **0 階段性賣家** | Kim、二手朋友 | 自己的二手 | 1–3 個月一波，凍結 | Free |
| **1 個人代購** | 小安（女裝） | 開團一波波 | 持續但不穩定 | Plus |
| **2 品牌代購** | Cyndi（童裝） | 持續代購 | 長期穩定 | Pro |
| **3 小品牌 / 完整事業** | New Era Oil、未來客戶 | 自家產品 | 永續 | Enterprise + 客製 |

---

## 5. 商業模式（Freemium）

| 方案 | 月費（暫定） | 主要解鎖 |
|---|---|---|
| **Free** | $0 | 完整功能 + 預設主題 + 分享卡（含浮水印） |
| **Plus** | ~$149 | + Logo、自訂色、進階分享卡模板、去浮水印 |
| **Pro** | ~$399 | + 完整主題自訂、LINE Pay、超商取貨、電子發票、自訂網域選項 |
| **Enterprise** | 自訂 | + 客製設計、完整白牌、API、優先支援 |

**Peter 的核心種子（你熟的朋友）終身免費**，條件：保留「Made with Stall」浮水印 + 開攤後至少分享一次。**他們是行銷預算，不是付費用戶。**

**經濟邏輯**：本來就要為自己跟 New Era Oil 做這個工具。朋友/陌生人 SaaS 收費是 bonus，不是 KPI。

---

## 6. 詢問與客服流程

**核心決定**：開一個統一的 Stall LINE OA（不要每個賣家自己開）。

```
客人在攤位頁點「詢問商品」
        │
        ├── IG 路線 ──→ 跳賣家 IG DM
        │             （快速但 Stall 拿不到資料）
        │
        └── LINE 路線 ─→ 加 Stall 官方 LINE 好友
                       Bot 認得是哪個攤位 / 商品
                       Bot 推播給賣家 + 後台 inquiry 系統
                       訊息雙向 relay
```

賣家自由選擇 IG / LINE 哪個給客人用。**在乎客戶資料的賣家會主動引導走 LINE**，這是 self-selection。

---

## 7. 技術整合清單

### LINE
- LIFF（LINE 內網頁渲染）
- LINE Login（買家身份）
- LINE Pay（付費版結帳）
- Messaging API（詢問機器人、訂單通知、推播；取代已停用的 LINE Notify）
- Rich Menu（OA 底部選單）

### Instagram
- Messaging API（DM 詢問流入後台）
- Comments webhook（留言「+1」自動 DM 商品連結）
- Insights API（賣家後台分析）

### 台灣電商必備（付費版）
- 綠界 / TapPay 金流
- 7-11 / 全家 超商取貨 API
- 電子發票
- 黑貓 / 宅配通 託運單 API

---

## 8. 系統架構摘要

### 資料分層

```
🌍 平台層（Peter 掌握，跨攤位資料）
    └── users / customers / catalogs

🏪 租戶層（每個攤位自己的）
    └── tenants / products / orders / tenant_themes / inquiries

📦 衍生層（系統生成）
    └── share_cards / inventory_movements / customer_tenant_links
```

### 關鍵設計決定

- **Shared DB + `tenant_id`**：所有攤位資料同一個資料庫，用 `tenant_id` 欄位區隔。跨攤位查詢（Peter 看全景）只要一句 SQL。
- **`customers` 在平台層**：同一個買家可能跟 Kim、Cyndi、New Era Oil 都買過——Peter 看得到全部，賣家只看得到自己攤位的他。
- **`theme_id` + 限定 token override**：主題鎖死，賣家只能改 4 個 token。**沒有 `custom_css` 欄位。**
- **`tenants.status`**：active / hibernated，凍結就是改狀態不刪資料。
- **`orders.source`**：`web` / `liff` / `manual`，未來分析跨渠道銷售。

### MVP 必要的 10 張表

```
users               平台層，所有用 Stall 的人
tenants             攤位本體
tenant_members      誰可以管哪個攤
customers           平台層，跨攤位
products            🏪 商品
product_images      🏪 商品圖
orders              🏪 訂單
order_items         🏪 訂單明細
tenant_themes       🏪 攤位主題設定
share_cards         📦 衍生：分享卡
```

### Phase 2 預埋（已在 schema 設計時留空間）

```
catalogs              中央商品目錄
catalog_products      目錄裡的商品
catalog_listings      tenant 拉商品 + 分潤規則
product_variants      SKU
inventory_movements   進出庫
inquiries / messages  LINE 詢問系統
pv_debts              NEO 特用：欠 PV 紀錄
```

---

## 9. 與 NEO 生態的關係

Stall **不是獨立 SaaS 公司**，是 NEO 旗下的工具：

```
NEO（母公司 / 整合行銷工作室）
├── New Era Oil（自有品牌，使用 Stall + Catalog 模式）
├── 行銷鬼腦（個人 IP，使用 Stall）
├── 接案客戶（Grace Han、Cyndi 等，逐步遷移）
└── Stall（基礎建設，所有上面的事業都用）
```

- **Cyndi 系統會重做成 Stall 的 v1 Pro tenant**，不再是客製接案
- New Era Oil 變成 Stall Catalog 的第一個 supplier
- 未來如果有獨立 SaaS 商機，再評估 spin out

---

## 10. Rollout 計畫

**架構同時支援所有人，但上線分波（避免一次同時被四種使用者撕裂）**

| 週 | 上線者 | 重點 |
|---|---|---|
| **1–2** | Peter + Kim | MVP，Tier 0 二手攤，純網站，無 LINE 整合 |
| **3–4** | New Era Oil | 加 LIFF、LINE Pay、超商取貨、Catalog 系統 |
| **5–6** | 小安 | Tier 1 預購、開團 |
| **7–8** | Cyndi 遷移 | 從現有客製系統搬到 Stall Pro |

---

## 11. 設計哲學（決策準則）

- **策展 > 自由度** — 自訂 CSS 一定難看，給的是濾鏡不是 Photoshop
- **基礎建設 > SaaS** — 先解決自己跟身邊的問題，賺錢是副產品
- **資料 > 流量** — 拼平台流量打不贏蝦皮，但跨攤位資料只有 Peter 有
- **美學是護城河** — 對手抄得到功能，抄不到品味
- **病毒設計** — 每個動作（上架、賣掉、補貨、開攤）都自動產出可分享內容
- **平台幫使用者解決他不知道自己需要解決的事** — 例如 IG 安全區、照片裁切、字型搭配、跨平台尺寸

---

## 12. 還沒決定的事

- [ ] 正式品牌名（目前 `Stall` 是內部代號）
- [ ] 各 tier 確切定價（目前是暫定數字）
- [ ] 「賣掉了」分享卡的細節（馬賽克、Sold tag、社會證明感）
- [ ] 分享 onboarding UX（賣家上架後怎麼「忍不住按分享」）
- [ ] LINE OA 統一 vs 各自——傾向統一，待最終確認
- [ ] 法律 / 金流 / 糾紛處理機制
- [ ] 是否未來 spin out 成獨立 SaaS
- [ ] 主題 Library 何時從 3 套擴增到 5+ 套
- [ ] 技術選型（Next.js + Supabase + 圖片產生方案，待最終定）

---

## 13. 接下來

1. 設計 3 套主題的完整 design spec（Figma 畫完再寫 code）
2. 釘完 schema 細節（catalog、theme、inquiry 三組）
3. 決定技術選型
4. 開始 Week 1: MVP for Peter + Kim

---

*版本：0.1 草稿 · 2026/05/19*  
*整理自 Peter 與 Claude 的策略對話*
