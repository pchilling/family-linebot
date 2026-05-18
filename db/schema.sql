-- ============================================
-- family-linebot v1 schema
-- multi-tenant from day 1
-- 在 Supabase SQL Editor 貼上執行
-- ============================================

-- ====================
-- tenants:租戶(家裡 = 第一筆,之後 Monica 9 位銀級下線)
-- ====================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  line_channel_id text unique,           -- LINE Developer Console 的 numeric channel ID
  line_bot_user_id text unique,          -- bot 的 LINE user ID(U 開頭),webhook destination 欄位查表用
  line_channel_secret text,
  line_channel_access_token text,
  rich_menu_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ====================
-- users:LINE 好友(每個 tenant 獨立一份名單)
-- ====================
create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  line_user_id text not null,
  display_name text,
  picture_url text,
  status text not null default 'active', -- active / blocked / left
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, line_user_id)
);

create index users_tenant_idx on users (tenant_id);
create index users_status_idx on users (tenant_id, status);

-- ====================
-- messages:訊息 log(inbound + outbound 都進)
-- ====================
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  direction text not null,         -- inbound / outbound
  event_type text,                 -- message / follow / unfollow / postback
  message_type text,               -- text / image / sticker / video / audio / location / file
  content jsonb,                   -- parsed payload(text / postback data 等)
  raw_event jsonb,                 -- 原始 LINE event,schema 變化不丟資料
  created_at timestamptz not null default now()
);

create index messages_tenant_created_idx on messages (tenant_id, created_at desc);
create index messages_user_created_idx on messages (user_id, created_at desc);

-- ====================
-- updated_at 自動更新 trigger
-- ====================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tenants_updated_at before update on tenants
  for each row execute function set_updated_at();

create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ====================
-- regions:地點(台北 / 台中 / 高雄 / 台南,以後可加分館)
-- ====================
create table regions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,                     -- 台北 / 台中 / 高雄 / 台南
  address text,
  google_maps_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create trigger regions_updated_at before update on regions
  for each row execute function set_updated_at();

-- ====================
-- classes:本月課程(三合一教室 月 1 功能)
-- 不分課/活動/進階,用 is_paid 區分付費 / 免費。
-- 系列課 v1 不在 schema 處理(每場一筆,admin batch input 之後做)。
-- ====================
create table classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  region_id uuid not null references regions(id) on delete restrict,
  name text not null,
  instructor text,
  scheduled_at timestamptz not null,
  duration_min int default 90,
  capacity int,
  is_paid boolean not null default false,
  price_twd int,
  signup_url text,
  description text,
  status text not null default 'open',    -- open / full / cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index classes_tenant_scheduled_idx on classes (tenant_id, scheduled_at);
create index classes_region_scheduled_idx on classes (region_id, scheduled_at);

create trigger classes_updated_at before update on classes
  for each row execute function set_updated_at();

-- ====================
-- products:商品資料庫(線 2 月 1)
-- ====================
create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text,                               -- 內部品號
  name text not null,
  description text,
  price_twd int not null,                 -- 售價
  cost_twd int,                           -- 成本(內部,不對外)
  stock int not null default 0,           -- 庫存
  image_url text,
  category text,                          -- 精油 / 保養品 / 保健 / 配件
  status text not null default 'active',  -- active / discontinued
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index products_tenant_status_idx on products(tenant_id, status);
create index products_category_idx on products(tenant_id, category);

create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- ====================
-- orders:訂單主檔(線 2 月 1)
-- ====================
create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete restrict,
  order_no text,                          -- 顯示用 ORD-20260519-001
  status text not null default 'open',    -- open / paid / shipped / completed / cancelled
  payment_status text default 'pending',  -- pending / paid / refunded
  payment_method text,                    -- bank / cash / line_pay
  total_twd int not null default 0,
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

create index orders_tenant_status_idx on orders(tenant_id, status);
create index orders_user_idx on orders(user_id);
create index orders_created_idx on orders(tenant_id, created_at desc);

create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- ====================
-- order_items:訂單明細
-- ====================
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty int not null,
  price_at_purchase int not null,         -- snapshot,商品改價也不變
  subtotal_twd int not null,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on order_items(order_id);
create index order_items_product_idx on order_items(product_id);

-- ====================
-- TODO (admin panel 需要時開):
-- - Row Level Security policies
-- - 對應的 supabase auth role
-- ====================
