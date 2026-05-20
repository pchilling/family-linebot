# Progress & Flows

> 開發進度 + 各 flow step by step + 部署紀錄。最後更新:2026-05-21(Phase 6.1 教室簽到 + 修 deploy 卡住的 type error)

---

## 一、開發進度 timeline

### Phase 0:平台 setup(2026-05-18)

| 階段 | 內容 | Commit |
|---|---|---|
| Step 1 | scaffold(Next.js 15 + TS,git init) | `6b744bd` |
| Step 2 | LINE webhook 骨架 + echo reply | `0a07231` |
| Step 3 | Supabase schema(tenants / users / messages) | `c059dc6` |
| Step 4 | webhook 整合 DB(upsert users / log messages) | `a2a3761` |
| Step 5 | Rich Menu setup script + placeholder PNG | `ca16519` |
| Step 6 | Vercel 部署 + LINE webhook URL 接上 | — |

### Phase 1:本月課程 from DB(2026-05-19)

| 階段 | 內容 | Commit |
|---|---|---|
| 1.1 | classes 表 + webhook postback dispatch | `01371af` |
| 1.2 | refactor:classes 改 region_id FK + 加 regions 表 | `4e6502c` |
| 1.3 | filter future(只列未來 + 今天場次) | `f5bab8e` |
| 1.4 | seed 12 假課(精油基礎 / 親子療癒 / 芳療師認證班) | (REST seed) |

### Phase 2:/admin Classes CRUD(2026-05-19)

| 階段 | 內容 | Commit |
|---|---|---|
| 2.1 | middleware + supabase-server + admin/login + actions + classes 列表 + 編輯刪除 | `0afedbf` |
| 2.2 | admin user 設定(Supabase Auth UI Add user) | (Peter 自己 setup) |

### Phase 3:LIFF 會員專區(2026-05-19)

| 階段 | 內容 | Commit |
|---|---|---|
| 3.1 | ALTER users 加 full_name / phone / address / birthday | (SQL,vault 外跑) |
| 3.2 | @line/liff + app/m/member page + actions | `f56f242` |
| 3.3 | Rich Menu 第 4 格改「會員中心」(URI to LIFF) | `6a9d69b` |
| 3.4 | LIFF Login channel 建 + Publish | (LINE Dev Console) |
| 3.5 | Vercel env(`NEXT_PUBLIC_LIFF_ID` + `LIFF_CHANNEL_ID`) | (Vercel Dashboard) |
| 3.6 | error banner fix(submit 失敗時可見訊息) | `11f736c` |

### Stall Phase A 平台層 schema migration(2026-05-19)

family-linebot 演化為 Stall(多租戶電商平台)第一步 — schema 拆分平台層 + tenant 層。oilswa 為第一個 Stall tenant。

| 階段 | 內容 | Commit |
|---|---|---|
| A.1 | `platform_users`(跨 tenant 人)+ 搬 users 過去 + `tenant_members` + tenants 加 slug/plan/features 等 | `4abb3c4` |
| A.2 | review round 2 修(`pg_advisory_xact_lock` / slug fallback / merged partial index) | `899901f` |
| A.3 | v1.1 delta:雙入口架構 + auth provider 預埋 + SEO 欄位 + products.slug + guest checkout 預埋 + Cyndi tenant(Peter 代管) | `51c7e03` / `0ae4da4` |

oilswa tenant `8106161d-ad82-4bad-ba61-da1aac65bb2c` (slug=oilswa, plan=enterprise)
Cyndi tenant `8c032fc3-880a-4e96-9dc4-73684511f192`(slug=cyndi, plan=pro, Peter 代管)

### Phase 4-Alpha admin tenant-aware(2026-05-19)

對齊 STALL_ARCHITECTURE v1.1 第七章 Phase 4-Alpha 6 個 task,oilswa + Cyndi 平行。

| 階段 | 內容 | Commit |
|---|---|---|
| 4α.1 | `/admin/[tenant]/products` prototype + getTenantBySlug helper + tenant layout nav | `cc8420f` |
| 4α.2 | `/admin/[tenant]/classes` + `/orders` + `/orders/[id]` 全 migrate + 舊 routes redirect | `38b01b7` |
| 4α.3 | `/admin/[tenant]/customers`(列 users + aggregate 訂單數/累積消費)+ `/admin/[tenant]/inventory`(低庫存警告 + stock_movements 異動表) | `303e33c` |

URL pattern:
- 預設 `/admin` → redirect `/admin/oilswa/products`
- oilswa:課程 / 商品 / 訂單 / 客戶 / 庫存
- cyndi:課程 / 商品 / 訂單 / 客戶 / 庫存(課程 tab 對 cyndi 空)
- 舊 routes 全 redirect 預設 tenant

### Variant 重構 Stage A 平台層 schema(2026-05-19)

對齊 GraceHan 拆 product / variant 兩層,給 Cyndi 童裝色 × 尺寸 × SKU 各自庫存。

| 階段 | 內容 | Commit |
|---|---|---|
| 5.2.A | `product_variants` 表 + seed default variants from products + alter order_items/stock_movements 加 variant_id + backfill | `15b1e63` / `f8c8e0e` |

兼容性:
- `order_items.variant_id` / `stock_movements.variant_id` 暫 nullable
- 既有 `products.sku` / `price_twd` / `stock` 保留(legacy)
- Stage C 才切 not null + deprecate

### Variant 重構 Stage B admin UI(2026-05-19)

| 階段 | 內容 | Commit |
|---|---|---|
| 5.2.B | `VariantRow` type + variant CRUD actions + `createProduct` 同步建 default variant + admin/products page 加 nested variant inline 編輯/新增/刪 | `0e98cea` |

### 商業模式策略調整(2026-05-20)

Stall 商業模式從原本 4 階(Free/Plus/Pro/Enterprise)收斂為 **Pro + Enterprise 2 階**。LINE Bot 改為獨立 add-on 服務(走 NEO 外部簽約),用 `tenants.features` jsonb 判斷,**不綁 plan**。所有 plan 不接金流,走「匯款 + 手動對帳」(長期策略,不是 Phase 1 限制)。

| 項目 | 變更 |
|---|---|
| Plan 階級 | 4 階 → 2 階(Pro / Enterprise) |
| LINE Bot | plan 內建 → `features.line_bot` add-on,聯繫 NEO 客製 |
| LIFF | Phase 內建 → `features.liff` add-on,Enterprise 預設帶 |
| 金流 | Phase 1 不做 → **長期不接**,顯示匯款帳戶 + 手動對帳 |
| Self-serve sign-up | Phase 5 規劃 → 需要時才做(目前自己人 / 接案) |
| Theme | 4 層 → 2 層(Pro / Enterprise) |

各 tenant 對應:
- oilswa = Enterprise,`features={"line_bot": true, "liff": true}`
- cyndi = Pro(之後升 Enterprise),`features={}`,核心場景是 Phase 4-Gamma 公開網站
- Kim = Pro(pending,公開網站上線後啟用)

文件更新:`Stall_README.md`(§4/5/10/12)、`STALL_ARCHITECTURE.md`(決定 2/4/7、Phase 七、§八 DO/DON'T)。

**待跑 SQL**:oilswa `features` backfill 加 `{"line_bot": true, "liff": true}`(Peter 自己在 Supabase Studio 跑)。

### Phase 4-Gamma 開工(2026-05-20)

公開網站第一波,只服務「自己人 / 接案」客戶,guest checkout 為主(LINE Login 留到需要時)。對齊 STALL_ARCHITECTURE §七 Phase 4-Gamma + 商業模式策略調整。

| 子階段 | 內容 | 檔案 |
|---|---|---|
| **Gamma.1** | `/[slug]` 攤位首頁 + 主題 wrapper(brand_color null fallback)+ 商品列表 grid + 「攤位準備中」empty state | `app/[slug]/layout.tsx` + `app/[slug]/page.tsx` + `lib/supabase.ts`(加 `getTenantPublic` / `getActiveProducts`) |
| **Gamma.2** | `/[slug]/p/[product]` 商品詳情(server)+ Variant 選擇器(radio,client)+ SEO metadata | `app/[slug]/p/[product]/page.tsx` + `variant-selector.tsx` + `lib/supabase.ts`(加 `getProductBySlug`) |
| **Gamma.3a** | 購物車狀態(localStorage,tenant 隔離 key)+ sticky header CartLink + variant-selector「加入購物車」啟用 | `app/[slug]/cart-state.tsx` + 改 `layout.tsx` / `variant-selector.tsx` / 商品詳情 page |
| **Gamma.3b** | `/[slug]/cart` 購物車頁(qty 增減 / 移除 / 小計 / 前往結帳) | `app/[slug]/cart/page.tsx` |
| **Gamma.3c** | `/[slug]/checkout` 結帳表單(client)+ `createOrder` server action(從 DB 重拉 price 防竄改 + 庫存檢查)+ `/[slug]/order/[order_no]` 訂單成立頁 | `app/[slug]/checkout/page.tsx` + `actions.ts` + `app/[slug]/order/[order_no]/page.tsx` |
| **Gamma.5 部分** | 商品頁加 schema.org Product / AggregateOffer JSON-LD(Google rich result) | 改 `app/[slug]/p/[product]/page.tsx` |

下單完整 flow:
```
/[slug] → 點商品 → /[slug]/p/[product] → variant 選擇 + 加入購物車
   ↓
/[slug]/cart → 改數量 / 移除 / 前往結帳
   ↓
/[slug]/checkout → 填收件資料 + 送出
   ↓
createOrder server action(driver:從 DB 重拉 variant price/stock 驗證 → insert orders + order_items
   → DB triggers 自動產 order_no / 算 total / 寫 stock_movements / 扣庫存)
   ↓
clear() 清前端購物車 → router.push
   ↓
/[slug]/order/OW-202605-NNNN(訂單成立 + 「賣家會私訊匯款資訊」黃色提醒)
```

新訂單在 admin `/admin/[tenant]/orders` 直接看得到(`source='web'`)。

**未做(等需要再做)**:
- LINE Login + `/account` + `/account/orders`(Gamma.4)— 目前都是自己人,guest checkout 夠
- Vercel custom domain(Gamma.9)— 等對外開放再設
- sitemap.xml / robots.txt — 對外才需要
- cart / checkout / order 頁面 noindex meta — 本地測試先不處理

### 分級調整 v2(2026-05-21):Free 階復活

5/20 收斂成 2 階(Pro / Enterprise)後,5/21 為「自己人 / 個人 / 二手」用例(主要 target = Kim)再加回 **Free**。最終 3 階:Free / Pro / Enterprise。

| 維度 | Free | Pro | Enterprise |
|---|---|---|---|
| 公開網站 + 商品 + 訂單 flow | ✅ | ✅ | ✅ |
| Admin(products / orders / customers / classes) | ✅ | ✅ | ✅ |
| **inventory(`/admin/[tenant]/inventory`)** | **❌** | ✅ | ✅ |
| 公開網站 **Made with Stall 浮水印** | **強制** | 拿掉 | 拿掉 |
| 字體組 / 按鈕風格 | ❌ | ✅ | ✅ |
| 客製設計 + 自訂網域 | ❌ | ❌ | ✅ |
| LINE Bot / LIFF(features add-on) | 不開放 | 可加購 | 預設帶 |

tenant 對應更新:
- oilswa = **Enterprise**,features={line_bot, liff}
- cyndi = **Pro**(之後升 Enterprise),features={}
- Kim = **Free**(pending,還沒建 tenant),features={}

**code gating 還沒實作**:目前 `tenants.plan` / `features` 都還沒用來真正鎖功能,Free / Pro 看到的 admin 一樣。要鎖 inventory + 加浮水印是後續 code 工程。

文件更新:`Stall_README.md`(§4/§5)、`STALL_ARCHITECTURE.md`(決定 7、§八 DON'T)。

### 5/21 整波收尾(2026-05-21):admin + Variant Stage C 部分 + Free gating + Kim tenant

完整 Phase 4-Gamma admin 端 + 部分 Variant Stage C + Free gating 落地 + Kim tenant 建立。

**Code 改動**:

| 主題 | 檔案 | 重點 |
|---|---|---|
| Admin source-aware | `app/admin/[tenant]/orders/page.tsx` + `[id]/page.tsx` | 列表加「來源」欄(web/liff/manual);訪客客戶 fallback `shipping_recipient`;詳情加 source badge + 訪客客戶資訊區 + order_items 顯示 variant_name |
| Inventory variant 改造 | `app/admin/[tenant]/inventory/page.tsx`(rewrite) | 改讀 `product_variants`、低庫存 per-variant、異動列加 variant badge |
| Free gating(inventory) | 同上 | plan='free' 顯示鎖頭頁(沒查 DB,直接 return) |
| Free gating(浮水印) | `app/[slug]/layout.tsx` | footer plan='free' 顯示「Made with Stall」細字 |

**DB SQL(已跑)**:

- `tenants.order_prefix` 欄位 + format check(`^[A-Z]{2,5}$`)+ generate_order_no trigger 改動態查(取代 hardcoded 'OW')+ backfill 既有 OW 訂單到各 tenant prefix
- `update_product_stock` trigger 改寫 `product_variants.stock`(有 variant_id 用 variant、fallback products)
- Kim tenant INSERT + tenant_members(Peter 為 owner)

**schema.sql 同步更新**:Phase 5.3(order_prefix)、update_product_stock 重寫、Kim tenant block 全進 schema.sql,constraint add 用 `do $$ ... exception when duplicate_object ... end $$` 包起來避免 rerun 撞。

**目前 3 個 tenant 狀態**:

| Slug | Plan | Prefix | Features | Owner | 用途 |
|---|---|---|---|---|---|
| oilswa | enterprise | OW | `{line_bot, liff}` | Peter | 家族(三合一愛油哇) |
| cyndi | pro | CY | `{}` | Peter 代管 | 接案(童裝代購) |
| kim | free | KM | `{}` | Peter 代管 | 自己人(二手,slug placeholder) |

**新 Tech debt**:

- `products.stock` 之後不再被 trigger 更新(全寫 variant.stock);現有 admin product CRUD 還在 read / write `products.stock`,Stage C 結尾 deprecate 時要全清(legacy fallback 還在 trigger 內,沒 variant_id 的舊資料仍寫 product.stock,需 audit)
- Free gating 只擋 inventory + footer 浮水印;**Pro 的字體 / 按鈕風格 客製** 還是 spec 概念,沒 code gate
- Kim slug='kim' 是 placeholder(正常 SaaS 該本人選);沒 admin UI 改 slug,要跑 update SQL,且會 break 既有 URL
- 沒 admin tenant settings 頁(brand_color / description / payment_info 都靠 SQL 設)

### Admin 介面 + 訂單體驗強化(2026-05-21)

整波收尾後續微調:admin 跨 tenant 操作順暢度 + 客人下單後 UX 完整。

**Admin 介面**:

- **Admin nav 改 2 列**(`app/admin/[tenant]/layout.tsx` + 新 `nav-links.tsx`):Row 1 = tenant 名 + plan badge(free 灰 / pro 藍 / enterprise 紫)+ `slug · prefix` + 「切到 X」其他 tenant + 預覽公開頁 ↗;Row 2 = 商品 / 訂單 / 客戶 / 庫存 🔒 / 課程 / 設定
- **Nav active 高亮**(`nav-links.tsx` client component,用 `usePathname()`):active = 粗體 + 黑色 + 下方黑線
- **Tenant settings 頁**(`app/admin/[tenant]/settings/page.tsx` + `actions.ts` 新):
  - 可改:`name` / `description` / `brand_color`(color picker)/ `og_image_url` / `contact_info`
  - Read-only 顯示:`plan` / `slug` / `order_prefix` / `features` / `status`
  - `plan` / `features` / `slug` 不能在這裡改(需 NEO 介入)
- **`getAllActiveTenants()` helper**(`lib/supabase.ts`)+ `TenantBySlug` 加 `order_prefix` 欄

**訂單體驗**:

- **`tenants.contact_info`** 欄位(Phase 5.4):free text 多行,賣家自寫 LINE / 電話 / Email / IG 等
  - Settings 「對外聯絡資訊」textarea
  - 訂單成立頁加「聯絡賣家」白卡(`whiteSpace: pre-wrap` 保留換行)
- **Order lookup 頁**(`app/[slug]/order-lookup/page.tsx` + `actions.ts` 新):
  - Guest 用 `order_no` + (Email 或電話)查訂單,比對成功跳 `/[slug]/order/[order_no]`
  - **錯誤訊息統一**「找不到訂單,請確認...」(無論 order_no 錯 / Email 錯都同訊息,避免 enumeration)
  - Tenant layout footer 加「查我的訂單 →」連結
- **訂單成立頁加「📋 複製」按鈕**(`copy-button.tsx` 新,client + Clipboard API + execCommand fallback);加提醒「請保留此編號,日後可在『查我的訂單』查」

**DB SQL 已跑**:
```sql
alter table tenants add column if not exists contact_info text;
```

**新 tech debt**:
- Settings save 沒 toast / 錯誤訊息展示(server action 回 ok/error 但 UI 沒顯示)
- Tenant switcher 列**所有** active tenant(沒做 tenant_members 過濾);多人登入時要加 RBAC
- Order lookup 電話比對**完全相等**(沒 normalize 格式,`0900-000-000` ≠ `0900000000`)

### Phase 6.1 教室簽到(2026-05-21,線 1 三合一愛油哇月 1 補完)

學員透過教室 QR Code 自助簽到 + admin 手動補簽(Wave 3 還沒做)。設計上**只走 QR**:中老年學員不打 keyword、不點 Rich Menu 學東西,QR 是最簡單的 in-person 觸發。

**Schema(Phase 6.1)**:
- `attendances` 表(tenant_id / class_id / user_id / checked_in_at / method / created_by / note)
- `unique(class_id, user_id)` 防同人同課重簽
- `method` 4 種:liff / qr / manual / admin
- `created_by → platform_users`:manual / admin 才填(audit 用)
- `check_attendance_tenant` trigger:tenant_id 必須跟 classes.tenant_id 跟 users.tenant_id **兩邊都一致**(對齊 order_items_check_tenant pattern + 多檢查 user,防 oilswa 學員被誤建到 cyndi 簽到)
- `user_id → users(id)`:跟 orders/messages 一致,等 Phase B 一次全 migrate 到 platform_user_id

**Code**:
- `app/m/checkin/page.tsx`(client LIFF,新):
  - 沒 `?class_id` → 顯示「請掃教室 QR Code」引導
  - 有 `?class_id` → 自動簽到,結果以綠卡(✓ 簽到成功)/ 紅卡(已簽 / 找不到 / 已取消)顯示
  - 全在 LIFF 內,學員體驗:掃 QR → 看到結果 → 結束
- `app/m/checkin/actions.ts`(server,新):
  - verifyIdToken(用 NEXT_PUBLIC_LIFF_ID_CHECKIN / LIFF_CHANNEL_ID_CHECKIN fallback 既有 LIFF_CHANNEL_ID)
  - `loadTodayClasses`(目前 page 沒呼叫,留給未來 admin / debug)
  - `checkin`:check class + insert attendance,23505 unique violation 回友善「已簽過」

**入口**:
- 教室 QR Code:`https://liff.line.me/2010125926-M0ozLk50?class_id={class.id UUID}` — 老師印貼教室
- ❌ Keyword「簽到」**沒做**(設計決定:老人不打字)
- ❌ Rich Menu 一格**沒做**(保留「📰 最新消息」placeholder)
- ⏳ Admin 手動勾 — Wave 3 還沒做

**Setup**:
- LIFF channel:`2010125926-M0ozLk50`,endpoint `/m/checkin`(同 LINE Login channel,LIFF_CHANNEL_ID 共用)
- env vars:本機 `.env` + Vercel production 都加 `NEXT_PUBLIC_LIFF_ID_CHECKIN=2010125926-M0ozLk50`

### 修 deploy 卡住的 type error(2026-05-21)

**重大發現**:5/20 那批 5 個 commit(Phase 4-Gamma 公開網站 + admin 改造 + spec)推上 GitHub 後,**Vercel build 一直靜默失敗**,因此 production 一直跑舊版(Variant Stage B)。今天才發現 — Webhook 沒回應簽到 keyword、`/m/checkin` 404、追下去才看出 deploy 沒過。

**3 個 TypeScript build error 修了**:
1. `app/[slug]/order/[order_no]/page.tsx`:`Row` type 跟 supabase 回傳結構不合(OrderDetail 有 items 但 DB 是 order_items)→ 改用 `Omit<OrderDetail, 'items'>` + cast through unknown
2. `app/admin/[tenant]/settings/actions.ts`:React 19 `<form action>` 要 `Promise<void>`,改 `throw on error` 取代 return result 物件(失去 toast 能力,Wave 4 加 useActionState 補)
3. `app/m/checkin/actions.ts`:supabase 對 *-to-one regions join 推成 array → cast through unknown 繞過

**Bonus fix**:
- `package.json` setup:rich-menu 改用 `.env`(專案早已從 .env.local 遷移)
- Rich Menu uploader 重跑 + 拿到新 richMenuId(`richmenu-c3bb1b7a3bc4e5415b663de524c1359b`,update 進 tenants.rich_menu_id)

**Lesson**:Vercel build status 沒在 watch — 之後 push 後要 curl 確認(`curl -s -o /dev/null -w "%{http_code}" production-url/some-new-route`)。或啟 GitHub Actions / Vercel Slack webhook。

### Outstanding

**Phase 4-Alpha 完成 ✅**(6 個 task 全 done)

**Phase 4-Beta / Variant Stage C(下波合併)**:
- LIFF `/m/shop` placeOrder 用 variant_id 而非 product_id
- LIFF 商品詳情顯示 variant 選擇器(色 / 尺寸下拉)
- inventory page 改列 variants 不是 products
- orders detail 顯示 variant_name(join product_variants)
- stock_movements trigger 切 variant.stock(目前 trigger 還 update products.stock)
- Stage C 收尾後 deprecate products.sku / price_twd / cost_twd / stock(改 view 或 drop)

**Phase 4-Gamma(公開網站)**(2026-05-20 Gamma.1-3 + 部分 Gamma.5 完成 ✅):
- ✅ `/[slug]` 攤位首頁(Gamma.1)
- ✅ `/[slug]/p/[product]` 商品詳情 + variant 選擇器(Gamma.2)
- ✅ `/[slug]/cart` + `/checkout` + `/order/[order_no]` guest checkout 完整 flow(Gamma.3)
- ✅ 商品 JSON-LD structured data(Gamma.5 部分)
- ⏳ `/login` LINE Login + `/account` 跨 tenant 個資 + `/account/orders` 訂單歷史(Gamma.4,等需要)
- ⏳ Vercel custom domain + sitemap / robots / noindex(Gamma.5 剩下,等對外開放)

**Phase 4-Delta(Week 9-12)**:員工驗收 + UX 微調

**Phase 5(待評估)**:email 註冊 + 3 套美感主題 + 金流(ECPay / LINE Pay)

**Stall Phase B users → tenant_customers rename(待 Variant Stage C 一併)**

**Tech debt**:
- Peter platform_users.id (`59f07f39-...`)跟 users.id (`c5a10ccb-...`)沒對齊(Phase A placeholder 順序問題;Option B fix SQL 未跑)— code refactor 用 `line_user_id` 重建 mapping
- Peter platform_users.display_name = hardcode 「Peter」(同根因,真實 LINE 名是 P🐻)
- `product_variants.stock` 跟 `products.stock` 暫雙寫(Stage C trigger 切到 variant 層才同步)
- Phase 2 啟用 email / Google auth 時,需 backfill 既有 platform_users 的 LINE auth method 到 `platform_user_auth_methods` 表

### 線 1 / 線 2 進度(2026-05-19 Stage B 收尾)

| 線 | 進度 |
|---|---|
| 線 1(三合一 LINE@) | 月 1 約 **60%**(學員資料庫 LIFF + 本月課程,缺出席紀錄 / 報名活動) |
| 線 2(愛油哇後台) | 月 1 **80%**(商品 + 訂單 + 客戶 + 庫存 admin + LIFF 商品瀏覽下單 + variant 拆細;缺 LIFF 變體選擇 / 出貨流程細化) |

線 2 大進展。**Cyndi tenant(童裝)也可直接用同套 admin** — variant Stage B 讓 Cyndi 可加多色 × 多尺寸 product。

下個 milestone:Variant Stage C 切 LIFF + inventory + orders → 線 2 月 1 真正收尾 + Phase 4-Gamma 公開網站開始。

---

## 二、外部設定紀錄(reproduce 用)

### LINE Messaging API channel(bot)
- Channel ID: `2010124883`
- Bot User ID: `U5ca95126d61901475067d3e90bec0dd3`
- Bot basic ID: `@076bahie`
- Display name: 三合一愛油哇

### LINE Login channel(LIFF)
- Channel ID: `2010125926`
- LIFF ID: `2010125926-mRl3l3lO`
- LIFF size: Full
- LIFF Endpoint URL: `https://family-linebot-delta.vercel.app/m/member`
- Scope: `profile` + `openid`
- Bot link feature: On (Aggressive),綁定上面 Messaging API channel

### Supabase
- Project URL: `https://tkodwzgrbhhdalcjepad.supabase.co`
- Region: Tokyo (ap-northeast-1)
- Tenant 1: `8106161d-ad82-4bad-ba61-da1aac65bb2c`「三合一愛油哇 LINE@」

### Vercel
- Project: `family-linebot`
- Production URL: `https://family-linebot-delta.vercel.app`
- Env vars(Production + Preview + Development):
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_CHANNEL_ID`
  - `LINE_BOT_USER_ID`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DEFAULT_TENANT_ID`
  - `NEXT_PUBLIC_LIFF_ID`
  - `LIFF_CHANNEL_ID`

### GitHub repo
- `pchilling/family-linebot`(private)

---

## 三、User flows

### Flow 1:第一次加 bot 好友

```
用戶掃 QR / 加 @076bahie
       ↓
LINE 推 follow event 給 /api/webhook
       ↓
verify signature → 反查 tenant by destination
       ↓
lineClient.getProfile(userId)
       ↓
upsert users(tenant_id + line_user_id + display_name + picture_url)
       ↓
reply「歡迎加入!請點下方主選單開始使用 🙂」
       ↓
Rich Menu 自動顯示(default 已 setDefault)
```

### Flow 2:用戶點「📅 本月課程」

```
Rich Menu 第 1 格 → postback data="action=monthly-classes"
       ↓
webhook 收 postback event
       ↓
buildReplyText() dispatch action=monthly-classes
       ↓
getClassesForCurrentMonth(tenantId)
  ├─ 計算 Asia/Taipei 本月區間
  ├─ effectiveStart = max(now, monthStart)  ← 只列未來 + 今天
  └─ supabaseAdmin .from('classes').select('*, regions(name)')
       ↓
formatMonthlyClassesText() group by region
       ↓
reply 列課表 + 「想預約 / 報名請直接留言」
```

### Flow 3:用戶點「👤 會員中心」

```
Rich Menu 第 4 格 → URI action liff.line.me/2010125926-mRl3l3lO
       ↓
LINE app 內開 webview 載 /m/member
       ↓
[client] liff.init({ liffId })
       ↓
liff.isLoggedIn()?  ← false 時 liff.login() 跳 LINE 認證
       ↓
liff.getProfile() + liff.getIDToken()
       ↓
[server action] loadProfile(idToken)
  ├─ POST https://api.line.me/oauth2/v2.1/verify(verify idToken)
  ├─ 拿 sub = LINE userId
  └─ supabaseAdmin .from('users').select(full_name, phone, address, birthday)
       ↓
[client] 渲染 form(空 / pre-fill 既有資料)
       ↓
用戶填 / 改 → 按「更新資料」
       ↓
[client] formData.set('idToken', tok) → saveProfile(formData)
       ↓
[server action] verify idToken → upsert users
       ↓
[client] loadProfile reload → setSavedAt → 顯示「已儲存 ✓」banner
```

### Flow 4:用戶點「🛍 商品專區」

```
Rich Menu 第 3 格 → URI action www.oilswa.com.tw
       ↓
LINE app 內 webview 直接連網站
(無 webhook 互動)
```

### Flow 5:用戶點「📰 最新消息」/「💬 專屬客服」

```
postback data="action=news" 或 "action=contact"
       ↓
webhook → describeEvent() → getPostbackReply()
       ↓
reply placeholder 文字(news / contact 各自 FAQ + 真人 keyword)
```

### Flow 6:管理員改課

```
admin 開 /admin/login
       ↓
輸入 Supabase Auth email + password
       ↓
signIn server action
  └─ supabase.auth.signInWithPassword → 寫 cookie
       ↓
middleware refresh session → 已登入 → redirect /admin/classes
       ↓
classes page server-side fetch regions + classes
       ↓
列表展示,inline 編輯每筆
       ↓
按「儲存」→ updateClass server action
  └─ supabaseAdmin .from('classes').update(...).eq('id', ...)
       ↓
revalidatePath('/admin/classes') → 列表重新拉
       ↓
用戶下次點本月課程 → 看到最新資料
```

---

## 四、部署流程

```
local edit → git add + commit → git push origin main
                                       ↓
                          GitHub 觸發 Vercel webhook
                                       ↓
                  Vercel pull repo → npm install → next build
                                       ↓
                        Deploy 完成(~1 分鐘)
                                       ↓
                family-linebot-delta.vercel.app 自動更新
```

**注意**:
- `.env` 在 `.gitignore`,**不 push 上去**
- Vercel env vars 在 Dashboard → Settings → Environment Variables 手動設(分 Production / Preview / Development)
- 改 env vars 後要 trigger redeploy 才生效(或 push 新 commit)
- LINE webhook URL 改 Vercel domain 後,測 webhook verify 是 LINE Dev Console 內的「Verify」按鈕

---

## 五、Schema 變更 SQL 累積(reproduce 用)

```sql
-- Phase 0 base
create table tenants (...);
create table users (...);
create table messages (...);
create trigger ...

-- 漏跑 ALTER 補救
alter table tenants add column if not exists rich_menu_id text;
alter table tenants add column if not exists created_at timestamptz not null default now();

-- Phase 1
create table regions (...);
drop table classes;  -- 重建
create table classes (...);  -- with region_id FK

-- Phase 3
alter table users add column if not exists full_name text;
alter table users add column if not exists phone text;
alter table users add column if not exists address text;
alter table users add column if not exists birthday date;

NOTIFY pgrst, 'reload schema';
```

---

## 六、已知 issues / TODO

- 12 假課之後 admin 替換真實課程
- LIFF Phase 3 僅 form 填,「我的訂單 / 課程歷史」未實作(等 Phase 4 entity)
- ⚠️ Service role key 曾出現在本機 chat log,**正式上線前必 rotate**(Supabase Settings → API → Generate new)
- Telegram polling 之前斷過,要設 Windows Task Scheduler At Logon 自動啟動(尚未)
- 進階教室目前綁在「專屬客服」內(用戶輸入「進階」keyword),未來實作 keyword webhook handler
- LINE @ display name 從「愛油蛙」→「愛油哇」改過

---

## 七、Commit log(主幹)

```
6b744bd  init: family-linebot 專案骨架
0a07231  feat: LINE webhook 骨架 + echo reply
c059dc6  feat: Supabase schema (multi-tenant from day 1)
a2a3761  feat: webhook 整合 DB
ca16519  feat: Rich Menu 對齊提案 v5(5 格上 3 下 2)
01371af  feat: 本月課程從 DB 拉真資料
4e6502c  refactor: classes 改 region_id FK + 加 regions 表
f5bab8e  feat: 本月課程只列未來 + 今天
0afedbf  feat: /admin login + classes CRUD(Phase 2)
f56f242  feat: LIFF 會員專區(Phase 3)
6a9d69b  refactor: Rich Menu 第 4 格改「會員中心」(LIFF URI)
11f736c  fix: LIFF form 加 inline error banner
4abb3c4  feat: Stall Phase A migration — platform 層 schema
899901f  fix: Phase A round 2(pg_advisory_xact_lock / slug fallback / merged index)
51c7e03  feat: STALL_ARCHITECTURE v1.1 — 雙入口 + Cyndi tenant + schema delta
0ae4da4  fix: Cyndi tenant features 從 {catalog:true} 改 {}
cc8420f  feat: Phase 4-Alpha task 3 — /admin/[tenant]/products tenant-aware
38b01b7  feat: Phase 4-Alpha task 3-4 完整 — admin routes tenant-aware
303e33c  feat: Phase 4-Alpha task 5+6 — customers + inventory pages
15b1e63  feat: Phase 5.2 Variant Stage A schema(product_variants + backfill)
f8c8e0e  fix: stock_movements backfill 暫關 append-only trigger
0e98cea  feat: Variant Stage B — admin/products page 加 nested variant CRUD
```
