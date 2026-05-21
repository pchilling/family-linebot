-- ============================================
-- family-linebot v1 schema
-- multi-tenant from day 1
-- 在 Supabase SQL Editor 貼上執行
-- ============================================

-- ====================
-- 通用函數(必須先 declared,後面 trigger 才能用)
-- ====================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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
  status text not null default 'active'
    check (status in ('active', 'blocked', 'left')),
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
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text,                 -- message / follow / unfollow / postback
  message_type text,               -- text / image / sticker / video / audio / location / file
  content jsonb,                   -- parsed payload(text / postback data 等)
  raw_event jsonb,                 -- 原始 LINE event,schema 變化不丟資料
  created_at timestamptz not null default now()
);

create index messages_tenant_created_idx on messages (tenant_id, created_at desc);
create index messages_user_created_idx on messages (user_id, created_at desc);

-- ====================
-- updated_at triggers(set_updated_at 已 declared 在 schema 頂端)
-- ====================
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
  status text not null default 'open'
    check (status in ('open', 'full', 'cancelled')),
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
  sku text,
  name text not null,
  description text,
  price_twd int not null check (price_twd >= 0),
  cost_twd int check (cost_twd >= 0),
  stock int not null default 0,           -- cache,真實來源 = sum(stock_movements)
  image_url text,
  category text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'discontinued')),
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
-- order_no 自動產 OW-YYYYMM-NNNN(trigger 處理)
-- ====================
create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete restrict,
  order_no text not null,
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

create index orders_tenant_status_idx on orders(tenant_id, status);
create index orders_user_idx on orders(user_id);
create index orders_created_idx on orders(tenant_id, created_at desc);

create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- 自動產 order_no(before insert)
-- pg_advisory_xact_lock 避免並發 race;max(seq) 避免刪單後 count 撞號
create or replace function generate_order_no()
returns trigger as $$
declare
  ym text;
  cnt int;
begin
  if new.order_no is null or new.order_no = '' then
    ym := to_char(now() at time zone 'Asia/Taipei', 'YYYYMM');
    -- 同 tenant + 年月只允許一個 transaction 進來算編號
    perform pg_advisory_xact_lock(hashtext(new.tenant_id::text || ym));
    select coalesce(max(substring(order_no from 'OW-\d{6}-(\d+)$')::int), 0) + 1 into cnt
      from orders
      where tenant_id = new.tenant_id
        and order_no like 'OW-' || ym || '-%';
    new.order_no := 'OW-' || ym || '-' || lpad(cnt::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger orders_generate_no before insert on orders
  for each row execute function generate_order_no();

-- 自動填 paid_at / shipped_at(before update)
create or replace function set_order_timestamps()
returns trigger as $$
begin
  if new.payment_status = 'paid'
     and (old.payment_status is null or old.payment_status != 'paid') then
    new.paid_at = now();
  end if;
  if new.status = 'shipped'
     and (old.status is null or old.status != 'shipped') then
    new.shipped_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger orders_set_timestamps
  before update of payment_status, status on orders
  for each row execute function set_order_timestamps();

-- ====================
-- order_items:訂單明細
-- 加 tenant_id(冗餘但 RLS 簡化);subtotal_twd 用 generated column
-- ====================
create table order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty int not null check (qty > 0),
  price_at_purchase int not null check (price_at_purchase >= 0),
  subtotal_twd int generated always as (qty * price_at_purchase) stored,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on order_items(order_id);
create index order_items_product_idx on order_items(product_id);
create index order_items_tenant_idx on order_items(tenant_id);

-- 自動同步 orders.total_twd(after insert/update/delete on order_items)
create or replace function refresh_order_total()
returns trigger as $$
declare
  oid uuid;
begin
  oid := coalesce(new.order_id, old.order_id);
  update orders
    set total_twd = (
      select coalesce(sum(subtotal_twd), 0)
        from order_items
        where order_id = oid
    ),
    updated_at = now()
    where id = oid;
  return null;
end;
$$ language plpgsql;

create trigger order_items_refresh_total
  after insert or update or delete on order_items
  for each row execute function refresh_order_total();

-- ====================
-- stock_movements:庫存進出歷史(進貨 / 出貨 / 損耗)
-- products.stock 是 cache,真實來源 = sum(qty_delta)
-- ====================
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  qty_delta int not null check (qty_delta != 0),  -- 正 = 進貨;負 = 出貨 / 損耗
  reason text not null
    check (reason in ('order', 'order_cancel', 'restock', 'damage', 'manual_adjust', 'inventory_count')),
  reference_id uuid,                      -- order_id when reason='order';null otherwise
  note text,
  created_at timestamptz not null default now()
);

create index stock_movements_product_idx on stock_movements(product_id, created_at desc);
create index stock_movements_tenant_idx on stock_movements(tenant_id, created_at desc);

-- append-only:禁止 UPDATE,要修正請新 insert 一筆 manual_adjust
create or replace function prevent_stock_movement_update()
returns trigger as $$
begin
  raise exception 'stock_movements is append-only. Insert a correction movement instead.';
end;
$$ language plpgsql;

create trigger stock_movements_no_update
  before update on stock_movements
  for each row execute function prevent_stock_movement_update();

-- stock_movements insert / delete → 同步 variant.stock(有 variant_id 用 variant,沒 fallback product)
-- Stage C 之後:新訂單 stock_movements 一定帶 variant_id,所以一律走 variant 分支
-- legacy fallback 保留給沒有 variant_id 的舊資料(理論上 backfill 完都該有)
create or replace function update_product_stock()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.variant_id is not null then
      update product_variants set stock = stock + new.qty_delta where id = new.variant_id;
    else
      update products set stock = stock + new.qty_delta where id = new.product_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.variant_id is not null then
      update product_variants set stock = stock - old.qty_delta where id = old.variant_id;
    else
      update products set stock = stock - old.qty_delta where id = old.product_id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger stock_movements_sync_stock
  after insert or delete on stock_movements
  for each row execute function update_product_stock();

-- order_items insert → 自動寫 stock_movements(qty_delta = -qty)
-- order_items update qty → 補一筆 manual_adjust 差異
create or replace function order_item_to_stock_movement()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id)
      values (new.tenant_id, new.product_id, -new.qty, 'order', new.order_id);
  elsif tg_op = 'UPDATE' then
    if new.qty != old.qty then
      insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id, note)
        values (new.tenant_id, new.product_id, old.qty - new.qty, 'manual_adjust', new.order_id,
                'order_item qty: ' || old.qty || ' -> ' || new.qty);
    end if;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger order_items_stock_out
  after insert or update on order_items
  for each row execute function order_item_to_stock_movement();

-- order_items delete → 反向加回 stock
-- 但若 order 已 cancelled/refunded(handle_order_cancel 已退過),skip 避免雙重退貨
-- 若 order 也 cascade 被刪(select 回 null),仍會退貨 — 正確邏輯
create or replace function order_item_reverse_stock_movement()
returns trigger as $$
declare
  current_order_status text;
begin
  select status into current_order_status from orders where id = old.order_id;
  if current_order_status in ('cancelled', 'refunded') then
    return null;
  end if;
  insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id, note)
    values (old.tenant_id, old.product_id, old.qty, 'order_cancel', old.order_id, 'order_item deleted');
  return null;
end;
$$ language plpgsql;

create trigger order_items_stock_reverse
  after delete on order_items
  for each row execute function order_item_reverse_stock_movement();

-- order_items 防呆:禁改 product_id / order_id / tenant_id
-- 要改請刪掉重 insert
create or replace function prevent_order_item_critical_change()
returns trigger as $$
begin
  if new.product_id != old.product_id then
    raise exception 'order_items.product_id cannot be changed. Delete and re-insert.';
  end if;
  if new.order_id != old.order_id then
    raise exception 'order_items.order_id cannot be changed.';
  end if;
  if new.tenant_id != old.tenant_id then
    raise exception 'order_items.tenant_id cannot be changed.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger order_items_prevent_critical_change
  before update on order_items
  for each row execute function prevent_order_item_critical_change();

-- order_items.tenant_id 必須跟 orders.tenant_id 一致(防 app code bug 破 RLS 隔離)
create or replace function check_order_item_tenant()
returns trigger as $$
declare
  expected_tenant uuid;
begin
  select tenant_id into expected_tenant from orders where id = new.order_id;
  if expected_tenant != new.tenant_id then
    raise exception 'order_items.tenant_id (%) must match orders.tenant_id (%)',
      new.tenant_id, expected_tenant;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger order_items_check_tenant
  before insert or update on order_items
  for each row execute function check_order_item_tenant();

-- orders.status 改 cancelled/refunded → 退每個 order_item 庫存
-- 從 cancel 變回正常 → 再次扣回庫存(支援「復活訂單」流程)
create or replace function handle_order_cancel()
returns trigger as $$
begin
  if new.status in ('cancelled', 'refunded')
     and old.status not in ('cancelled', 'refunded') then
    insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id, note)
      select tenant_id, product_id, qty, 'order_cancel', order_id, 'order ' || new.status
        from order_items where order_id = new.id;
  elsif old.status in ('cancelled', 'refunded')
        and new.status not in ('cancelled', 'refunded') then
    insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id, note)
      select tenant_id, product_id, -qty, 'order', order_id, 'order reactivated from ' || old.status
        from order_items where order_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger orders_handle_cancel
  after update of status on orders
  for each row execute function handle_order_cancel();

-- ====================
-- RLS(Row Level Security)
-- 所有表 enable,沒 policy = 預設全 deny。
-- service_role 自動 bypass(server actions 走這條,不受影響)。
-- 未來 LIFF / admin 直連 supabase 時,再加 specific policy。
-- ====================
alter table tenants enable row level security;
alter table users enable row level security;
alter table messages enable row level security;
alter table regions enable row level security;
alter table classes enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table stock_movements enable row level security;

-- ====================
-- Phase 5:Stall 平台層 migration
-- (對齊 STALL_ARCHITECTURE Step 1, 2, 4, 5;oilswa 為第一個 Stall tenant)
-- Step 3 / 6(users→tenant_customers rename + orders.platform_user_id)留 code refactor session 才做
-- ====================

-- platform_users:平台層「人」(跨 tenant)
create table platform_users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  phone text,
  email text,
  display_name text,
  picture_url text,
  merged_into_user_id uuid references platform_users(id),
  status text not null default 'active'
    check (status in ('active', 'merged', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_users_updated_at before update on platform_users
  for each row execute function set_updated_at();

-- 追溯被 merge 帳號用(partial index 省空間)
create index platform_users_merged_idx on platform_users(merged_into_user_id)
  where merged_into_user_id is not null;

-- 搬 users → platform_users(id 保持一致,便於後續 FK 對應)
-- 注意:如果 Peter (admin) 還沒加 LINE@ 好友,users 表內就沒他 row,
--      tenant_members 那筆 owner insert 會 0 筆。Peter 加好友後 webhook 會記入 users,
--      再手動 INSERT from users 補上即可。不要寫 placeholder hardcode 「Peter」
--      避免 platform_users.id 跟 users.id 不一致(B fix migration 已踩過坑)。
insert into platform_users (id, line_user_id, display_name, picture_url, created_at, updated_at)
  select id, line_user_id, display_name, picture_url, added_at, updated_at
    from users
  on conflict (line_user_id) do nothing;

-- tenants 加 Stall 欄位
alter table tenants add column if not exists slug text;
alter table tenants add column if not exists owner_user_id uuid references platform_users(id);
alter table tenants add column if not exists plan text default 'free'
  check (plan in ('free', 'plus', 'pro', 'enterprise'));
alter table tenants add column if not exists status text default 'active'
  check (status in ('active', 'hibernated', 'suspended', 'deleted'));
alter table tenants add column if not exists features jsonb default '{}'::jsonb;
alter table tenants add column if not exists theme_id text default 'default'
  check (theme_id in ('default', 'apothecary', 'editorial', 'corner-store'));
alter table tenants add column if not exists theme_overrides jsonb default '{}'::jsonb;

-- oilswa 設 slug / plan / owner
update tenants
  set slug = 'oilswa',
      plan = 'enterprise',
      owner_user_id = (select id from platform_users where line_user_id = 'U25423dee75701ec1e3b8bdae2f826924')
  where id = '8106161d-ad82-4bad-ba61-da1aac65bb2c';

-- 防呆:任何漏 set 的 tenant 自動帶 fallback slug
update tenants set slug = 'tenant-' || substring(id::text, 1, 8) where slug is null;

alter table tenants alter column slug set not null;
alter table tenants add constraint tenants_slug_unique unique (slug);

-- tenant_members:誰可以管哪個 tenant
create table tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references platform_users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- Peter 為 oilswa owner
insert into tenant_members (tenant_id, user_id, role)
  select '8106161d-ad82-4bad-ba61-da1aac65bb2c', id, 'owner'
    from platform_users
    where line_user_id = 'U25423dee75701ec1e3b8bdae2f826924';

-- products 預埋 catalog hook(Phase 2 才寫邏輯,Phase 1 全 null)
alter table products add column if not exists source_product_id uuid references products(id);
alter table products add column if not exists source_tenant_id uuid references tenants(id);
alter table products add column if not exists revenue_share_pct int
  check (revenue_share_pct between 0 and 100);

-- orders 加 source(web / liff / manual / line_chat 區分)
alter table orders add column if not exists source text not null default 'manual'
  check (source in ('web', 'liff', 'manual', 'line_chat'));

-- 新表 RLS enable
alter table platform_users enable row level security;
alter table tenant_members enable row level security;

-- ====================
-- Phase 5.1:STALL_ARCHITECTURE v1.1 delta(2026-05-19)
-- - 雙入口架構(公開網站 + LIFF)準備
-- - 多 auth provider 預埋(Phase 2 啟用 email / google)
-- - SEO / 分享 預埋
-- - Guest checkout 預埋
-- - products.slug for URL route
-- - Cyndi tenant 建立(Peter 代管)
-- ====================

-- platform_users 加 auth provider 欄位
alter table platform_users add column if not exists primary_auth_provider text default 'line'
  check (primary_auth_provider in ('line', 'email', 'google'));
alter table platform_users add column if not exists email_verified boolean default false;

-- platform_user_auth_methods(Phase 1 schema 預埋,Phase 2 才寫邏輯)
create table if not exists platform_user_auth_methods (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid not null references platform_users(id) on delete cascade,
  provider text not null check (provider in ('line', 'email', 'google')),
  provider_id text not null,
  password_hash text,
  verified boolean default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_id)
);
alter table platform_user_auth_methods enable row level security;

-- tenants 加 SEO / 分享 欄位
alter table tenants add column if not exists description text;
alter table tenants add column if not exists og_image_url text;
alter table tenants add column if not exists brand_color text;

-- products 加 slug(URL 友善路由 /[slug]/p/[slug])
-- partial unique index:既有 row 都 NULL,not unique 衝突
alter table products add column if not exists slug text;
create unique index if not exists products_tenant_slug_unique on products(tenant_id, slug)
  where slug is not null;

-- orders 加 guest checkout 欄位
alter table orders add column if not exists guest_email text;
alter table orders add column if not exists guest_phone text;

-- ====================
-- Cyndi tenant(Phase 4-Alpha,Peter 代管,暫不接 LINE Bot)
-- ====================
-- features 留空 jsonb(Phase 1 沒任何 flag 控制邏輯,真要啟用 catalog 等 Phase 2 再加)
insert into tenants (slug, name, owner_user_id, plan, features, status)
  values (
    'cyndi',
    'Cyndi 童裝代購',
    (select id from platform_users where line_user_id = 'U25423dee75701ec1e3b8bdae2f826924'),
    'pro',
    '{}'::jsonb,
    'active'
  )
  on conflict (slug) do nothing;

insert into tenant_members (tenant_id, user_id, role)
  select t.id, t.owner_user_id, 'owner'
    from tenants t
    where t.slug = 'cyndi' and t.owner_user_id is not null
  on conflict (tenant_id, user_id) do nothing;

-- ====================
-- Kim tenant(2026-05-21,Peter 代管,Free 階,純自己人 / 二手 / 偶爾代購)
-- 無 LINE Bot / 無 LIFF / 無 inventory(plan=free gating)/ 公開網站 footer 帶浮水印
-- order_prefix 在 Phase 5.3 加好後寫進來,fresh deploy 沒問題
-- ====================
insert into tenants (slug, name, owner_user_id, plan, features, status, order_prefix)
  values (
    'kim',
    'Kim 個人賣場',
    (select id from platform_users where line_user_id = 'U25423dee75701ec1e3b8bdae2f826924'),
    'free',
    '{}'::jsonb,
    'active',
    'KM'
  )
  on conflict (slug) do nothing;

insert into tenant_members (tenant_id, user_id, role)
  select t.id, t.owner_user_id, 'owner'
    from tenants t
    where t.slug = 'kim' and t.owner_user_id is not null
  on conflict (tenant_id, user_id) do nothing;

-- ====================
-- Phase 5.4:tenant 聯絡資訊(2026-05-21)
-- 客人在訂單成立頁可看到「聯絡賣家」區塊。
-- 單一 free text 欄位,賣家自行寫(LINE / 電話 / Email / IG 等)。
-- ====================
alter table tenants add column if not exists contact_info text;

-- ====================
-- Phase 6.1:教室簽到 + 出席紀錄(2026-05-21,線 1 三合一愛油哇月 1 補完)
-- 學員 LIFF 自助簽到 + 老師 admin 手動勾;一個學員同一堂課 unique
-- method 來源:
--   - liff   = 從 Rich Menu / keyword 進 /m/checkin 主動按按鈕(無 query)
--   - qr     = 掃教室 QR(URL 帶 ?class_id=xxx,LIFF 自動簽)
--   - manual = admin 手動勾(老師後台幫沒帶手機的學員補簽)
--   - admin  = admin 後台批次補登
-- user_id → users(id):跟 orders.user_id / messages.user_id 一致。
--           Phase B 會一次 migrate 全部到 platform_user_id(等 migration plan + staging 測)
-- ====================
create table if not exists attendances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  class_id uuid not null references classes(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  method text not null default 'liff'
    check (method in ('liff', 'qr', 'manual', 'admin')),
  created_by uuid references platform_users(id),  -- manual/admin 時記是誰加的,liff/qr = null
  note text,
  unique (class_id, user_id)
);

create index if not exists attendances_class_idx on attendances(class_id);
create index if not exists attendances_user_idx on attendances(user_id);
create index if not exists attendances_tenant_created_idx on attendances(tenant_id, checked_in_at desc);

-- attendances.tenant_id 必須跟 classes.tenant_id + users.tenant_id 兩邊都一致
-- (防 app code bug:oilswa 學員被誤建到 cyndi 簽到、或反過來)
-- 對齊 order_items_check_tenant pattern,但多檢查 user
create or replace function check_attendance_tenant()
returns trigger as $$
declare
  class_tenant uuid;
  user_tenant uuid;
begin
  select tenant_id into class_tenant from classes where id = new.class_id;
  if class_tenant != new.tenant_id then
    raise exception 'attendances.tenant_id (%) must match classes.tenant_id (%)',
      new.tenant_id, class_tenant;
  end if;

  select tenant_id into user_tenant from users where id = new.user_id;
  if user_tenant != new.tenant_id then
    raise exception 'attendances.tenant_id (%) must match users.tenant_id (%)',
      new.tenant_id, user_tenant;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger attendances_check_tenant
  before insert or update on attendances
  for each row execute function check_attendance_tenant();

alter table attendances enable row level security;

-- ====================
-- Phase 6.2:活動報名 / 候補表單(2026-05-21,線 1 月 2 — 用同個 classes 表)
-- 學員可預先報名;未來上線 LIFF /m/events 自助報名
-- - status:confirmed(確認)/ waitlist(候補)/ cancelled(取消)/ no_show(沒到)
-- - 滿員時自動轉 waitlist + position 編號;有人取消後 admin 手動或自動 promote
-- - tenant_id check 跟 attendances 同 pattern
-- ====================
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  class_id uuid not null references classes(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'waitlist', 'cancelled', 'no_show')),
  position int,                   -- waitlist 順序(1-based);confirmed/cancelled/no_show = null
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create index if not exists reservations_class_status_idx on reservations(class_id, status);
create index if not exists reservations_user_idx on reservations(user_id);
create index if not exists reservations_tenant_created_idx on reservations(tenant_id, created_at desc);

create trigger reservations_updated_at before update on reservations
  for each row execute function set_updated_at();

create or replace function check_reservation_tenant()
returns trigger as $$
declare
  class_tenant uuid;
  user_tenant uuid;
begin
  select tenant_id into class_tenant from classes where id = new.class_id;
  if class_tenant != new.tenant_id then
    raise exception 'reservations.tenant_id (%) must match classes.tenant_id (%)',
      new.tenant_id, class_tenant;
  end if;

  select tenant_id into user_tenant from users where id = new.user_id;
  if user_tenant != new.tenant_id then
    raise exception 'reservations.tenant_id (%) must match users.tenant_id (%)',
      new.tenant_id, user_tenant;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger reservations_check_tenant
  before insert or update on reservations
  for each row execute function check_reservation_tenant();

alter table reservations enable row level security;

-- ====================
-- Phase 6.3:最新消息(2026-05-21,線 1 月 3 placeholder 接真實內容)
-- LINE@ 用戶點 Rich Menu 第 2 格「📰 最新消息」時,webhook 撈最近 3 則 published 回覆。
-- 不推送(避免吃 LINE broadcast quota),純公告板模式。
-- ====================
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_tenant_published_idx
  on news(tenant_id, published_at desc nulls last)
  where status = 'published';

create trigger news_updated_at before update on news
  for each row execute function set_updated_at();

alter table news enable row level security;

-- ====================
-- Phase 7.1:tenants.logo_url(2026-05-21)
-- 圓形 profile 照,顯示在 admin sidebar / 公開頁 header / sidebar 切換清單。
-- 客端 react-image-crop 1:1 → canvas 輸出 256×256 jpeg → Supabase Storage(bucket "tenant-assets")
-- ====================
alter table tenants add column if not exists logo_url text;

-- ====================
-- Phase 7.4:會員 ID + 介紹人 ID(2026-05-21,CRM 級別,不含 PV / 業績計算)
-- 學員自填(LIFF /m/member),admin 在客戶詳情頁看到 + 顯示「我介紹進來的人」reverse 查
-- 純 text 對應(不 FK),允許「上線還沒辦會員、下線先辦」這種倒著綁
-- ====================
alter table users add column if not exists member_id text;
alter table users add column if not exists referrer_member_id text;
create index if not exists users_member_id_idx
  on users(tenant_id, member_id)
  where member_id is not null;
create index if not exists users_referrer_member_id_idx
  on users(tenant_id, referrer_member_id)
  where referrer_member_id is not null;

-- ====================
-- Phase 5.2:Variant 重構(對齊 GraceHan products / variants 兩層)
-- Stage A:加 product_variants + order_items / stock_movements 加 variant_id +
--          seed default variants(每個既有 product 1 個 'default' variant)+ backfill
-- Stage B (下 session):admin / LIFF / inventory / orders code refactor 全 ref variant_id
-- Stage C:drop deprecated products.sku/price/cost/stock
--
-- 兼容性:order_items.variant_id 暫 nullable(legacy product_id 仍 work);Stage C 改 not null
-- ====================

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  sku text not null,
  variant_name text not null default 'default',   -- 顯示用 e.g. '黑 M' / '50ml'
  attributes jsonb default '{}'::jsonb,            -- 結構化 e.g. {"color":"黑","size":"M"}
  price_twd int not null check (price_twd >= 0),
  cost_twd int check (cost_twd >= 0),
  stock int not null default 0,
  image_url text,
  scan_id text,                                    -- 條碼(選填)
  status text not null default 'active'
    check (status in ('active', 'inactive', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index product_variants_product_idx on product_variants(product_id);
create index product_variants_tenant_status_idx on product_variants(tenant_id, status);

create trigger product_variants_updated_at before update on product_variants
  for each row execute function set_updated_at();

alter table product_variants enable row level security;

-- seed default variants(每個既有 product 1 個 'default' variant,複製欄位過去)
insert into product_variants (tenant_id, product_id, sku, variant_name, price_twd, cost_twd, stock, image_url, status)
  select tenant_id, id,
         coalesce(sku, 'AUTO-' || substring(id::text, 1, 8)) as sku,
         'default',
         price_twd, cost_twd, stock, image_url, status
    from products
  on conflict (tenant_id, sku) do nothing;

-- order_items 加 variant_id(nullable 暫兼容,Stage C 改 not null)
alter table order_items add column if not exists variant_id uuid references product_variants(id) on delete restrict;
create index if not exists order_items_variant_idx on order_items(variant_id);

-- backfill order_items.variant_id 用 product_id lookup default variant
update order_items oi
  set variant_id = pv.id
  from product_variants pv
  where oi.variant_id is null
    and pv.product_id = oi.product_id
    and pv.variant_name = 'default';

-- stock_movements 加 variant_id(同上 nullable 兼容)
alter table stock_movements add column if not exists variant_id uuid references product_variants(id) on delete restrict;
create index if not exists stock_movements_variant_idx on stock_movements(variant_id);

-- stock_movements 是 append-only(prevent_stock_movement_update trigger 禁 UPDATE),
-- backfill 暫關 trigger 再開
alter table stock_movements disable trigger stock_movements_no_update;

update stock_movements sm
  set variant_id = pv.id
  from product_variants pv
  where sm.variant_id is null
    and pv.product_id = sm.product_id
    and pv.variant_name = 'default';

alter table stock_movements enable trigger stock_movements_no_update;

-- ====================
-- Phase 5.3:每 tenant 自己的訂單 prefix(2026-05-21)
-- 原本 hardcoded 'OW',現在從 tenants.order_prefix 動態查
-- ====================

alter table tenants add column if not exists order_prefix text;
update tenants set order_prefix = 'OW' where slug = 'oilswa' and order_prefix is null;
update tenants set order_prefix = 'CY' where slug = 'cyndi' and order_prefix is null;
alter table tenants alter column order_prefix set not null;
do $$ begin
  alter table tenants add constraint tenants_order_prefix_format
    check (order_prefix ~ '^[A-Z]{2,5}$');
exception when duplicate_object then null;
end $$;

-- 重新定義 trigger function(從 tenant 查 prefix)
create or replace function generate_order_no()
returns trigger as $$
declare
  ym text;
  prefix text;
  cnt int;
begin
  if new.order_no is null or new.order_no = '' then
    ym := to_char(now() at time zone 'Asia/Taipei', 'YYYYMM');

    select order_prefix into prefix from tenants where id = new.tenant_id;
    if prefix is null then
      raise exception 'tenant % missing order_prefix', new.tenant_id;
    end if;

    perform pg_advisory_xact_lock(hashtext(new.tenant_id::text || ym));
    select coalesce(max(substring(order_no from prefix || '-\d{6}-(\d+)$')::int), 0) + 1 into cnt
      from orders
      where tenant_id = new.tenant_id
        and order_no like prefix || '-' || ym || '-%';
    new.order_no := prefix || '-' || ym || '-' || lpad(cnt::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

-- Backfill 既有 OW 訂單為各 tenant 真正的 prefix
-- (oilswa.prefix='OW' 不變;非 OW prefix 的 tenant 訂單會被改名)
update orders o
  set order_no = t.order_prefix || substring(o.order_no from 3)
  from tenants t
  where o.tenant_id = t.id
    and o.order_no like 'OW-%'
    and t.order_prefix != 'OW';
