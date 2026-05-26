# NEOP STALL 平台規格(Spec)

> 內部工程文件。最後更新:2026-05-26(對齊 Phase 8.3 已 ship 狀態)。
> 完整商業 context / 願景 / 對外文案在 vault(私),此檔只列工程規格、schema、milestone。
>
> **進化:** 原本是「三合一 + 愛油哇」雙線 LINE Bot,5/19 後升級為多 tenant 平台「**NEOP STALL**」
> (母品牌 NEOP / 產品 STALL,正名於 Phase 8.1,2026-05-26)。
> 目前活躍 tenant:**oilswa**(enterprise,三合一愛油哇)/ **cyndi**(pro,Cyndi 童裝)/ **kim**(free,個人賣場)。

## 一、定位

從 day 1 設計成 **multi-tenant 平台**,單一 database 用 `tenant_id` 隔離。
原本只 serve 自己人(三合一 / 愛油哇 / 朋友),Phase 7.11 後開放 **Google OAuth + Email 自助註冊 → 申請開店 → Peter 審核** 路徑(對外仍邀請制,沒公開招商)。

| 線 | 名稱 | 服務對象 | 主要痛點 |
|---|---|---|---|
| **1(已 ship)** | 三合一行動能量體系(oilswa) | 學員 / 領袖 | 教室簽到 / 活動報名 / 學員管理 / 推播效率(15 群手動貼 1 小時起) |
| **2(已 ship)** | 愛油哇商行(同上) | 網購客戶 / 員工 | 訂單管理 / 客戶資料 / 庫存追蹤 / 出貨流程 |
| **3(Phase 5+)** | Cyndi 童裝代購 / Kim 個人賣場 | 顧客 | 商品上架 / 訂單對帳(同共用 stack) |

未來複製給下線領袖、外部客戶、自助申請者都不需重做架構。

---

## 二、功能 milestone(對齊 5/26 進度)

### 線 1:三合一 LINE@ 工具

| 月份 | 主要功能 | 狀態 |
|---|---|---|
| 月 1 | 學員資料庫 / 教室簽到 / 本月課程 / 出席紀錄後台 | ✅ ship |
| 月 2 | 學員冷卻警示 / 活動報名 / 候補表單 / 貼文助手 | ✅ 報名 + 候補 ship;貼文助手 deferred |
| 月 3 | LINE@ 開設 / Rich Menu / 多層 FAQ 客服 / 進階教室 / 最新消息 / 商品專區導流 | ✅ Rich Menu / 最新消息 / 客服 inbox 全 ship |

### 線 2:愛油哇商行管理系統

| 月份 | 主要功能 | 狀態 |
|---|---|---|
| 月 1 | 商品資料庫 / 客戶資料庫 / 訂單系統(基礎) | ✅ ship |
| 月 2 | 庫存追蹤 / 出貨流程 / 對帳系統 | ✅ 全 ship(對帳 Phase 7.7) |
| 月 3 | 客戶歷史檔案 / 跨系統整合 / 基礎報表 | ✅ 基本 ship;報表時序圖表 deferred |

### Phase 6 - 7 平台層加值(2026-05-19 ~ 05-26)

不在原 3 個月 plan 內,demo 過程衍生的需求:

| Phase | 功能 | 狀態 |
|---|---|---|
| 6.1 | 教室簽到(`attendances` 表 + QR-only 流程) | ✅ |
| 6.2 | 活動報名 + 候補(`reservations` 表) | ✅ |
| 6.3 | 最新消息(`news` 表替代分眾推播) | ✅ |
| 7.1 | `tenants.logo_url` + 圓形 logo 上傳 | ✅ |
| 7.3 | hero banner / `og_image_url` | ✅ |
| 7.4 | CRM 介紹網 — `member_id` / `referrer_member_id`(不做 PV 計算) | ✅ |
| 7.5 / 7.6 | 客服 inbox(`messages.is_support` + Supabase Realtime + `read_at`) | ✅ |
| 7.7 | 對帳 UI(`tenants.payment_info` + markOrderPaid / Shipped 流程) | ✅ |
| 7.8 | Dashboard / Filter / Mobile RWD 精修 + Root landing + PWA + 活動管理 UX 大改造 | ✅ |
| 7.9 | 活動圖片(`classes.image_url`)+ Rich Menu「📅 本月課程」改 Flex Carousel | ✅ |
| 7.10 | `news.link_url` + Flex 加 footer button | ✅ |
| 7.11 | 自助申請開店:Google OAuth + Email 註冊 + `/admin/apply` 表單 + super admin 審核 | ✅ |

### Phase 8 NEOP brand integration(2026-05-26)

| Phase | 功能 | 狀態 |
|---|---|---|
| 8 | NEOP logo + admin-theme 加 `neopGreen` token + `docs/BRAND.md` | ✅ |
| 8.1 | brand rename:`Stall` → `NEOP STALL`(母品牌 / 產品名分層) | ✅ |
| 8.2 | 全站字型統一 Space Grotesk + JetBrains Mono | ✅ |
| 8.3 | shared `<SubmitButton>`(React 19 `useFormStatus` + spinner)套到 apply / login / news / classes / orders / applications | ✅ |

### Outstanding(未動工 / 評估中)

- **分享卡引擎**(Strava-like IG Story / OG image)— vision 文件提的「核心」,0% 實作
- **3 套主題系統**(Apothecary / Editorial / Corner Store)— design tokens 在 `lib/admin-theme.ts`,但 multi-theme switch 0%
- **金流整合**(綠界 / TapPay / 7-11 / 電子發票)— Phase 1 全部不做,維持手動匯款 + 對帳
- **統一 NEOP STALL LINE OA**(目前每 tenant 自帶 LINE@)
- **IG Messaging API / Comments webhook**
- **報表時序圖表**(目前只有 metric 卡片,沒 line chart / heatmap)
- **Catalog 模式**(中央商品目錄 + 分享者拉商品)

---

## 三、Rich Menu(5 格設計)

| # | 格子 | Action | 點下去 |
|---|---|---|---|
| 1 | 📅 本月課程 | postback | DB 拉本月課程,分四區(台北/台中/高雄/台南),只列未來場次 |
| 2 | 📰 最新消息 | postback | placeholder,後續改 LIFF 時間軸 |
| 3 | 🛍 商品專區 | URI | 直接開 oilswa.com.tw(之後切自製 NEO-Shop) |
| 4 | 👤 會員中心 | URI | 開 LIFF 載 `/m/member`,form 填會員資料 |
| 5 | 💬 專屬客服 | postback | FAQ + 客服時間 + 進階教室 sub-mention |

Layout:上 3 等寬(833 / 833 / 834)+ 下 2 等寬(1250 / 1250),高 843,total 2500 × 1686。

---

## 四、Tech stack

- **前端**:Next.js 15(App Router)+ TypeScript + React 19
- **後端 / DB**:Supabase(Postgres)+ PostgREST + Supabase Auth
- **Auth**:Supabase Auth(admin)+ LIFF idToken(LIFF 用戶)
- **LINE SDK**:`@line/bot-sdk` (webhook reply)+ `@line/liff` (webview)
- **部署**:Vercel(auto deploy on push to main)

---

## 五、Schema(對齊 5/26)

完整 DDL 看 `db/schema.sql`。核心 table 概覽:

```
tenants(平台層 tenant)
  ├─ id, slug, name, owner_user_id
  ├─ plan(free / plus / pro / enterprise)
  ├─ features(jsonb)
  ├─ status(active / hibernated / suspended / deleted / pending / rejected)
  ├─ order_prefix(2-5 大寫,如 OW / CY / KM)
  ├─ logo_url, og_image_url, brand_color, description, contact_info, payment_info
  ├─ theme_id, theme_overrides
  ├─ applicant_phone / business_type / application_notes / rejection_reason / reviewed_by / reviewed_at
  │    (Phase 7.11 自助申請)
  └─ line_channel_id / line_bot_user_id / line_channel_secret / line_channel_access_token / rich_menu_id

platform_users(全平台層用戶,可能是 LINE 顧客 / Supabase Auth admin)
  ├─ id, line_user_id(unique), phone, email, display_name, picture_url
  ├─ status(active / merged / deleted)
  └─ merged_into_user_id(用戶合併)

tenant_members(誰能管哪個 tenant)
  ├─ tenant_id, user_id, role(owner / admin / staff)
  └─ unique(tenant_id, user_id)

regions(每 tenant 的地點)
  └─ id, tenant_id, name, address, google_maps_url

classes(課程 / 活動)
  ├─ id, tenant_id, region_id
  ├─ name, instructor, scheduled_at, duration_min
  ├─ is_paid, price_twd, capacity, status
  ├─ description, image_url(Phase 7.9)
  └─ signup_url

reservations(活動報名 + 候補,Phase 6.2)
  └─ tenant_id, class_id, user_id, status(confirmed / waitlist / cancelled), position

attendances(教室簽到,Phase 6.1)
  └─ tenant_id, class_id, user_id, attended_at

news(最新消息,Phase 6.3)
  ├─ tenant_id, title, body
  ├─ status(draft / published / archived), published_at
  └─ link_url(Phase 7.10)

products
  ├─ id, tenant_id, slug(unique per tenant), sku
  ├─ name, description, price_twd, cost_twd, stock, image_url, category, status

product_variants(Phase 5.2)
  ├─ tenant_id, product_id, sku(unique per tenant), variant_name
  ├─ price_twd, cost_twd, stock, image_url, scan_id, status
  └─ SKU 由系統產:{order_prefix}-{流水號};追加 variant 加 -V2 -V3

orders + order_items + stock_movements
  └─ 對齊原 SPEC,變體 ref variant_id(Stage B 完成)

messages(LINE inbound / outbound + 客服 mode,Phase 7.5/7.6)
  ├─ id, tenant_id, user_id, direction, event_type, message_type
  ├─ content(jsonb), raw_event(jsonb)
  └─ is_support(boolean), read_at(timestamptz)
```

附註:`platform_users.email` ↔ `tenant_members` ↔ `tenants` 三層鏈是 admin 權限的 source of truth。
super admin 由 env `SUPER_ADMIN_EMAILS` 判,不靠 DB role。

---

## 六、路由結構(對齊 5/26)

```
公開 / 平台層
  /                              NEOP STALL landing(brand + 攤位列表)
  /[slug]                        tenant 公開店面(只 status='active')
  /[slug]/checkout               guest checkout
  /[slug]/order/[order_no]       訂單明細(順手匯款資訊)
  /[slug]/order-lookup           訂單查詢

API / Auth
  /api/webhook                   LINE webhook(POST event / GET 平台 verify)
  /auth/callback                 OAuth callback(Google + Email 確認信)

Admin(Supabase Auth gated)
  /admin                         看 user 第一個 tenant,沒 tenant → /admin/apply
  /admin/login                   登入 + 註冊(tab)+ Google OAuth
  /admin/apply                   自助申請開店(Phase 7.11)
  /admin/applications            super admin 審核(env SUPER_ADMIN_EMAILS)
  /admin/[tenant]                Dashboard(metrics + 今日活動 + 未來報名)
  /admin/[tenant]/classes        課程 / 活動 CRUD + 簽到 QR
  /admin/[tenant]/classes/[id]/qr  簽到 QR 列印頁
  /admin/[tenant]/attendances    出席記錄
  /admin/[tenant]/news           最新消息 CRUD
  /admin/[tenant]/products       商品 CRUD + nested variants
  /admin/[tenant]/orders         訂單列表 + 快速標已付 / 已出貨
  /admin/[tenant]/orders/[id]    訂單詳情 + 對帳
  /admin/[tenant]/customers      客戶名單 + 訂單統計
  /admin/[tenant]/customers/[id] 客戶歷史檔案
  /admin/[tenant]/inventory      庫存追蹤 + 異動歷史(Free plan gate)
  /admin/[tenant]/messages       客服 inbox(support mode)
  /admin/[tenant]/settings       攤位設定(logo / banner / payment_info / brand)

LIFF(各功能獨立 channel)
  /m/member                      會員專區(member_id / referrer)
  /m/shop                        商品瀏覽 + 購物車 + 下單
  /m/events                      活動報名 + 候補(Phase 6.2)
  /m/checkin                     QR 簽到(Phase 6.1)
  /m/orders                      我的訂單
```

對齊 `docs/STALL_ARCHITECTURE.md` v1.1 第四章雙入口架構。

---

## 七、紅線(必避)

- **doTERRA 政策**:第 5.C / 5.D / 5.E / 10.A / 10.B.7 條 — 不做 PV 追蹤 / 計算機 / LRP 養成 / 精油消化為輔銷品
- **資料保護**:用戶 PII(姓名 / 電話 / 地址 / 生日)只內部用,不分享第三方
- **權限隔離**:admin 路由 middleware 保護;LIFF 用戶經 idToken 驗證,只能讀寫自己 row

---

## 八、開發狀態(2026-05-26)

### 已 ship

- ✅ **v1 平台部署**(2026-05-18):Next.js 15 + Vercel + Supabase + LINE webhook + Rich Menu
- ✅ **Phase 1-4**:本月課程 / admin classes CRUD / LIFF 會員 / 線 2 商品-訂單-庫存 流程
- ✅ **Stall Phase A**(5-19):平台層 schema migration + Cyndi tenant
- ✅ **Phase 4-Alpha**:admin 全 tenant-aware(`/admin/[tenant]/*`)
- ✅ **Variant Stage A + B**:`product_variants` 表 + admin nested CRUD + backfill
- ✅ **Phase 6.1**(5-21):教室簽到(`attendances` + QR-only)
- ✅ **Phase 6.2**(5-21):活動報名 + 候補(`reservations`)
- ✅ **Phase 6.3**(5-21):最新消息(`news`)
- ✅ **Phase 7.1**(5-21):tenant logo 圓形上傳
- ✅ **Phase 7.3**(5-22):hero banner / og_image
- ✅ **Phase 7.4**(5-21):CRM 介紹網(member_id / referrer_member_id)
- ✅ **Phase 7.5/7.6**(5-21):客服 inbox + Supabase Realtime + read_at
- ✅ **Phase 7.7**(5-22):對帳 UI(`payment_info` + markOrderPaid / Shipped)
- ✅ **Phase 7.8**(5-22~23):Dashboard / Filter / Mobile RWD 精修 + Root landing + PWA + 活動管理 UX 大改造
- ✅ **Phase 7.9**(5-25):活動圖片 + Rich Menu Flex Carousel
- ✅ **Phase 7.10**(5-25):news.link_url + Flex 加 footer button
- ✅ **Phase 7.11**(5-26):自助申請開店(Google OAuth + Email 註冊 + apply 表單 + super admin 審核)
- ✅ **Phase 8 / 8.1 / 8.2 / 8.3**(5-26):NEOP brand + rename + 字型統一 + SubmitButton loading state
- ✅ **SKU 自動產**(5-26):`{order_prefix}-{流水號}` + variant `-V{n}`

### 進行中 / 評估

- ⏳ **Variant Stage C**:LIFF / inventory / orders detail 全切 variant_id;trigger 切 variant.stock
- ⏳ **Phase 4-Gamma**:LINE Login 給公開店面 guest checkout
- ⏳ **報表時序圖表**:dashboard 加 line chart / heatmap
- ⏳ **products page SubmitButton**(Phase 8.3 commit C)

### 未動工(vision 文件提的「核心」,但 0% 實作)

- 🔴 **Strava 般分享卡引擎**(IG Story / OG image,Satori 或 Puppeteer)
- 🔴 **3 套主題系統**(Apothecary / Editorial / Corner Store)— design tokens 在 admin-theme 但 multi-theme switch 0%
- 🔴 **金流整合**(綠界 / TapPay / 7-11 / 電子發票)— Phase 1 全部不做
- 🔴 **統一 NEOP STALL LINE OA**(目前每 tenant 自帶)
- 🔴 **IG Messaging API / Comments webhook**
- 🔴 **Catalog 模式**(中央商品目錄 + 分享者拉商品)

詳細 commit 紀錄見 `progress.md`。Stall 架構 source of truth 為 `STALL_ARCHITECTURE.md`(SPEC 與其衝突時以 STALL 為準)。Brand 規範見 `BRAND.md`。
