# Stall 架構決定文件

> 給 Claude Code 的執行用技術 spec。
> 這份文件描述 Stall(Peter 的多租戶電商平台)的架構決定。
> 商業 context 請看 `Stall_README.md`。

---

## 一、Stall 是什麼

**Stall = family-linebot 的進化版**,不是新專案。

```
family-linebot(現況,Phase 3 deployed)
    ↓ 演化為
Stall(同一個 codebase,擴大為 multi-tenant 電商平台)
```

**所有現有的 family-linebot 程式碼、schema、deployment** 都會逐步遷移到 Stall 架構。

不需要建新 repo、不需要新 Supabase 專案、不需要新 Vercel deployment。**就是 in-place migration**。

---

## 二、核心架構決定(已 lock,不要動)

以下 6 個架構決定**已經對齊**,Claude Code 在實作時請遵循,不要自作主張改動:

### 決定 1:「人」採 **混合架構**(平台層 + tenant 層)

**Rationale**:Peter 要看跨 tenant 的全景,但每個 tenant 又要能對「同一個人」有自己的標注。

```
platform_users          ← 平台層,記錄「人」的 identity
  └── id, line_user_id, phone, display_name

tenant_customers        ← tenant 層,記錄該 tenant 對這個人的標注
  └── tenant_id, platform_user_id (FK),
      display_name, tags, total_spent
```

**規則**:
- 同一個 line_user_id → 一個 platform_user(去重)
- Cyndi、oilswa、Kim 各自的 tenant_customers 表獨立
- 跨 tenant 全景只有 platform admin (Peter) 看得到

### 決定 2:Tenant 功能分層用 **Feature Flag**

不做 module loader 系統,用 JSONB 欄位:

```sql
tenants.features jsonb default '{}'::jsonb
-- 例:{"catalog": true, "advanced_classroom": true, "neo_extensions": true}
```

程式碼用 `tenant.features.catalog` 控制功能顯示。

### 決定 3:Catalog(跨 tenant 賣商品)**Schema 留 hook,功能 Phase 2 才做**

`products` 表預埋三個欄位,Phase 1 全部 null:

```sql
source_product_id uuid references products(id)   -- 原商品
source_tenant_id uuid references tenants(id)     -- 原 tenant
revenue_share_pct int check (revenue_share_pct between 0 and 100)
```

**Phase 1 不寫 catalog 邏輯**,只是 schema 有欄位。

### 決定 4:金流 **Phase 1 不做平台金流**

每個 tenant 用自己的方式收錢(轉帳、ECPay、超商各自開戶)。
系統只記訂單狀態(`payment_status='paid'`),真正金流走外面。

**Stall 不當金流中介**(避免第三方支付牌照問題)。

### 決定 5:Theme 系統 — Phase 1 走簡版 LIFF,Phase 2+ 才上 3 套主題

**Phase 1**(現在):
- oilswa 的「商品專區」走 LINE Bot Rich Menu → LIFF 簡版頁面
- 不上 3 套主題系統
- `tenant_themes` 表可建,但 oilswa / cyndi 都用 `theme_id='default'`

**Phase 2+**(半年後):
- 找設計師完成 3 套主題(Apothecary / Editorial / Corner Store)
- 開始啟動 Stall 對外品牌

### 決定 6:**所有人(Peter / Kim / Cyndi / oilswa)都是 tenant**

不要有「特殊存在」。Peter 個人攤位 = `tenant_id = 'peter-personal'`。
oilswa 家族事業 = `tenant_id = 'oilswa'`。
Cyndi 童裝 = `tenant_id = 'cyndi'`。

架構統一,沒例外。

### 決定 7:Theme 可自訂的範圍採 **4 層分層**

| Tier | 可改 |
|---|---|
| Free | 4 個 token:logo、主色、banner、tagline |
| Plus | + 字體組(從 3 套選)、按鈕風格、product card 風格 |
| Pro | + hero 排版、section 順序、自訂頁面、custom domain |
| Enterprise | 客製設計(找 NEOP 簽合約,不在系統內) |

**永遠鎖死的**:字體本身、商品 card 構圖邏輯、響應式、動畫、結帳流程 UI、分享卡版型。

**oilswa 暫定走 Enterprise tier**(家族客製),不套用標準主題系統。

---

## 三、完整 Schema(Stall v1)

下面是 Stall 完整 schema。Claude Code 接到指示時,**請按照此 schema 規劃實作**,不要擅自加表或改欄位。

### Platform Layer

```sql
-- ====================
-- platform_users:所有用 Stall 的「人」
-- ====================
create table platform_users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,              -- LINE 帳號 ID(主要識別)
  phone text,                             -- 手機(輔助識別)
  email text,
  display_name text,
  picture_url text,
  
  -- merge 機制(未來合併重複帳號)
  merged_into_user_id uuid references platform_users(id),
  
  status text not null default 'active'
    check (status in ('active', 'merged', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ====================
-- tenants:所有攤位
-- ====================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  
  -- 基本識別
  slug text unique not null,              -- URL slug:cyndi, oilswa, kim-closet
  name text not null,
  owner_user_id uuid not null references platform_users(id),
  
  -- 商業設定
  plan text not null default 'free'
    check (plan in ('free', 'plus', 'pro', 'enterprise')),
  status text not null default 'active'
    check (status in ('active', 'hibernated', 'suspended', 'deleted')),
  features jsonb not null default '{}'::jsonb,
  
  -- Theme(Phase 1 用 default,Phase 2+ 才啟用 3 套主題)
  theme_id text default 'default'
    check (theme_id in ('default', 'apothecary', 'editorial', 'corner-store')),
  theme_overrides jsonb default '{}'::jsonb,
  
  -- LINE@ 整合
  line_channel_id text unique,
  line_bot_user_id text unique,
  line_channel_secret text,
  line_channel_access_token text,
  rich_menu_id text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ====================
-- tenant_members:誰可以管理哪個 tenant
-- ====================
create table tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references platform_users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
```

### Tenant Layer

```sql
-- ====================
-- tenant_customers:tenant 對「人」的標注
-- ====================
create table tenant_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  platform_user_id uuid not null references platform_users(id),
  
  -- tenant 自己對這個人的標注
  display_name text,
  note text,
  tags text[],
  
  -- 聚合資料(trigger 維護)
  total_orders int not null default 0,
  total_spent_twd int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform_user_id)
);

-- ====================
-- products(預埋 catalog hook)
-- ====================
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  
  sku text,
  name text not null,
  description text,
  price_twd int not null check (price_twd >= 0),
  cost_twd int check (cost_twd >= 0),
  stock int not null default 0,
  image_url text,
  category text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'discontinued')),
  
  -- 🎯 Catalog hook(Phase 2 啟用)
  source_product_id uuid references products(id),
  source_tenant_id uuid references tenants(id),
  revenue_share_pct int check (revenue_share_pct between 0 and 100),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

-- ====================
-- orders(預埋 source 區分)
-- ====================
create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  platform_user_id uuid references platform_users(id),
  
  order_no text not null,
  
  -- 🎯 來源區分
  source text not null default 'manual'
    check (source in ('web', 'liff', 'manual', 'line_chat')),
  
  status text not null default 'open'
    check (status in ('open', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_method text,
  total_twd int not null default 0 check (total_twd >= 0),
  
  shipping_recipient text,
  shipping_phone text,
  shipping_address text,
  tracking_no text,
  note text,
  
  paid_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_no)
);

-- order_items, stock_movements, classes, regions
-- ... 沿用現有 family-linebot 設計,但 user_id 改成 platform_user_id
```

### 不在 Phase 1 做但 schema 預留位

```
catalogs                  ← Phase 2(代銷系統)
catalog_listings          ← Phase 2
product_images            ← Phase 2(多圖)
product_variants          ← Phase 2(SKU 變體)
share_cards               ← Phase 2(分享卡)
inquiries                 ← Phase 2(詢問系統)
tenant_themes_advanced    ← Phase 2(主題進階設定)
pv_records                ← Phase 3(NEO 特用)
```

**Phase 1 不要建這些表**。但**現有表的設計要避免日後加這些表時要 migration**(就是上面 schema 預埋的 `source_*` 欄位、`features` jsonb 這些)。

---

## 四、現有 family-linebot 的遷移路徑

family-linebot 目前 schema(Phase 3 完成):

```
tenants                 ← 已有,缺 plan/status/features/theme_id
users                   ← 要拆成 platform_users + tenant_customers
messages                ← 沿用,user_id 改 FK platform_users
regions, classes        ← 沿用,加 tenant_id
products, orders, ...   ← 還沒建(這次 Phase 4 才建,直接套 Stall schema)
```

### 遷移步驟(by Claude Code 執行)

**Step 1**:建 `platform_users` 表
```sql
create table platform_users (...);  -- 如上 schema
```

**Step 2**:把現有 `users` 的資料搬到 `platform_users`
```sql
insert into platform_users (id, line_user_id, display_name, picture_url, created_at)
select id, line_user_id, display_name, picture_url, added_at
from users;
```

**Step 3**:`users` 表改名 `tenant_customers`,加 `platform_user_id` FK
```sql
alter table users rename to tenant_customers;
alter table tenant_customers add column platform_user_id uuid references platform_users(id);
update tenant_customers set platform_user_id = id;  -- 同 id,因為剛搬過去
-- 之後可以把 line_user_id, display_name, picture_url 從 tenant_customers 移除
-- (這些資訊只在 platform_users 表存)
```

**Step 4**:`tenants` 表 alter add 新欄位
```sql
alter table tenants add column slug text;
alter table tenants add column owner_user_id uuid references platform_users(id);
alter table tenants add column plan text default 'free' check (plan in ('free','plus','pro','enterprise'));
alter table tenants add column status text default 'active' check (status in ('active','hibernated','suspended','deleted'));
alter table tenants add column features jsonb default '{}'::jsonb;
alter table tenants add column theme_id text default 'default' check (theme_id in ('default','apothecary','editorial','corner-store'));
alter table tenants add column theme_overrides jsonb default '{}'::jsonb;

-- 設定現有 tenant slug + plan
update tenants set slug = 'oilswa', plan = 'enterprise' where name like '%三合一%';
```

**Step 5**:建 `tenant_members` 表
```sql
create table tenant_members (...);
-- 把 Peter 加為現有 tenant 的 owner
```

**Step 6**:建 Phase 4 新表(products / orders / order_items / stock_movements)
**直接套 Stall schema**,不要套舊版本。`user_id` 全部用 `platform_user_id`。

**Step 7**:更新 family-linebot 程式碼
- webhook handler:upsert 改為先寫 platform_users,再寫 tenant_customers
- LIFF /m/member:讀寫改為 platform_users(基本資料)+ tenant_customers(tenant 內標注)
- admin pages:沿用,但 query 要 join platform_users + tenant_customers

---

## 五、Phase 4 工作範圍(現在到三個月內)

### 必做(對齊家族 + Cyndi 需求)

**For oilswa(家族,Enterprise tier)**:
1. ✅ Phase 4.1:products / orders / order_items / stock_movements 套 Stall schema
2. ✅ Phase 4.2:`/admin/products` CRUD(管理員建商品)
3. ✅ Phase 4.3:`/admin/orders` CRUD(員工管訂單、出貨、對帳)
4. ✅ Phase 4.4:LIFF `/m/shop` 商品專區(簡版,給 LINE Bot Rich Menu 第 3 格用)
5. ✅ Phase 4.5:LIFF `/m/checkout` 下單(不接金流,只開單,後台手動標已收款)
6. ✅ Phase 4.6:小編 / 會計 / 出貨 admin dashboard(查單、印面單、對帳)

**For Cyndi(Pro tier)**:
7. ✅ Phase 4.7:把 Cyndi 開為 tenant `slug='cyndi'`, `plan='pro'`
8. ✅ Phase 4.8:Cyndi 走同一套 admin pages,只是 tenant_id 不同
9. ✅ Phase 4.9:Cyndi 不需要 LIFF 商品專區(她沒有 LINE Bot),走網頁版 `stall.com/cyndi`(暫時 vercel domain)

### 不做(Phase 5+)

❌ 3 套美感主題(設計師還沒找)
❌ 分享卡引擎
❌ Catalog 跨 tenant 賣商品
❌ 平台金流
❌ 對外正式啟用「Stall」品牌名

---

## 六、Claude Code 的行動準則

### DO

✅ 嚴格遵守 Stall schema(尤其 platform_users / tenant_customers 拆分)
✅ 所有新表都帶 `tenant_id`(除了 platform layer 的表)
✅ Multi-tenant 從第一行 code 就考慮
✅ 用 RLS(現在全 deny,只 server actions 用 service_role)
✅ 對外品牌名仍叫各自的(oilswa、cyndi),不要對外露出「Stall」
✅ 每次新功能完成,update `progress.md`
✅ 商業敏感資訊(doTERRA 政策、家族關係)**不要寫進 commit message 或 public code**

### DON'T

❌ 不要建 catalog / share_cards / inquiries 這些 Phase 2 表
❌ 不要做 3 套主題系統(等設計師)
❌ 不要試圖整合金流(Phase 2 才評估)
❌ 不要在 oilswa 系統裡寫 doTERRA 業績計算邏輯(政策紅線)
❌ 不要把 PII(姓名、電話、地址)log 到任何外部服務
❌ 不要建立「Peter 個人」以外的 super admin role(平台主只有一個)

---

## 七、紅線(必避,跟 SPEC.md 一致)

1. **doTERRA 政策**:第 5.C / 5.D / 5.E / 10.A / 10.B.7 條
   - 不做 PV 追蹤 / 計算機 / LRP 養成 / 精油消化為輔銷品
   - 任何「自動計算下線業績、分潤」邏輯都不寫進 code
2. **資料保護**:用戶 PII 只內部用,不分享第三方
3. **權限隔離**:RLS 全 enable + tenant_id 一致性檢查
4. **法律歸屬**:Stall 不當金流中介(避免第三方支付牌照)

---

## 八、跟其他文件的關係

| 文件 | 用途 | 主要讀者 |
|---|---|---|
| `Stall_README.md` | 商業策略 / 為什麼存在 | Peter 自己回顧 |
| `CONTEXT_BUSINESS_ECOSYSTEM.md` | NEOP / New Era Oil / 家族關係 | Claude Code 理解大圖 |
| `SPEC.md` | family-linebot 工程規格 | Claude Code 實作參考 |
| `progress.md` | 開發進度 + flows | Claude Code 知道做到哪 |
| **`STALL_ARCHITECTURE.md`(本檔)** | **Stall 架構決定 + 遷移路徑** | **Claude Code 接到 Stall 任務時的 source of truth** |

當 SPEC.md 與本檔衝突時,**以本檔為準**(因為 family-linebot 正在演化為 Stall)。

---

## 九、給 Claude Code 的開場提示

每次開啟 Claude Code session 跟它說:

> 「請先讀 `STALL_ARCHITECTURE.md` 和 `progress.md`,理解專案架構和目前進度。然後執行任務:[具體任務]」

這樣它就有完整上下文。

---

*版本:1.0*
*日期:2026-05-19*
*作者:Peter + Claude(Sonnet 4.7)架構討論結果*
