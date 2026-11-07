# Progress & Flows

> 開發日記 + flows + 部署紀錄。最後更新:2026-06-04(progress.md 重構,改按月份 + 用戶層指標)

---

## 一、線 1 / 線 2 進度(用戶層,每次更新)

> ⚠️ **這是家族要的指標**。每次 push 完都該回來看一次。
> 平台層 phase ship 不等於線 1 / 線 2 完成 — 這兩個是不同數字。

| 線 | 月 1 目標 | 目前狀態 | 上次更新 |
|---|---|---|---|
| 線 1(oilswa LINE@ 互動) | 學員資料庫 / 本月課程 / 教室簽到 / 活動報名 / 客服 inbox / 最新消息 | **待填**(由 Peter 寫) | 待填 |
| 線 2(oilswa 後台 + 公開店) | 商品 CRUD / 訂單 / 客戶 / 庫存 / 公開店面 / variant / 報表 / domain | **待填**(由 Peter 寫) | 待填 |

> ⚠️ 上次有效更新是 5/19(線 1 = 60% / 線 2 = 80%),那之後 ship 了 9+ 個 phase 沒回來更新數字 — 這欄已知道不準。下次自己 sit down 評估後填上。

---

## 二、近期工作(按月份 + W)

舊 Phase 數字下面只作「歷史代號」括號附註,不再產新編號。

### 2026-06 W1:差異化 + Variant 收尾 + Domain 遷移

主題:把 NEOP STALL 從「能跑」推到「有差異化 + 對外開放」

- **商品差異化大波**
  - 分階定價 tier pricing(原 9.5,`0a20a6a`)
  - 商品多媒體 + 影片 carousel(原 9.6 / 9.7,`22028e5` 起一連串)
  - 限時優惠 v1 sale_price → v2 改 `sale_discount_pct` % off(原 9.9,`c4a9959` / `6e4fd2b`)
  - Banner 多媒體 + 公開頁 hero carousel(原 9.8,`a849688`)
- **Dashboard 4 段 SVG 報表**(原 10,`2dd9f5f` / `0a40c56`):30 日營收 line / Top 5 商品 bar / 訂單漏斗 / 30 日活動 daily bar;順手拿掉「快速操作」、metric card 緊湊
- **Variant Stage C 完整收尾**(原 11,`e6d8700`):LIFF / 訂單 / stock_movements trigger 一路打通
- **Variant + 客戶端細節**(原 11.1):variant-selector imageUrl fallback / cart 縮圖 80×80 → 60×80(3:4)/ 客戶商品購買區 chip filter「全部 / 最新 / 各 category」
- **Domain 遷移 stall.neop.tw**(原 12):
  - 買 `neop.tw`(GoDaddy)+ 母網域子網域策略
  - DNS 搬 Cloudflare Free
  - Vercel custom domain(CNAME → `5428fc6109a1706b.vercel-dns-017.com`,Proxy disabled)
  - 環境變數 `NEXT_PUBLIC_PROD_URL` 新增、3 處硬編碼 `vercel.app` URL 全改
  - 5 個外部 dashboard 更新:LINE Webhook / LIFF apps × 3 / Supabase Auth / Google OAuth
  - 舊 `family-linebot-delta.vercel.app` 設 308 redirect
- **OG metadata 文案改**:`NEOP STALL 管理後台 / 登入管理你的攤位`(原 LINE Bot 商務平台描述太冗)
- **LIFF /m/shop UX 大改**:
  - 加 `layout.tsx` 設 title=「商品專區」
  - banner 從單張改 `MediaItem[]` + 引用 `<BannerHero>` 共用元件
  - 商品 detail v1 = modal → v2 = SPA 內 full-page view(modal 在小螢幕擠)
  - 卡片精簡:只剩圖 + 名 + 最低 variant 價;拿掉下拉、加購按鈕、庫存數字
- **資料清理**:14 筆 oilswa 測試訂單 + order_items + stock_movements 清光,variant.stock 還原原始值

### 2026-05 W5(5/26):Brand + Self-serve apply + 分享卡

主題:從「家族 bot」轉成 NEOP STALL 平台品牌

- **自助申請開店 flow**(原 7.11):/admin/apply + email/password 註冊 + Google OAuth + applications 審核
- **NEOP Logo / 字型統一**(原 8 / 8.1 / 8.2):logo 整合到 layout、Rich Menu、share card;Inter / Space Grotesk 全站統一
- **SubmitButton 共用 infra**(原 8.3):useFormStatus 把 pending 一次包好
- **分享卡 v0**(原 9):`/share/p/[id]` OG image — 商品縮圖 / 賣家 / 價格;next/og + Satori

### 2026-05 W4(5/22-25):Demo Prep + Bot 收尾 + admin UX

主題:給家族 demo + LINE Bot 收尾 + admin UX 整批升級(單日 29 個 commit 那波)

- **線 1 LINE Bot 收尾**:教室簽到 QR(原 6.1)+ 活動報名 / 候補(原 6.2)+ 最新消息(原 6.3)+ Rich Menu Flex Carousel(原 7.9 Phase C)
- **客服 inbox**(原 7.5 / 7.6):messages 表 + admin Realtime + 未讀 badge
- **CRM 介紹網**(原 7.4)
- **活動圖片 + 活動管理 UX 大改造**(原 7.8c / 7.9 Phase A)
- **Dashboard / Filter / Mobile RWD 精修**(原 7.8a/b)
- **Demo prep 整批 commit**(原 7.7-7.9):各種小修 + UX 對齊

### 2026-05 W3(5/18-21):平台奠基 + 公開店 v0

主題:LINE Bot → 多 tenant 電商平台

- **LINE Bot 骨架 + DB schema**(原 0/1/2/3):webhook / Supabase / classes / regions / LIFF 會員專區
- **Stall Phase A 平台層 schema 拆分**(原 Stall Phase A):`platform_users` 跨 tenant + `tenant_members` + tenants 加 slug/plan/features;oilswa 第一個 tenant(`8106161d-...`)
- **/admin/[tenant] tenant-aware**(原 4-Alpha):products / classes / orders / customers / inventory 全 migrate;舊 routes redirect
- **Variant Stage A / B**(原 5.2.A/B):`product_variants` 表 + admin UI nested CRUD(Cyndi 童裝色 × 尺寸 × SKU)
- **商業模式策略調整 + 分級調整 v2**:從 4 階 → 2 階 → Free / Pro / Enterprise 3 階;tenants 對應 oilswa = Enterprise / Cyndi = Pro / Kim = Free
- **Phase 4-Gamma 公開網站**:`/[slug]` 攤位首頁 + 商品詳情 + 購物車 + checkout + 訂單頁;guest checkout(LINE Login 延後)+ schema.org JSON-LD
- **5/21 整波收尾**:admin source-aware / inventory variant 改造 / Free gating(inventory 鎖頭 + Made with Stall 浮水印)/ Kim tenant 建立
- **Admin nav 重設計 + Tenant settings 頁**:2 列 nav + 切 tenant + 預覽公開頁 + brand_color / contact_info CRUD
- **Order lookup guest 查單頁**:order_no + Email/電話 比對 + enumeration 防護

---

## 三、Outstanding

> 規律:每 ship 1 個 phase,Outstanding 多 2 個。所以每次重看必須**砍**東西,不只是加。

### 排 1-2 個月內做

| # | 項目 | 大小 | 為何排 |
|---|---|---|---|
| 1 | **Members 邀請 UI**(+ signUp 自動建 platform_users) | 小(3 檔) | 共用帳號是權宜;正式員工進來必要;順手修 signUp bug |
| 2 | **法規 / 隱私 / 退款 / 寄送條款頁**(/policy 系列) | 文字工 | 對外開放收第一筆真錢前的法律必要條件 |
| 3 | **Cloudflare Email Routing**(`peter@neop.tw`) | 15 分 | 免費,Domain 已就位,順手 |
| 4 | **3 套美感主題**(Apothecary / Editorial / Corner Store) | 大(數天) | Cyndi / Kim 上線後差異化;延後沒急 |
| 5 | **金流接入**(走 ECPay 聚合 = LINE Pay + 信用卡 + ATM 一次到位) | 中 + 等審 4-6 週 | 月營收要前先排 |

### 候選 / 沒排程

- inventory page 改列 variants 不是 products(Variant Stage C 收尾)
- Stage C 後 deprecate `products.sku / price_twd / cost_twd / stock`(目前雙寫)
- LIFF Phase 3「我的訂單 / 課程歷史」未實作(等 entity)
- 12 假課之後 admin 替換真實課程

### 已砍(連同理由)

- **tenant subdomain(`oilswa.neop.tw` middleware routing)** — 路徑式 `stall.neop.tw/oilswa` 已能用,中老年 user 看不出差;tenant subdomain 等付費客戶要求時再做(2026-06-04 決)
- **LINE Login 訪客結帳** — LIFF 已能直接付 + 公開店 guest checkout 已有;再加 LINE Login 邊際效益低,沒人要求(2026-06-04 決)
- **進階教室 keyword webhook handler** — 沒人問過;現在綁「專屬客服」keyword 就夠

---

## 四、Tech debt

### 必修(對外開放真錢前)

- ⚠️ **Service role key 曾出現在本機 chat log**,**正式上線前必 rotate**(Supabase Settings → API → Generate new)
- ⚠️ **signUp 沒自動建 platform_users**(Phase 11 確認 bug):email / Google 註冊只創 Supabase Auth user。`getUserAllowedTenants` 撈不到 → 「沒有 tenant 權限」。修法:Members 邀請 UI 內 upsert,或 /admin/page.tsx 加 lazy create
- ✅ **後台 action 驗攤位身分**(2026-11-05 已補,commit 5e54da0):`lib/super-admin.ts` 的 assertTenantAccess / requireAdminTenant / assertRowAccess,所有後台 server action 先驗登入帳號是該攤位成員或超級管理員。角色層級(staff 能做什麼)還沒分。

### 可緩

- Peter `platform_users.id` 跟 `users.id` 沒對齊(Phase A placeholder 順序);用 line_user_id 是真實 join 欄,非急
- `product_variants.stock` 跟 `products.stock` 暫雙寫(Stage C 完整 deprecate 後可清)
- Phase 2 啟用 auth methods 時需 backfill 既有 platform_users 的 LINE auth method 到 `platform_user_auth_methods`
- 舊 `stock_movements` DELETE trigger 在 variant_id 缺失時 fallback 寫 product(Phase 12 清測試訂單時 variant.stock 被反向加,已手動還原)
- Tenant switcher 列**所有** active tenant(沒 tenant_members 過濾);多人登入時要加 RBAC
- Order lookup 電話比對完全相等(沒 normalize 格式,`0900-000-000` ≠ `0900000000`)
- Telegram polling 之前斷過,要設 Windows Task Scheduler At Logon 自動啟動

### 已砍

- 「進階教室」keyword webhook handler:沒人問過

---

## 五、外部設定紀錄(reproduce 用)

### LINE Messaging API channel(bot)
- Channel ID: `2010124883`
- Bot User ID: `U5ca95126d61901475067d3e90bec0dd3`
- Bot basic ID: `@076bahie`
- Display name: 三合一愛油哇

### LINE Login channel(LIFF)
- Channel ID: `2010125926`
- LIFF apps(3 個,2026-06-04 全部換 stall.neop.tw):
  - `NEXT_PUBLIC_LIFF_ID` = `2010125926-mRl3l3lO` → `https://stall.neop.tw/m/member`(會員 / 活動)
  - `NEXT_PUBLIC_LIFF_ID_SHOP` = `2010125926-aPB1bQtE` → `https://stall.neop.tw/m/shop`
  - `NEXT_PUBLIC_LIFF_ID_CHECKIN` = `2010125926-M0ozLk50` → `https://stall.neop.tw/m/checkin`
- LIFF size: Full
- Scope: `profile` + `openid`
- Bot link feature: On (Aggressive),綁定上面 Messaging API channel

### Supabase
- Project URL: `https://tkodwzgrbhhdalcjepad.supabase.co`
- Region: Mumbai (ap-south-1)（2026-09-27 查證：db 主機位址在 AWS ap-south-1 區段；Vercel 函式也要放 bom1，不要改回 hnd1）
- Tenants:
  - oilswa: `8106161d-ad82-4bad-ba61-da1aac65bb2c`(Enterprise,三合一愛油哇)
  - cyndi: `8c032fc3-880a-4e96-9dc4-73684511f192`(Pro,童裝代購)
  - kim: 已建(Free,二手 placeholder)

### Vercel
- Project: `family-linebot`
- Production URL: `https://stall.neop.tw`(2026-06-04 換)
- 舊 URL `https://family-linebot-delta.vercel.app` 設 308 → `stall.neop.tw`
- Env vars(Production + Preview + Development):
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_CHANNEL_ID`
  - `LINE_BOT_USER_ID`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DEFAULT_TENANT_ID`
  - `NEXT_PUBLIC_LIFF_ID` / `NEXT_PUBLIC_LIFF_ID_SHOP` / `NEXT_PUBLIC_LIFF_ID_CHECKIN`
  - `LIFF_CHANNEL_ID`
  - `NEXT_PUBLIC_PROD_URL=https://stall.neop.tw`(2026-06-04 新增)

### Domain / DNS
- Registrar:**GoDaddy**(`neop.tw`,~NT$799/年。隱私不可選,TWNIC 公開政策)
- DNS / CDN:**Cloudflare**(Free plan)
  - `stall.neop.tw` CNAME → `5428fc6109a1706b.vercel-dns-017.com`(Proxy disabled,Vercel SSL)
  - 之後可加 Email Routing 給 `peter@neop.tw`(尚未設)

### GitHub repo
- `pchilling/family-linebot`(private)

---

## 六、User flows

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
Rich Menu 第 3 格 → URI action liff.line.me/2010125926-aPB1bQtE
       ↓
LINE app 內 webview 載 /m/shop(stall.neop.tw)
       ↓
profile gate(沒填 full_name / phone 不能逛)
       ↓
商品列表(chip filter + banner carousel)
       ↓
點商品 → SPA 內切 full-page detail
       ↓
選 variant + 數量 → 加入購物車
       ↓
checkout view(server placeOrder 拉 variant 真實價格 + 庫存)
       ↓
LINE push 訂單成立通知 + 匯款資訊
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
admin 開 stall.neop.tw/admin/login
       ↓
輸入 Supabase Auth email + password(或 Google OAuth)
       ↓
signIn server action
  └─ supabase.auth.signInWithPassword → 寫 cookie
       ↓
middleware refresh session → 已登入
       ↓
/admin → getUserAllowedTenants(email) → redirect /admin/<slug>
       ↓
nav 點「活動」→ /admin/[tenant]/classes
       ↓
inline 編輯每筆 → updateClass server action
  └─ supabaseAdmin .from('classes').update(...).eq('id', ...)
       ↓
revalidatePath → 列表重新拉
       ↓
用戶下次點本月課程 → 看到最新資料
```

---

## 七、部署流程

```
local edit → git add + commit → git push origin main
                                       ↓
                          GitHub 觸發 Vercel webhook
                                       ↓
                  Vercel pull repo → npm install → next build
                                       ↓
                        Deploy 完成(~1 分鐘)
                                       ↓
                       stall.neop.tw 自動更新
```

**注意**:
- `.env` 在 `.gitignore`,**不 push 上去**
- Vercel env vars 在 Dashboard → Settings → Environment Variables 手動設(分 Production / Preview / Development)
- 改 env vars 後要 trigger redeploy 才生效(或 push 新 commit)
- LINE webhook URL 改 Vercel domain 後,測 webhook verify 是 LINE Dev Console 內的「Verify」按鈕

---

## 八、Schema 變更 SQL 累積(reproduce 用)

完整 schema 看 `db/schema.sql`(append-only 累積)。這裡只記里程碑:

```sql
-- Phase 0 base
create table tenants (...);
create table users (...);
create table messages (...);

-- Phase 1
create table regions (...);
create table classes (...);  -- with region_id FK

-- Phase 3 — LIFF 會員
alter table users add column if not exists full_name text;
alter table users add column if not exists phone text;
alter table users add column if not exists address text;
alter table users add column if not exists birthday date;

-- Stall Phase A — 平台層拆分
create table platform_users (...);
create table tenant_members (...);
alter table tenants add column if not exists slug text;
alter table tenants add column if not exists owner_user_id uuid references platform_users(id);

-- Variant Stage A — 5.2.A
create table product_variants (...);
alter table order_items add column if not exists variant_id uuid references product_variants(id) on delete restrict;
alter table stock_movements add column if not exists variant_id uuid references product_variants(id) on delete restrict;

-- 5/21 整波 — order_prefix per tenant
alter table tenants add column if not exists order_prefix text;
-- generate_order_no trigger 改動態查 prefix

-- Phase 5.4 — contact_info
alter table tenants add column if not exists contact_info text;

-- Phase 7 — Logo / Banner / OG
alter table tenants add column if not exists og_image_url text;

-- Phase 9.5 — tier pricing
create table product_price_tiers (...);

-- Phase 9.6 — media jsonb
alter table products add column if not exists media jsonb default '[]'::jsonb;

-- Phase 9.8 — banner 多媒體
alter table tenants add column if not exists banners jsonb default '[]'::jsonb;

-- Phase 9.9 — 限時優惠
alter table products add column if not exists sale_discount_pct int;
alter table products add column if not exists sale_start_at timestamptz;
alter table products add column if not exists sale_end_at timestamptz;

-- Phase 11 — stock_movements trigger 帶 variant_id
-- (rewrite trigger function,看 schema.sql)

NOTIFY pgrst, 'reload schema';
```

-- Phase 28(2026-11-01)— 匯款資訊改分欄(銀行代號 / 名稱 / 帳號 / 戶名 / 說明),payment_info 留作備用
alter table tenants add column if not exists bank_transfer jsonb;

-- Phase 27 補充(2026-11-01)— RE:K 其實是原本的 kim(KM)攤位,誤建的 rek 刪掉
delete from tenant_members where tenant_id = (select id from tenants where slug = 'rek');
delete from tenants where slug = 'rek'
  and id not in (select tenant_id from products where tenant_id is not null)
  and id not in (select tenant_id from orders where tenant_id is not null);

-- Phase 29(2026-11-01)— 超商店到店第一階段:訂單加門市與寄件單號欄位
alter table orders add column if not exists cvs_type text;
alter table orders add column if not exists cvs_store_id text;
alter table orders add column if not exists cvs_store_name text;
alter table orders add column if not exists tracking_no text;
alter table orders add column if not exists logistics_status text;

-- Phase 30(2026-11-01)— 店家評價:整家店的星等,同一張評價頁順手打,一筆訂單評一次
create table if not exists tenant_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  display_name text,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists tenant_reviews_tenant_idx on tenant_reviews(tenant_id, status, created_at desc);
alter table tenant_reviews enable row level security;
create trigger tenant_reviews_updated_at before update on tenant_reviews
  for each row execute function set_updated_at();
NOTIFY pgrst, 'reload schema';

-- Phase 31(2026-11-05)— 訂單單號改計數器(order_counters),刪單不回收號碼
create table if not exists order_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  ym text not null,
  last_seq int not null default 0,
  primary key (tenant_id, ym)
);
alter table order_counters enable row level security;
insert into order_counters (tenant_id, ym, last_seq)
select tenant_id, substring(order_no from '-(\d{6})-'), max(substring(order_no from '-\d{6}-(\d+)$')::int)
from orders where order_no ~ '-\d{6}-\d+$' group by 1, 2
on conflict (tenant_id, ym) do update set last_seq = greatest(order_counters.last_seq, excluded.last_seq);
create or replace function generate_order_no()
returns trigger as $$
declare
  ym text; prefix text; cnt int;
begin
  if new.order_no is null or new.order_no = '' then
    ym := to_char(now() at time zone 'Asia/Taipei', 'YYYYMM');
    select order_prefix into prefix from tenants where id = new.tenant_id;
    if prefix is null then raise exception 'tenant % missing order_prefix', new.tenant_id; end if;
    insert into order_counters (tenant_id, ym, last_seq) values (new.tenant_id, ym, 1)
      on conflict (tenant_id, ym) do update set last_seq = order_counters.last_seq + 1
      returning last_seq into cnt;
    new.order_no := prefix || '-' || ym || '-' || lpad(cnt::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;
NOTIFY pgrst, 'reload schema';

-- Phase 32(2026-11-05)— 商店聲明(品牌關係聲明),頁尾 / 服務條款 / LINE 商店顯示
alter table tenants add column if not exists disclaimer text;

-- Phase 33(2026-11-06)— 折扣碼(discount_codes + orders.discount_code / discount_twd)
-- 設計決定:used_count 由 orders 上的 trigger 維護(insert +1 並檢查上限、取消 / 退款 −1、復原 +1、delete −1),app 端不寫計數器;
--   只折商品小計、不折運費;免運門檻與滿額贈都看「折扣前」的商品小計;應付總額全站只用 lib/supabase.ts 的 orderPayable。
--   CSV 匯出多兩欄「折扣碼」「折扣」,放在「運費」之後、「合計」之前(欄位順序變了,會計的試算表要知會)。
--   後台總覽「營收」與客戶「消費金額」改成扣掉折扣的淨額(仍不含運費)。
-- 待辦:編輯既有碼(碼名不能改,要改條件就停用再開新碼)、延長到期 / 加次數、依碼篩訂單、批次產碼、LIFF 輸入折扣碼、
--   多特瑞促銷限制提醒(features.discount_max_pct)待 Peter 決定。
-- 審查後補(同日):「每人一次」加 DB 層保證 — trigger 在 +1 之後(已持有該碼的列鎖)再查同攤位同碼同電話的有效單,
--   有就 raise DISCOUNT_CODE_USED;電話比對兩邊都去非數字、+886 9xx → 09xx。createOrder 的 2 分鐘防重複檢查搬到驗碼之前,
--   重送的請求不會被自己的第一張單判成「已用過」。已跑過舊版 trigger 的話,重跑下面 create or replace function 即可。
create table if not exists discount_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  type text not null check (type in ('percent', 'fixed')),
  value int not null check (value > 0),
  min_subtotal int check (min_subtotal is null or min_subtotal > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  per_customer_once boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  check (type <> 'percent' or value between 1 and 99),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists discount_codes_tenant_idx on discount_codes(tenant_id, created_at desc);
alter table discount_codes enable row level security;
alter table orders add column if not exists discount_code text;
alter table orders add column if not exists discount_twd int not null default 0 check (discount_twd >= 0);
create index if not exists orders_discount_code_idx on orders(tenant_id, discount_code) where discount_code is not null;
create or replace function sync_discount_code_usage()
returns trigger as $$
declare
  v_used int; v_max int; v_once boolean; v_phone text;
begin
  if tg_op = 'INSERT' then
    if new.discount_code is not null then
      update discount_codes set used_count = used_count + 1
        where tenant_id = new.tenant_id and code = new.discount_code
        returning used_count, max_uses, per_customer_once into v_used, v_max, v_once;
      if v_max is not null and v_used > v_max then raise exception 'DISCOUNT_CODE_EXHAUSTED'; end if;
      if v_once then
        v_phone := regexp_replace(regexp_replace(coalesce(new.shipping_phone, ''), '\D', '', 'g'), '^886(9\d{8})$', '0\1');
        if v_phone <> '' and exists (
          select 1 from orders o
          where o.tenant_id = new.tenant_id and o.discount_code = new.discount_code and o.id <> new.id
            and o.status not in ('cancelled', 'refunded')
            and regexp_replace(regexp_replace(coalesce(o.shipping_phone, ''), '\D', '', 'g'), '^886(9\d{8})$', '0\1') = v_phone
        ) then raise exception 'DISCOUNT_CODE_USED'; end if;
      end if;
    end if;
    return null;
  elsif tg_op = 'UPDATE' then
    if new.discount_code is not null then
      if new.status in ('cancelled', 'refunded') and old.status not in ('cancelled', 'refunded') then
        update discount_codes set used_count = greatest(used_count - 1, 0)
          where tenant_id = new.tenant_id and code = new.discount_code;
      elsif old.status in ('cancelled', 'refunded') and new.status not in ('cancelled', 'refunded') then
        update discount_codes set used_count = used_count + 1
          where tenant_id = new.tenant_id and code = new.discount_code;
      end if;
    end if;
    return null;
  else
    if old.discount_code is not null and old.status not in ('cancelled', 'refunded') then
      update discount_codes set used_count = greatest(used_count - 1, 0)
        where tenant_id = old.tenant_id and code = old.discount_code;
    end if;
    return null;
  end if;
end;
$$ language plpgsql;
drop trigger if exists orders_discount_usage on orders;
create trigger orders_discount_usage
  after insert or update of status or delete on orders
  for each row execute function sync_discount_code_usage();
NOTIFY pgrst, 'reload schema';

-- Phase 34(2026-11-06)— 每攤位各自的金流金鑰(tenants.payment_config jsonb,channel secret / HashKey / HashIV 用 AES-256-GCM 加密)
-- 設計決定:channel_id / merchant_id 明文、敏感欄位 _enc 後綴存 secret-box 密文(lib/secret-box.ts,金鑰 PAYMENT_CONFIG_KEY 由 Peter 產生設到 Vercel);
--   getConfig 改成必帶 tenantId,DB 優先、只有 DEFAULT_TENANT_ID 沒 DB 設定時退回 env(過渡期);解密失敗不退 env;沙盒 env 全攤位覆寫、忽略 DB。
--   回呼先找訂單再用該攤位金鑰驗簽;綠界 notify 找不到訂單只 log 不推播。超級管理員在 oilswa 後台按「匯入」一次後 Vercel 的 LINEPAY_* / ECPAY_* 可刪。
-- 待辦:PAYMENT_CONFIG_KEY 輪換工具(現在換了 key 全部要重填)、金鑰操作限 owner/admin(現在任何成員都行)、tenants.line_channel_secret 等明文欄位搬到 secret-box。
alter table tenants add column if not exists payment_config jsonb;
NOTIFY pgrst, 'reload schema';

-- Phase 35(2026-11-07)— 團購:products.channel('stall'|'groupbuy')+ track_stock、新表 group_buys(一攤位同時一團 open,partial unique)、
--   tenant_followers(unique tenant+platform_user)、orders.group_buy_id、tenants.groupbuy_followers_only;
--   order_item_to_stock_movement 扣庫存時跳過 track_stock=false 的商品;order_item_reverse_stock_movement / handle_order_cancel 退 / 復活時
--   不看 track_stock,改看 stock_movements 有沒有這筆明細的紀錄(有扣過才退、有退過才再扣),商品下單後切通路 / 開關庫存才不會帳對不上。
--   設計決定:截止看 ends_at 讀取時算不跑排程;LINE 好友(users)自動算追蹤不寫表;draft 狀態保留在 check 但這版後台不產生 draft。
--   規格:docs/GROUPBUY.md。
alter table products add column if not exists channel text not null default 'stall'
  check (channel in ('stall', 'groupbuy'));
alter table products add column if not exists track_stock boolean not null default true;
create index if not exists products_tenant_channel_idx on products(tenant_id, channel, status);
create table if not exists group_buys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  ends_at timestamptz,
  expected_arrival_on date,
  status text not null default 'open'
    check (status in ('draft', 'open', 'closed', 'ordered', 'arrived', 'done')),
  notify_on_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  ordered_at timestamptz,
  arrived_at timestamptz,
  done_at timestamptz
);
create index if not exists group_buys_tenant_created_idx on group_buys(tenant_id, created_at desc);
create unique index if not exists group_buys_one_open_idx on group_buys(tenant_id) where status = 'open';
alter table group_buys enable row level security;
create trigger group_buys_updated_at before update on group_buys
  for each row execute function set_updated_at();
alter table orders add column if not exists group_buy_id uuid references group_buys(id) on delete set null;
create index if not exists orders_group_buy_idx on orders(group_buy_id) where group_buy_id is not null;
create table if not exists tenant_followers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  platform_user_id uuid not null references platform_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, platform_user_id)
);
create index if not exists tenant_followers_user_idx on tenant_followers(platform_user_id);
alter table tenant_followers enable row level security;
alter table tenants add column if not exists groupbuy_followers_only boolean not null default false;
create or replace function order_item_to_stock_movement()
returns trigger as $$
declare
  v_track boolean;
begin
  select track_stock into v_track from products where id = new.product_id;
  if coalesce(v_track, true) = false then return null; end if;
  if tg_op = 'INSERT' then
    insert into stock_movements (tenant_id, product_id, variant_id, qty_delta, reason, reference_id)
      values (new.tenant_id, new.product_id, new.variant_id, -new.qty, 'order', new.order_id);
  elsif tg_op = 'UPDATE' then
    if new.qty != old.qty then
      insert into stock_movements (tenant_id, product_id, variant_id, qty_delta, reason, reference_id, note)
        values (new.tenant_id, new.product_id, new.variant_id, old.qty - new.qty, 'manual_adjust', new.order_id,
                'order_item qty: ' || old.qty || ' -> ' || new.qty);
    end if;
  end if;
  return null;
end;
$$ language plpgsql;
create or replace function order_item_reverse_stock_movement()
returns trigger as $$
declare
  current_order_status text;
begin
  select status into current_order_status from orders where id = old.order_id;
  if current_order_status in ('cancelled', 'refunded') then return null; end if;
  if not exists (
    select 1 from stock_movements sm
     where sm.reference_id = old.order_id and sm.product_id = old.product_id
       and sm.variant_id is not distinct from old.variant_id and sm.reason = 'order'
  ) then return null; end if;
  insert into stock_movements (tenant_id, product_id, variant_id, qty_delta, reason, reference_id, note)
    values (old.tenant_id, old.product_id, old.variant_id, old.qty, 'order_cancel', old.order_id, 'order_item deleted');
  return null;
end;
$$ language plpgsql;
create or replace function handle_order_cancel()
returns trigger as $$
begin
  if new.status in ('cancelled', 'refunded') and old.status not in ('cancelled', 'refunded') then
    insert into stock_movements (tenant_id, product_id, variant_id, qty_delta, reason, reference_id, note)
      select oi.tenant_id, oi.product_id, oi.variant_id, oi.qty, 'order_cancel', oi.order_id, 'order ' || new.status
        from order_items oi
        where oi.order_id = new.id
          and exists (select 1 from stock_movements sm where sm.reference_id = oi.order_id and sm.product_id = oi.product_id
                        and sm.variant_id is not distinct from oi.variant_id and sm.reason = 'order');
  elsif old.status in ('cancelled', 'refunded') and new.status not in ('cancelled', 'refunded') then
    insert into stock_movements (tenant_id, product_id, variant_id, qty_delta, reason, reference_id, note)
      select oi.tenant_id, oi.product_id, oi.variant_id, -oi.qty, 'order', oi.order_id, 'order reactivated from ' || old.status
        from order_items oi
        where oi.order_id = new.id
          and exists (select 1 from stock_movements sm where sm.reference_id = oi.order_id and sm.product_id = oi.product_id
                        and sm.variant_id is not distinct from oi.variant_id and sm.reason = 'order_cancel');
  end if;
  return new;
end;
$$ language plpgsql;
NOTIFY pgrst, 'reload schema';

-- Phase 31 補丁(2026-11-08)— generate_order_no() 的 PL/pgSQL 變數 ym 跟 order_counters.ym 撞名,
--   「on conflict (tenant_id, ym)」→ 42702 column reference "ym" is ambiguous;11/5 跑完 Phase 31 後所有建單(網站 / LIFF / LINE Pay / 綠界)
--   都在 insert orders 失敗(前台「建立訂單失敗」),11/8 團購實測才發現。變數改 v_ 前綴。教訓:改 orders trigger 後要實際下一張測試單。
create or replace function generate_order_no()
returns trigger as $$
declare
  v_ym text;
  v_prefix text;
  v_cnt int;
begin
  if new.order_no is null or new.order_no = '' then
    v_ym := to_char(now() at time zone 'Asia/Taipei', 'YYYYMM');
    select order_prefix into v_prefix from tenants where id = new.tenant_id;
    if v_prefix is null then raise exception 'tenant % missing order_prefix', new.tenant_id; end if;
    insert into order_counters (tenant_id, ym, last_seq)
      values (new.tenant_id, v_ym, 1)
      on conflict (tenant_id, ym) do update set last_seq = order_counters.last_seq + 1
      returning last_seq into v_cnt;
    new.order_no := v_prefix || '-' || v_ym || '-' || lpad(v_cnt::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;
