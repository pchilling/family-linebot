# Stall 架構決定文件

> 給 Claude Code 的執行用技術 spec。
> 商業 context 請看 `Stall_README.md`。
>
> **v1.1 更新(2026-05-19):**
> - 加入「公開網站 + LIFF」雙入口架構
> - 路由結構重新規劃
> - Identity 系統擴充(支援多 auth provider)
> - 優先順序調整:oilswa / Cyndi 優先,New Era Oil 暫緩

---

## 一、Stall 是什麼

**Stall = family-linebot 的進化版**,不是新專案。

```
family-linebot(Phase 3 deployed, Phase A migration 完成)
    ↓ 演化為
Stall(同一個 codebase,擴大為 multi-tenant 電商平台)
```

**所有現有 family-linebot 程式碼、schema、deployment** 都會逐步遷移到 Stall 架構。

不需要新 repo、新 Supabase、新 Vercel。**就是 in-place migration**。

---

## 二、入口策略(v1.1 更新)

Stall 支援**三個入口**,服務不同來源的用戶:

### 入口 A:公開網站(任何人都能看)

```
stall.com/[slug]                  ← 攤位首頁,SEO 友善
stall.com/[slug]/p/[product]      ← 商品詳情
stall.com/[slug]/about            ← 關於攤位
```

**主要服務**:
- IG bio link 點進來的人
- 朋友分享連結進來的人
- Google 搜尋進來的人
- 沒有 LINE 但想買東西的人

**特性**:
- 不需登入就能瀏覽
- 要加購物車 / 結帳才需要登入
- SEO 完整(meta tags、Open Graph、structured data)

### 入口 B:LINE LIFF(LINE 用戶專屬)

```
liff.line.me/{liffId}             ← LIFF 入口
   ↓ 內部 redirect
stall.com/m/[slug]                ← LIFF mobile 版
stall.com/m/[slug]/cart           ← LIFF 購物車
stall.com/m/member                ← (現有)會員資料
```

**主要服務**:
- LINE@ 好友
- LINE Bot Rich Menu 點進來的人

**特性**:
- 自動帶 LINE 身份
- 精簡 UI(適合手機)
- 走 LINE Pay 自然

### 入口 C:管理員後台

```
stall.com/admin/[tenant]/...      ← 各 tenant 管理員工後台
```

**主要服務**:
- 員工(小編、會計、出貨)
- Tenant owner(Peter / Cyndi)

---

## 三、核心架構決定(已 lock,不要動)

以下 7 個架構決定**已經對齊**,Claude Code 在實作時請遵循:

### 決定 1:「人」採 **混合架構**(平台層 + tenant 層)

```
platform_users          ← 平台層,記錄「人」的 identity
  └── id, line_user_id, phone, display_name, email

tenant_customers        ← tenant 層,記錄該 tenant 對這個人的標注
  └── tenant_id, platform_user_id (FK),
      display_name, tags, total_spent
```

### 決定 2:Tenant 功能分層用 **Feature Flag**

```sql
tenants.features jsonb default '{}'::jsonb
-- 例:{"catalog": true, "advanced_classroom": true}
```

### 決定 3:Catalog **Schema 留 hook,功能 Phase 2 才做**

`products` 表預埋 `source_product_id` / `source_tenant_id` / `revenue_share_pct`。

### 決定 4:金流 **Phase 1 不做平台金流**

每個 tenant 自己用自己的金流。Stall 不當金流中介。

### 決定 5:Theme 系統 — Phase 1 走簡版,Phase 2 才上 3 套主題

**Phase 1**:oilswa / cyndi 都用 `theme_id='default'`,只改 4 個 token(logo、主色、banner、tagline)。

**Phase 2+**:找設計師完成 3 套主題(Apothecary / Editorial / Corner Store)。

### 決定 6:**所有人(Peter / Kim / Cyndi / oilswa)都是 tenant**

不要有「特殊存在」。架構統一。

### 決定 7:Theme 可自訂分 **4 層分層**

| Tier | 可改 |
|---|---|
| Free | 4 個 token:logo、主色、banner、tagline |
| Plus | + 字體組、按鈕風格、product card 風格 |
| Pro | + hero 排版、section 順序、自訂頁面 |
| Enterprise | 客製設計(找 NEOP 簽合約) |

**永遠鎖死的**:字體本身、商品 card 構圖、響應式、動畫、結帳流程 UI。

---

## 四、路由結構(v1.1 新增)

### 完整路由樹

```
公開頁面(不需登入):
  /                                ← Stall 首頁(暫時 placeholder)
  /[slug]                          ← 攤位首頁
  /[slug]/p/[product]              ← 商品詳情
  /[slug]/about                    ← 關於攤位

需要登入(會員區):
  /login                           ← 登入頁(LINE Login 為主)
  /[slug]/cart                     ← 購物車
  /[slug]/checkout                 ← 結帳
  /account                         ← 我的會員(跨 tenant 個人資料)
  /account/orders                  ← 我的所有訂單(跨 tenant)
  /[slug]/account                  ← 在這個 tenant 的會員(訂單、標籤)

LIFF 入口(LINE 內專屬):
  /m/[slug]                        ← LIFF 攤位首頁
  /m/[slug]/p/[product]            ← LIFF 商品詳情
  /m/[slug]/cart                   ← LIFF 購物車
  /m/[slug]/checkout               ← LIFF 結帳(LINE Pay)
  /m/member                        ← (現有)LIFF 會員資料

API:
  /api/webhook                     ← (現有)LINE Bot webhook
  /api/auth/...                    ← Auth 相關(Supabase Auth)
  /api/orders                      ← 訂單 API
  /api/products                    ← 商品 API

管理員後台:
  /admin/login                     ← (現有)管理員登入
  /admin/[tenant]/classes          ← 課程管理(只 oilswa 用)
  /admin/[tenant]/products         ← 商品管理
  /admin/[tenant]/orders           ← 訂單管理
  /admin/[tenant]/customers        ← 客戶管理
  /admin/[tenant]/inventory        ← 庫存管理
```

### 關鍵原則:Public 跟 LIFF 是「同一個 codebase 的兩個渲染版本」

商品資料只一份,佈局有兩種(`PublicLayout` vs `LiffLayout`)。共用 component,不寫兩份。

---

## 五、Identity 系統(v1.1 新增)

### Phase 1:LINE-only(現在到 Week 4-6)

只支援 LINE 一種登入方式:
- LIFF(LINE 內 webview)
- LINE Login Web(網頁版,公開頁面用)

兩種登入都拿 `line_user_id`,寫到 `platform_users.line_user_id`。

### Phase 2:多 provider(Week 7-12,或更晚)

支援 email 註冊、Google Login(未來)。

**需要新增** `platform_user_auth_methods` 表(Phase 1 schema 預埋,但只用 'line')。

### Identity Linking(Phase 2+)

問題:同一個 Kim,從 IG 點 link 進來用 email 註冊,後來又加 LINE@ 用 LIFF。
→ 系統要認得「這兩個 identity 是同一個 Kim」。

**解法**:
- 同 email 第二次 OAuth → 自動 link
- 同 phone → 提示用戶手動 confirm
- 都沒有共通點 → 視為不同人,未來提供「合併帳號」功能

**Phase 1 不做這個**,先讓兩個 identity 並存。

---

## 六、完整 Schema(Stall v1)

詳見 repo 內 `db/schema.sql`。重點:

- `platform_users`(已加 `primary_auth_provider` / `email_verified`)
- `platform_user_auth_methods`(Phase 1 schema 預埋)
- `tenants`(已加 `slug` / `plan` / `features` / `description` / `og_image_url` / `brand_color`)
- `tenant_members`
- `tenant_customers`(Phase B code refactor 時建,目前用 `users` 表暫代)
- `products`(已加 catalog hook + `slug` URL friendly)
- `orders`(已加 `source` + `guest_email` / `guest_phone`)

### Phase 2+ 預留(現在不建)

```
catalogs                  ← Phase 2(代銷系統)
catalog_listings          ← Phase 2
product_images            ← Phase 2(多圖)
product_variants          ← Phase 2(SKU 變體)
share_cards               ← Phase 2(分享卡引擎)
inquiries                 ← Phase 2(詢問系統)
pv_records                ← Phase 3(NEO 特用)
```

---

## 七、Phase 規劃(v1.1 重新排序)

**優先順序:oilswa(家族)→ Cyndi(接案)→ 公開網站(IG 鋪路)**

> ⚠️ New Era Oil 不在此時程內。等 Phase 5 後再評估。

### Phase 4-Alpha(Week 1-2):oilswa / Cyndi 的核心 admin

**目標**:員工(小編、會計、出貨)可以開始用系統,**取代手寫 / Excel**。

**Tasks**(全 ✅ done 2026-05-19):
1. ✅ 跑 Phase 4 SQL:products / orders / order_items / stock_movements
2. ✅ 建 Cyndi tenant(`slug='cyndi'`, `plan='pro'`)
3. ✅ `/admin/[tenant]/products` 商品 CRUD + nested variants(色 × 尺寸 × SKU)
4. ✅ `/admin/[tenant]/orders` 列表 + `/orders/[id]` 詳情 + 改狀態
5. ✅ `/admin/[tenant]/customers` 客戶名單 + 訂單統計 + 累積消費
6. ✅ `/admin/[tenant]/inventory` 庫存追蹤 + 低庫存警告 + 異動歷史
7. ✅ `/admin/[tenant]/classes` 課程 CRUD(oilswa 用)
8. ✅ Variant Stage A+B:`product_variants` 表 + admin nested CRUD UI

**對應提案**:家族提案 5.2「愛油哇商行管理系統」月 1-2 ✅

### Phase 4-Beta(Week 3-4):LIFF 商品端(給 LINE 用戶)

**目標**:三合一 LINE 用戶可以從 Rich Menu 看商品。

**Tasks**:現有 `/m/shop` 路由 → 改為 `/m/[slug]`(tenant-aware)+ 商品詳情 + 購物車 + 結帳。

**Note**:Cyndi 沒有 LINE Bot,**這階段不需要 LIFF 入口**。

### Phase 4-Gamma(Week 5-8):公開網站入口(給 IG / 路人)

**目標**:任何人從 IG / 連結進來都能看商品。

**Tasks**:
1. `/[slug]` 公開攤位首頁(SEO 完整)
2. `/[slug]/p/[product]` 公開商品詳情
3. `/login` 登入頁(只支援 LINE Login)
4. `/[slug]/cart` 購物車(需登入)
5. `/[slug]/checkout` 結帳(需登入,暫不接金流)
6. `/account` 跨 tenant 個人資料
7. `/account/orders` 跨 tenant 訂單歷史
8. SEO 基礎(meta tags、Open Graph、structured data)
9. Vercel domain 設定子網域

### Phase 4-Delta(Week 9-12):驗收 + 員工適應 + 微調

員工真實用後台 1-2 週收痛點 → 改 admin UX → 跟爸媽 review → 評估 Phase 5 啟動條件。

### Phase 5(待評估):email 註冊 + 美感主題 + 金流

**啟動條件**:
- 爸媽對 Phase 4 滿意
- Cyndi 系統穩定運作
- 找到設計師合作
- New Era Oil 第一個商品時程明朗

---

## 八、Claude Code 的行動準則(v1.1 更新)

### DO

✅ 嚴格遵守 Stall schema(platform_users / tenant_customers 拆分)
✅ 所有新表帶 `tenant_id`(除 platform layer)
✅ Multi-tenant 從第一行 code 就考慮
✅ 用 RLS(現在全 deny,只 server actions 用 service_role)
✅ **公開頁面跟 LIFF 共用 component,不要寫兩份**
✅ **公開頁面要做 SEO**(meta、OG、structured data)
✅ 每個 tenant 用 slug 路由(`/[slug]`, `/m/[slug]`)
✅ 對外品牌名仍叫各自的(oilswa、cyndi),Stall 對外品牌等 Phase 5
✅ 每次新功能完成,update `progress.md`
✅ 商業敏感資訊不要寫進 commit message 或 public code

### DON'T

❌ 不要建 catalog / share_cards / inquiries 這些 Phase 2 表
❌ 不要做 3 套主題系統(等設計師)
❌ 不要試圖整合金流(Phase 4 不接,Phase 5 才評估)
❌ 不要在 oilswa 系統裡寫 doTERRA 業績計算邏輯(政策紅線)
❌ 不要把 PII log 到外部服務
❌ **不要在 Phase 4 開放 email 註冊**(等 Phase 5)
❌ **不要在公開頁面顯示「Stall」品牌**(等 Phase 5)
❌ 不要建立「Peter 個人」以外的 super admin role

---

## 九、紅線(必避)

1. **doTERRA 政策**:第 5.C / 5.D / 5.E / 10.A / 10.B.7 條
2. **資料保護**:PII 不分享第三方
3. **權限隔離**:RLS 全 enable + tenant_id 一致性檢查
4. **法律歸屬**:Stall 不當金流中介

---

## 十、跟其他文件的關係

| 文件 | 用途 | 主要讀者 |
|---|---|---|
| `Stall_README.md` | 商業策略 | Peter 自己回顧 |
| `SPEC.md` | family-linebot 工程規格 | Claude Code 實作參考 |
| `progress.md` | 開發進度 | Claude Code 知道做到哪 |
| **`STALL_ARCHITECTURE.md`(本檔)** | **Stall 架構決定 + 遷移路徑** | **Claude Code 接到 Stall 任務時的 source of truth** |

衝突時以本檔為準。

---

## 十一、版本歷史

| 版本 | 日期 | 變更 |
|---|---|---|
| 1.0 | 2026-05-19 | 初版 |
| 1.1 | 2026-05-19 | 加雙入口架構、Phase 重新排序、Phase A migration 已完成 |

---

*作者:Peter + Claude(Sonnet 4.7)架構討論結果*
