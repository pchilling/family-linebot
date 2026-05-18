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
create or replace function generate_order_no()
returns trigger as $$
declare
  ym text;
  cnt int;
begin
  if new.order_no is null or new.order_no = '' then
    ym := to_char(now() at time zone 'Asia/Taipei', 'YYYYMM');
    select count(*) + 1 into cnt
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

create trigger orders_set_timestamps before update on orders
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
  product_id uuid not null references products(id) on delete cascade,
  qty_delta int not null,                 -- 正 = 進貨;負 = 出貨 / 損耗
  reason text not null
    check (reason in ('order', 'order_cancel', 'restock', 'damage', 'manual_adjust', 'inventory_count')),
  reference_id uuid,                      -- 例 order_id(如 reason='order')
  note text,
  created_at timestamptz not null default now()
);

create index stock_movements_product_idx on stock_movements(product_id, created_at desc);
create index stock_movements_tenant_idx on stock_movements(tenant_id, created_at desc);

-- stock_movements insert / delete → 同步 products.stock
create or replace function update_product_stock()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update products set stock = stock + new.qty_delta where id = new.product_id;
  elsif tg_op = 'DELETE' then
    update products set stock = stock - old.qty_delta where id = old.product_id;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger stock_movements_sync_stock
  after insert or delete on stock_movements
  for each row execute function update_product_stock();

-- order_items insert → 自動寫 stock_movements(qty_delta = -qty)
create or replace function order_item_to_stock_movement()
returns trigger as $$
begin
  insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id)
    values (new.tenant_id, new.product_id, -new.qty, 'order', new.order_id);
  return null;
end;
$$ language plpgsql;

create trigger order_items_stock_out
  after insert on order_items
  for each row execute function order_item_to_stock_movement();

-- order_items delete → 反向加回 stock
create or replace function order_item_reverse_stock_movement()
returns trigger as $$
begin
  insert into stock_movements (tenant_id, product_id, qty_delta, reason, reference_id, note)
    values (old.tenant_id, old.product_id, old.qty, 'order_cancel', old.order_id, 'order_item deleted');
  return null;
end;
$$ language plpgsql;

create trigger order_items_stock_reverse
  after delete on order_items
  for each row execute function order_item_reverse_stock_movement();

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
