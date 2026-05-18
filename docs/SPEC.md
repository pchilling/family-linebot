# 三合一 + 愛油哇 LINE Bot 規格(Spec)

> 內部規劃文件:三合一教室 + 愛油哇商行 兩條線同時推進,3 個月 phase 1。
> 完整商業 context 在 vault(私),此檔只列工程規格與 milestone。

## 一、定位

兩條線並行,**共用同一個 multi-tenant Database**(主權:NEO Potential Studio)。

| | 第一條線 | 第二條線 |
|---|---|---|
| 名稱 | 三合一行動能量體系 | 愛油哇商行 |
| 服務對象 | 學員 / 領袖 | 網購客戶 / 員工 |
| 主要痛點 | 教室簽到 / 活動報名 / 學員管理 / 推播效率(15 群手動貼 1 小時起) | 訂單管理 / 客戶資料 / 庫存追蹤 / 出貨流程 |

Multi-tenant 從 day 1 起 — 用 `tenant_id` 隔離,未來複製給下線領袖或外部客戶不需重做架構。

---

## 二、3 個月功能 milestone

### 線 1:三合一 LINE@ 工具

| 月份 | 主要功能 |
|---|---|
| **月 1** | 學員資料庫 / 教室簽到 / 本月課程 / 出席紀錄後台 |
| 月 2 | 學員冷卻警示 / 活動報名 / 候補表單 / 貼文助手 |
| 月 3 | LINE@ 開設 / Rich Menu / 多層 FAQ 客服 / 進階教室 / 最新消息 / 商品專區導流 |

### 線 2:愛油哇商行管理系統

| 月份 | 主要功能 |
|---|---|
| **月 1** | 商品資料庫 / 客戶資料庫 / 訂單系統(基礎) |
| 月 2 | 庫存追蹤 / 出貨流程 / 對帳系統 |
| 月 3 | 客戶歷史檔案 / 跨系統整合 / 基礎報表 |

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

## 五、Schema(v1)

```
tenants
  ├─ id, name
  ├─ line_channel_id / line_bot_user_id
  ├─ line_channel_secret / line_channel_access_token
  └─ rich_menu_id

regions
  ├─ id, tenant_id, name(台北 / 台中 / 高雄 / 台南)
  └─ address, google_maps_url

classes
  ├─ id, tenant_id, region_id (FK)
  ├─ name, instructor, scheduled_at, duration_min
  └─ is_paid, price_twd, capacity, status

users
  ├─ id, tenant_id, line_user_id
  ├─ display_name, picture_url(LINE 帶)
  ├─ full_name, phone, address, birthday(用戶 LIFF 自填)
  └─ status

messages
  └─ id, tenant_id, user_id, direction, event_type, message_type, content, raw_event
```

---

## 六、路由結構

```
/                       首頁(placeholder)
/api/webhook            LINE webhook(POST event / GET 平台 verify)
/admin/login            管理員登入(Supabase Auth)
/admin/classes          課程 CRUD(列表 + 新增 + inline 編輯 / 刪除)
/m/member               LIFF 會員專區(用戶填 / 改自己會員資料)
```

---

## 七、紅線(必避)

- **doTERRA 政策**:第 5.C / 5.D / 5.E / 10.A / 10.B.7 條 — 不做 PV 追蹤 / 計算機 / LRP 養成 / 精油消化為輔銷品
- **資料保護**:用戶 PII(姓名 / 電話 / 地址 / 生日)只內部用,不分享第三方
- **權限隔離**:admin 路由 middleware 保護;LIFF 用戶經 idToken 驗證,只能讀寫自己 row

---

## 八、開發狀態

- ✅ **v1 平台部署**(2026-05-19):Next.js + Vercel + Supabase + LINE webhook + Rich Menu
- ✅ **Phase 1**:本月課程從 DB 拉(filter future + Asia/Taipei tz)
- ✅ **Phase 2**:`/admin/classes` CRUD(login + middleware + server actions)
- ✅ **Phase 3**:`/m/member` LIFF 會員專區(填 / 改個資)
- ⏳ **Phase 4 (next)**:課程報名 / 出席記錄 / 商品 / 訂單(月 1-3 milestone 後續)
