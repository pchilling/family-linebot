# Progress & Flows

> 開發進度 + 各 flow step by step + 部署紀錄。最後更新:2026-05-19

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

### Outstanding

- ⏳ Phase 4:報名活動 / 出席記錄 / 商品 / 訂單
- ⏳ Phase 5:最新消息 LIFF 時間軸 + 進階教室實作
- ⏳ Phase 6:小編 / 會計 / 出貨 admin pages(線 2)
- ⏳ Phase 7:multi-tenant 真實複製給下線領袖

### ⚠️ 兩條線進度差(2026-05-19 狀態)

提案 v5 第 60 行寫「兩條線同時推進」,但實際 v1 + Phase 1-3 完成度:

| 線 | 進度 |
|---|---|
| 線 1(三合一 LINE@) | 月 1 約 **60%**(學員資料庫 LIFF + 本月課程,缺出席紀錄) |
| 線 2(愛油哇後台) | **0%**(商品 / 訂單 / 客戶 / 出貨 全未動) |

線 2(爸媽最有感的後台)還沒啟動。**Peter 需要回頭跟家人 sync 預期**:
- 「線 1 先做完月 1,線 2 從下個月開始」 — 或
- 「下週交錯啟動線 2,週末規劃 schema + 工程清單」

不要等三個月到了才發現線 2 沒做完。

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
```
