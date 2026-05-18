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
-- classes:本月課程(三合一教室 月 1 功能)
-- 提案 v5 第 136 行:分台北 / 台中 / 高雄 / 台南 四區,每月 16 場次
-- ====================
create table classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  region text not null,                   -- 台北 / 台中 / 高雄 / 台南
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
create index classes_region_idx on classes (tenant_id, region, scheduled_at);

create trigger classes_updated_at before update on classes
  for each row execute function set_updated_at();

-- ====================
-- TODO (admin panel 需要時開):
-- - Row Level Security policies
-- - 對應的 supabase auth role
-- ====================
