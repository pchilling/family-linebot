# Progress & Flows

> 開發進度 + 各 flow step by step + 部署紀錄。最後更新:2026-05-22 晚(Demo prep — QR 簽到 / LIFF 商城 redesign / 對帳 UI / PWA / Mobile RWD)

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

### Phase 6.1 Wave 3 + settings toast(2026-05-21 下午前段)

- **/admin/[tenant]/attendances Wave 3**(`c1a4498`):
  - 詳情頁加 3 個新 section:「已報名」/「候補」/「已取消/沒到」
  - server actions:`promoteWaitlist` / `cancelReservationAdmin` / `markNoShow`
  - promote 後自動 reorder waitlist position;取消 confirmed 自動 promote 第 1 個候補
- **Settings 加 toast**(`048b687`):
  - 拆出 client `<SettingsForm/>` 用 `useActionState`
  - server action signature 改 `(prev, formData) => SettingsState`
  - success 綠 banner + 儲存時間 / error 紅 banner / pending 按鈕 disabled

### Phase 6.2 — 活動報名 + 候補表單(2026-05-21 下午)

「活動」沿用 classes 表;新增 `reservations` 表處理報名 / 候補 / 取消 / 沒到狀態。

**Schema(Phase 6.2,新表)**:
- `reservations(tenant_id, class_id, user_id, status, position, note, created_at, updated_at)`
- status: `confirmed / waitlist / cancelled / no_show`
- position: waitlist 順序(1-based);其他狀態 null
- unique(class_id, user_id)
- check_reservation_tenant trigger:跟 attendances 同 pattern(class.tenant 跟 user.tenant 雙檢查)
- updated_at trigger + 3 個 index + RLS

**Wave 1 — 學員 LIFF**(`0b40762`):
- `/m/events` LIFF page(新):列未來 60 天活動 + 容量 / 已報 / 候補數
- 按鈕 4 狀態:報名 / 候補 / ✓已報名(可取消) / ⏳候補中#N(可取消)
- `actions.ts` server actions:loadEvents / reserveSpot / cancelReservation
- env `NEXT_PUBLIC_LIFF_ID_EVENTS` / `LIFF_CHANNEL_ID_EVENTS`(可選,fallback 用既有 LIFF)

**Wave 2 — admin 報名管理**(`b17fa66`):
- 既有 `/admin/[tenant]/attendances?class_id=xxx` 詳情頁加新 section
- 已報名 / 候補 / 已取消沒到 各自列表 + [↑升等][沒到][取消] 按鈕
- 取消 confirmed 自動 promote 候補 + reorder

**Wave 3 候補自動 promote(trigger)— 還沒做**

### Admin 大改造(2026-05-21 下午後段)

UI / UX 從 inline-styles top-nav 升級為 sidebar + Geist + design tokens 統一。

**Design tokens**(`lib/admin-theme.ts` 新):
- Neutral palette(zinc-like `#18181b` primary)
- Geist Sans + Geist Mono via `next/font/google`(無 npm install)
- 共用 style 積木:card / h1Style / h2Style / monoNum / sectionLabel / planBadge
- 尺寸:sidebarWidth 248、contentMaxWidth 1120

**檔案重寫**:
- `app/admin/[tenant]/layout.tsx`:248px sticky sidebar(brand label + tenant + plan badge + 切換 + nav + 預覽公開頁 + email/登出)
- `app/admin/[tenant]/nav-links.tsx`:vertical nav,active 左側 2px bar + 灰底 + 加粗
- `app/admin/[tenant]/page.tsx`:Dashboard(refined metric cards + 2 col list section + quick actions)
- `app/admin/layout.tsx`:從 top header pass-through(避免 sidebar + top-nav 重複)
- `app/admin/login/page.tsx`:套 design tokens + 「Stall Admin」brand + error code 翻譯(`no_tenant_access` / `invalid_credentials`)

**Dashboard 內容**(`62c2374`):
- Hero:日期 small caps + 大字 tenant 名
- 4 個 metric cards:今日訂單 / 簽到(或客戶 fallback)/ 待處理 / 庫存
- 兩欄 ListSection:今日活動 + 未來 7 天有報名
- Quick actions

**客戶詳情頁** `/admin/[tenant]/customers/[id]`(`5593b81`):
- 4 stat cards(累積消費 / 訂單數 / 簽到次數 / 未來報名)
- 個資區(LINE 顯示名可複製給 LINE@ Manager)
- 訂單 / 簽到 / 報名 3 個歷史表(各 50 筆)
- 客戶列表 page 名字變 Link

### 課程 → 活動 + features.activities flag gating(2026-05-21)

(`0b15867`)

- UI 文字:nav「課程」→「活動」、dashboard「今日課程」→「今日活動」
- `tenants.features.activities = true` 才看到活動 / 出席 / 簽到 metric
- cyndi / kim 不裝 → admin 看不到活動 nav / dashboard 沒活動區
- lib/supabase.ts:`TenantBySlug` 加 features 欄、export `hasFeature(tenant, key)` helper

**SQL**:`update tenants set features = features || '{"activities":true}'::jsonb where slug = 'oilswa'`

### Per-user tenant access control(2026-05-21)

(`fe422da`)

Mapping:Supabase Auth email ↔ `platform_users.email` ↔ `tenant_members`

**新 helpers**(lib/supabase.ts):
- `getUserAllowedTenants(email)`:回該 user 在 tenant_members 內 active 的 tenants
- `userHasTenantAccess(email, slug)`

**Layout access check**:
- 沒任何 tenant 權限 → redirect `/admin/login?error=no_tenant_access`
- 沒這個 tenant 權限 → redirect 第一個有權限的 tenant
- Sidebar 切換只列 user 有權的(不再全列)

`/admin` redirect:dynamic,根據 user 第一個能看的 tenant(不再 hardcode oilswa)

**SQL**:
```sql
-- Peter (你目前 LINE-linked super admin):設 email matching Auth
update platform_users set email = '<your-email>' where line_user_id = '<peter line id>';
-- 額外帳號:建 platform_users + tenant_members 給特定 tenant
```

### Phase 7 個性化 — Logo / Banner / Product 圖上傳 + 裁切(2026-05-21 晚)

裝 `react-image-crop` (^11.0.10,3kb 輕量),統一 upload + crop pattern。
用 Supabase Storage bucket `tenant-assets`(public bucket、user 手動建)。

**Phase 7.1 Tenant Logo**(`82fc9e4` + `04f032e` + `9bd2e37` + `46e05c9`):
- DB:`tenants.logo_url text`(SQL `alter table tenants add column if not exists logo_url text`)
- settings/logo-uploader.tsx(client):
  - 1:1 正方形裁切、`circularCrop` 顯示圓形遮罩、輸出 256×256 jpeg
  - 5MB 上限,Canvas drawImage → toBlob → upload
- settings/actions.ts uploadLogo:upload Storage → write `tenants.logo_url`
  - path `{tenant_id}/logo-{ts}.jpg`(timestamp 防 CDN cache 殘留)
- 顯示:
  - Sidebar 頂部 44×44 圓形 + 切換列表 22×22 mini 圓
  - 沒設 logo fallback 首字大寫 Geist Mono 灰底方塊
  - 公開頁 layout header 36×36 圓 logo 在店名左邊
  - 全部用 `borderRadius: '50%'`(底層裁切仍方形,CSS 變圓 — 標準做法)

**Phase 7.2 Product / Variant 圖**(`8f48f84` + `14d0288` + `44fa0b4` + `d3b0038`):
- DB:沿用既有 `products.image_url` / `product_variants.image_url`,無 schema 變
- products/image-uploader.tsx(client,複用):
  - 4:5 直式裁切(IG 貼文比例)、輸出 600×750 jpeg
  - `entity` prop 切換 product / variant:傳 entityId,內部 switch action 呼叫
  - 8MB 上限,變體預設 fallback 用 product 圖
- products/image-actions.ts:
  - uploadProductImage:確認 product 屬於 tenant → upload → write `products.image_url`
  - uploadVariantImage:同 pattern,path `{tenant_id}/variants/{variant_id}-{ts}.jpg`
- products/page.tsx:
  - 每個 product card 頂部加 uploader(獨立於文字表單,即傳即儲)
  - 每個 variant 列底部加 variant uploader(虛線分隔)
  - 移除原本 URL 文字欄
- 公開頁同步更新:
  - 商品 grid card `aspect-ratio: 4/5`
  - 商品詳情大圖 `aspect-ratio: 4/5 + object-fit: cover`
  - 詳情頁 VariantSelector 重構為完整 client gallery:單欄(圖→名→類別→描述→變體→cart)
  - **變體切換時自動換圖**(`variant.image_url ?? product.image_url` fallback)

**Phase 7.3 Hero Banner**(`5ee8632`):
- 沿用既有 `tenants.og_image_url`(同時作 OG 分享 + hero,1200×630)
- settings/banner-uploader.tsx(client):
  - 1200/630 ≈ 1.905 比例裁切、輸出 1200×630 jpeg
  - 10MB 上限,「目前 banner」preview
- settings/actions.ts uploadBanner:upload → write `tenants.og_image_url`
- 公開頁 [slug]/page.tsx 商品列表前 render HeroBanner(aspect 1200/630 + object-fit cover + 圓角 10 + 微陰影)

### Admin UX 強化(2026-05-21 晚)

**Mobile RWD**(`7052326`):
- Desktop ≥768px:sidebar 一樣 248px sticky 不變
- Mobile <768px:sidebar 變 `position: fixed` drawer + `translateX(-100%)`
- 左上漂浮 hamburger 40×40 按鈕 + 半透明 backdrop
- 點 backdrop / 路由變化 自動關閉(usePathname useEffect)
- body.overflow 鎖背景滾動
- 實作:layout 加 inline `<style>` 用 @media + body.sidebar-open class 控制
  client mobile-toggle.tsx 只負責 toggle class(無 React state,DOM 操作)

**Orders filter / search**(`417d71c`):
- 純 server-side(native form GET → URL query params,無 client component)
- Filter 欄位:`q`(訂單號 / 收件人 / 電話 ilike)/ status / payment_status / source / from-to 日期
- URL 可分享 / 加書籤 / 上一頁 work
- 結果 200 上限,空狀態區分「條件無結果」vs「尚無訂單」

**Nav badges**(`096d6d6`):
- Sidebar nav 旁紅圓 18×18 數字 badge
- 訂單:status='open' 計數
- 庫存:active variant 且 stock ≤ 3(Pro+ 才有,Free 顯 PRO 灰字)
- layout 平行撈 count,傳 props 給 NavLinks;>99 顯 99+

**Login 頁 redesign**(`ae58ddd`,5/21 較早):
- 套 admin-theme tokens + Geist 字型 +「Stall Admin」brand mark
- ERROR_MESSAGES 翻譯 code:`no_tenant_access` / `invalid_credentials` / `signin_failed`

**DB SQL 已跑**(這波):
```sql
alter table tenants add column if not exists logo_url text;
-- (Storage bucket "tenant-assets" 在 Supabase Dashboard 手動建,public)
update platform_users set email='<peter email>' where line_user_id='U25423...';
-- + 新增 phsiung957 super admin / peter957733 → oilswa only(per-user access)
```

### Phase 6.3:最新消息(2026-05-21,Bot 月 3 收尾)

LINE@ 用戶點 Rich Menu 第 2 格「📰 最新消息」改成 dynamic 撈 DB 最新 3 則 published news,
不再 placeholder。

新檔案:
- `news` 表 + admin CRUD(app/admin/[tenant]/news/page.tsx + actions.ts)
- webhook 加 `getRecentNews` + `formatNewsText` handler

設計:
- 公告板 mode,不主動推送(避免吃 LINE outbound quota 200/月)
- status: draft / published / archived
- published_at 從 draft → published 寫當前時間,降為 draft 保留歷史
- partial index on (tenant_id, published_at desc) where status='published'
- UI 措辭:「上線公開」而非「立刻發佈」(避免誤期推送)
- 橘色提示框說明「公告板,不推送通知」(回應 user 用後困惑)

Commits:`61a613b` news + `db47e15` nav 加最新消息 + `90d1d22` 措辭澄清

### Perf 最佳化(2026-05-21 後段)

User feedback「兩邊都慢、每個 page 點下去都好久」。curl 量到 cold 3.7s / warm 1.4s。

**loading.tsx skeleton**(`adb6c51`):
- `app/admin/[tenant]/loading.tsx`:hero + 4 metric cards + 2 list sections 骨架
- `app/[slug]/loading.tsx`:banner + 4 product card 骨架
- `@keyframes skeleton-pulse` 透過 dangerouslySetInnerHTML
- 點下去馬上看畫面,perception 變超快

**Admin layout query waterfall 拆**(`dfd3aff`):
- 之前:auth → allowed → tenant → badges 4 個 sequential RTT
- 改:[auth, tenant] 平行 → 後 [allowed, ordersPending, lowStock] 平行
- 4 RTT → 2 RTT,省 ~200ms
- Access check 移到後面(redirect 早無大效益)

**公開頁 ISR**:
- `/[slug]/page.tsx` revalidate=30 / `/[slug]/p/[product]/page.tsx` revalidate=60
- 第二位訪客拿 CDN 快取(<400ms),不打 Supabase
- admin revalidatePath 推 invalidate,不會看到太舊資料

curl 量到:warm 從 1.4s → 0.77s(快 45%)、oilswa 0.86s → 0.45s(快 48%)。

Vercel cold start ~3-4s 是 free tier 限制,需要 Pro / Edge runtime 才能再減。

### Phase 7.4:CRM 介紹網(2026-05-21,純檔案不違 spec)

`6ceb184`:users.member_id + referrer_member_id 兩 text 欄位

- 不做 PV / 業績計算(對齊 spec 紅線)
- 純 text 對應(不 FK),允許「上線還沒辦會員、下線先辦」這種倒著綁
- LIFF /m/member:學員自填 ID + 介紹人 ID
- Admin customer 詳情:顯示 ID + 介紹人 ID + 自動 reverse 查「我介紹進來的人」
- 介紹人 ID 若 match 到系統內 user,自動 link 到該 user 詳情
- 沒 match 顯示「此 ID 尚未在系統內、可能還沒辦會員」

`995eb31`:customers 列表加 filter / search / sort(同 orders pattern)

### Phase 7.5 / 7.6:客服訊息 inbox + Realtime + 未讀區分(2026-05-21~22)

從「inbound 訊息全紀錄」演化到「explicit consent 客服模式 + 即時通知 + 未讀區分」。

**1f07b67 — Inbox v1**:
- /admin/[tenant]/messages 新頁面,列近 200 則 inbound message
- 各訊息類型 badge(text / image / sticker / video / 等)
- 文字直接顯示;非文字提示「LINE@ Manager 直接看」

**b7db38c — Realtime nav badge**:
- WebSocket 直連 Supabase Realtime,不吃 Vercel quota
- lib/supabase-browser.ts:createBrowserClient(anon key)
- webhook 收 inbound message → REST API broadcast 到 `tenant:{id}:messages`
- nav-links 訂閱 channel,收到 broadcast 就 unread++
- 進 /admin/[t]/messages 自動歸 0

**a2de0a3 — Support mode**:
- users.last_support_at + messages.is_support boolean
- 預設只看 support 訊息(按客服後 30 分鐘窗口)
- toggle [客服問題] / [所有訊息]

**8a63d19 — Quick Reply explicit flow**:
- 不再用 keyword 觸發 support mode
- 按 Rich Menu「💬 專屬客服」→ bot 回 FAQ + Quick Reply chips「📝 我要詢問」/「取消」
- 按「我要詢問」(postback action=start_support)→ users.last_support_at = now()
- 按「取消」(action=cancel_support)→ last_support_at = null

**7ec338f — 不再 echo**:
- describeEvent text 訊息 keyword 沒命中 → 回 ''(silent)
- non-text → '' (silent)
- Bot 不再「你說:XXX」吵客戶

**c9d3199 — Group + 未讀區分**:
- messages.read_at timestamptz(null = 未讀)
- groupByUser:按用戶折疊一張卡 = 一個用戶
- <details>/<summary>(無 JS HTML 摺疊)
- 預設 unread open / read closed
- 卡片視覺:hasUnread = 黃底 + 紅左 border + 紅 badge「N 未讀」
- mark-read-client.tsx(client):進頁 2 秒後 server action 自動標已讀

**Bugfix**:
- `a83666f` getMessages try/catch 防 SSR crash
- `619b6d1` 拿掉 Server Component 內 <Link onClick>(Next.js 限制)

### Phase 7.7 ~ 7.9:Demo prep 大波(2026-05-22 晚,29 個 commit)

明天要 demo 給三合一,這波密集 polish + 補功能。

**簽到 QR 系統**(`4789d61` + `ac37a5a`):
- /admin/[tenant]/classes/[id]/qr 每活動專屬 QR 列印頁
  - qrserver.com API(免 npm)生 PNG
  - print-friendly @media print 隱 nav + 強制白底
  - 「下載 PNG」/「看出席紀錄」按鈕
- /m/checkin 加 profile gate(同 /m/member pattern)
  - 沒填會員資料 → inline mini-form(真名 / 電話 / ID / 介紹人 ID)
  - 填完一鍵簽到,不需切頁重掃 QR
  - 自動 upsert user(沒加 bot 好友也能用)

**Admin 商品管理 UX 大改造**(`93b28f5` + `88ebb3e`):
- 每個商品變 <details> 折疊 card
  - summary 顯示縮圖 + 名稱 + 狀態 + 變體數
  - 展開分 4 sections:商品圖 / 基本資料 / 變體 / 危險區(刪除)
- 「儲存」後 redirect ?saved=<id> + 自動展開該卡 + 綠 banner
- 商品沒 slug 也能點(homepage link + getProductBySlug fallback by UUID)
- createProduct auto-generate slug(英文 slugify + 6 字 hash / 中文 timestamp)

**LIFF /m/shop 全面 redesign**(`4def224` + `5c6b5b6` + `90a936f` + `5da6750` + `7523d6b`):
- Rich Menu Cell 3 改回 LIFF /m/shop(學員端 LINE 用 LIFF,公開頁 /oilswa 給 IG/分享)
- Profile gate(同 /m/checkin)
- Hero:tenant logo 56×56 + tenant name + 小 LINE pic + greeting
- Hero banner(1200×630 用 og_image_url)
- 商品 2-col grid + 4:5 卡片 + 名稱 line-clamp + monospace 價格
- 底部 sticky cart bar「🛒 N 件 NT$ X →」
- 結帳頁重設計:返回鍵 + 確認訂單 h2 + 56×70 縮圖商品明細 + 圓角 qty button
  + 收件資訊卡片 + 大「確認送出 · NT$ X」黑 button
- LIFF done 畫面也顯示完整匯款資訊 + 訂單編號 + 截圖提示

**Payment Info(匯款資訊)**(`de02bfc` + `7523d6b`):
- tenants.payment_info text 欄位(free text 多行,銀行/帳號/戶名 + 流程提示)
- admin settings textarea + 範例 placeholder
- 訂單成立頁(公開 / LIFF / push)都顯示
- 範例已含「📍 三合一辦公室現場付款」option

**LINE Bot push 訂單確認**(`b54dbca` + `2913ff9` + `5c5c717`):
- placeOrder 後 push 訊息給客戶:訂單編號 + 總金額 + 匯款資訊 + 訂單詳情 link
- Fire-and-forget → fix 成 await(Vercel serverless function return 後 kill 背景 task)
- 總金額用本地 cart × price 算(order.total_twd 在 INSERT 時是 0,trigger items 後才算)

**LIFF /m/orders 我的訂單**(`485f1d9`):
- 學員 LIFF 看自己歷史訂單(近 50 筆)
- 卡片:order_no(mono) + 商品 summary + 狀態 badge + 大金額
- 點 → /[tenant]/order/[order_no] 公開頁
- /m/member 加快速 link「🧾 查我的訂單 ›」

**LIFF /m/events 重設計**(`0cec1ec`):
- 對齊 /m/shop 設計語言
- Hero + 小頭像 greeting
- 活動卡片重設計:左日期區塊(月 small caps + 大日 + 週)+ 右主資訊
- 容量 progress bar(綠 / 紅滿 visual)
- 已報名 → 綠 left border + ghost button「✓ 已報名 點此取消」
- 候補中 → 黃 badge「候補 #N」

**Mobile RWD**(`5e78410` + `303ae2d` + `e241126` + `6353f8e`):
- Admin layout @media (max-width: 767px) 多 layer CSS:
  - Sidebar → fixed drawer + hamburger
  - 內頁 padding 12px 緊湊
  - **所有 grid → 1 col**(catch-all [style*="grid-template-columns"])
  - **表格 → 卡片化**(thead 隱 / tr 變 card / td 變 block)
  - Filter bar:position sticky 浮頂部 + flex column + 各欄 100%
  - h1/h2 縮小防溢出 + 圖片 max-width 100%
- 不破桌機 layout(全在 mobile breakpoint 內)

**PWA 支援**(`febb96a` + `c7ad837`):
- app/manifest.ts(MetadataRoute.Manifest 慣例)
  - name "Stall · 多攤位電商 + LINE Bot"
  - start_url "/",display "standalone"
- app/icon.svg 256×256 黑底白「S」(maskable + any)
- app/layout.tsx 加 appleWebApp metadata + viewport theme-color
- 用戶可「加到主畫面」當 native App,無需 App Store

**對帳 UI**(`ab87c16` + `e46fb31` + `8daf048`):
- 訂單詳情頁加 quick action section(三狀態切):
  - 未付款 → 黃底「💰 確認收款」+ 後 5 碼 + 付款方式 + 綠 button
  - 已付款未出貨 → 綠底「✓ 已收款」+ 「📦 標已出貨」追蹤單號 input
  - 已出貨 → 「📦 已出貨」+ 時間 + 追蹤單號
- markOrderPaid / markOrderShipped server actions
  - 自動 set paid_at / shipped_at(trigger 處理)
  - Retry 機制:if payment_last5 column 未建 retry without
- 訂單列表加 inline quick action(從 list 直接標 paid / shipped 不用進詳情)
  - return_to=list 參數 → 留在列表 + 上方綠 banner
- 訂單詳情頁 404 bug fix:payment_last5 SELECT 暫時拿掉直到 SQL 跑

**Dashboard 修正**(`760b7f3` + `aa2bbaf`):
- export const dynamic = 'force-dynamic' 避免任何 cache
- 「今日營收」改算 created_at 範圍所有訂單(不再要求 paid_at + payment_status=paid)
  - 反映「真實銷售」直覺,排除 cancelled / refunded
- Card sub label 改「下單 NT$」更精準

**待跑 SQL**:
```sql
alter table orders add column if not exists payment_last5 text;
```
(因 user 無法跑暫緩,程式碼已 retry 機制 graceful degrade)

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
