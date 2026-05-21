import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-only Supabase client(service_role,跳過 RLS)
 * 只在 server side(API route / server action / script)用,絕對不能放 browser
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Tenant = {
  id: string;
  name: string;
  line_channel_id: string | null;
  line_bot_user_id: string | null;
  line_channel_secret: string | null;
  line_channel_access_token: string | null;
  rich_menu_id: string | null;
};

export type User = {
  id: string;
  tenant_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: 'active' | 'blocked' | 'left';
};

export type TenantBySlug = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  order_prefix: string;
  features: Record<string, unknown> | null;
};

export async function getTenantBySlug(slug: string): Promise<TenantBySlug | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, plan, order_prefix, features')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return null;
  return (data as TenantBySlug | null) ?? null;
}

/**
 * 簡化的 feature flag 查詢:tenant.features.{key} === true 才回 true。
 * features 結構:{"activities": true, "line_bot": true, "liff": true} 之類
 */
export function hasFeature(tenant: TenantBySlug | null | undefined, key: string): boolean {
  if (!tenant?.features) return false;
  return (tenant.features as Record<string, unknown>)[key] === true;
}

export type TenantListItem = {
  slug: string;
  name: string;
  plan: string;
  order_prefix: string;
};

/**
 * Admin nav 用:列所有 active tenant(切換用)。
 * @deprecated 用 getUserAllowedTenants 取代,避免每個登入者都看到全部 tenant
 */
export async function getAllActiveTenants(): Promise<TenantListItem[]> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, plan, order_prefix')
    .eq('status', 'active')
    .order('name');
  if (error) {
    console.error('[getAllActiveTenants]', error);
    return [];
  }
  return (data ?? []) as TenantListItem[];
}

export type AllowedTenant = TenantListItem & { role: string };

/**
 * 依 Supabase Auth email 找出該 user 在 platform_users 對應的 tenant_members,
 * 回傳該 user 可以管理的 tenants 列表。
 *
 * Mapping:auth.users.email ↔ platform_users.email ↔ tenant_members
 *
 * email 為 null / 沒對應 platform_users / 無 tenant_members → 回 []
 */
export async function getUserAllowedTenants(
  authEmail: string | null | undefined,
): Promise<AllowedTenant[]> {
  if (!authEmail) return [];

  const { data, error } = await supabaseAdmin
    .from('platform_users')
    .select(
      'id, tenant_members(role, tenants(slug, name, plan, order_prefix, status))',
    )
    .eq('email', authEmail)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[getUserAllowedTenants]', error);
    return [];
  }

  type Row = {
    id: string;
    tenant_members: {
      role: string;
      tenants: {
        slug: string;
        name: string;
        plan: string;
        order_prefix: string;
        status: string;
      } | null;
    }[];
  };
  const row = data as unknown as Row;

  return (row.tenant_members ?? [])
    .filter((m) => m.tenants && m.tenants.status === 'active')
    .map((m) => ({
      slug: m.tenants!.slug,
      name: m.tenants!.name,
      plan: m.tenants!.plan,
      order_prefix: m.tenants!.order_prefix,
      role: m.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 判斷該 user 是否有此 tenant 的存取權。
 */
export async function userHasTenantAccess(
  authEmail: string | null | undefined,
  tenantSlug: string,
): Promise<boolean> {
  const allowed = await getUserAllowedTenants(authEmail);
  return allowed.some((t) => t.slug === tenantSlug);
}

export async function getTenantByBotUserId(botUserId: string): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('line_bot_user_id', botUserId)
    .single();
  if (error) return null;
  return data as Tenant;
}

export async function upsertUser(params: {
  tenantId: string;
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  status?: 'active' | 'blocked' | 'left';
}): Promise<string | null> {
  // update-first pattern:null 的 displayName / pictureUrl 不會 overwrite existing
  const updateData: Record<string, unknown> = {
    status: params.status ?? 'active',
  };
  if (params.displayName) updateData.display_name = params.displayName;
  if (params.pictureUrl) updateData.picture_url = params.pictureUrl;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('tenant_id', params.tenantId)
    .eq('line_user_id', params.lineUserId)
    .select('id');
  if (upErr) {
    console.error('[upsertUser update]', upErr);
    return null;
  }
  if (updated && updated.length > 0) {
    return (updated[0] as { id: string }).id;
  }

  // 沒既有 row → insert(follow event 第一次來會走這條)
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('users')
    .insert({
      tenant_id: params.tenantId,
      line_user_id: params.lineUserId,
      display_name: params.displayName ?? null,
      picture_url: params.pictureUrl ?? null,
      status: params.status ?? 'active',
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('[upsertUser insert]', insErr);
    return null;
  }
  return (inserted as { id: string }).id;
}

export type VariantRow = {
  id: string;
  product_id: string;
  tenant_id: string;
  sku: string;
  variant_name: string;
  attributes: Record<string, unknown> | null;
  price_twd: number;
  cost_twd: number | null;
  stock: number;
  image_url: string | null;
  scan_id: string | null;
  status: string;
};

export type ClassRow = {
  id: string;
  tenant_id: string;
  region_id: string;
  regions: { name: string } | null;     // joined from regions table
  name: string;
  instructor: string | null;
  scheduled_at: string;
  duration_min: number | null;
  capacity: number | null;
  is_paid: boolean;
  price_twd: number | null;
  signup_url: string | null;
  description: string | null;
  status: string;
};

/**
 * 取本月開課的所有 class(以台灣時區為準)
 * Join regions 拿地點 name,排除 cancelled,依 scheduled_at 排序
 */
export async function getClassesForCurrentMonth(tenantId: string): Promise<ClassRow[]> {
  const now = new Date();
  // Asia/Taipei 月初 / 月末 — Vercel server runs UTC,計算用 UTC offset
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffsetMs);
  const monthStart = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), 1) - twOffsetMs).toISOString();
  const monthEnd = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth() + 1, 1) - twOffsetMs).toISOString();

  // 只列未來 + 今天(scheduled_at >= now),過去場次過濾掉
  const nowIso = now.toISOString();
  const effectiveStart = nowIso > monthStart ? nowIso : monthStart;

  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('*, regions(name)')
    .eq('tenant_id', tenantId)
    .gte('scheduled_at', effectiveStart)
    .lt('scheduled_at', monthEnd)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });
  if (error) {
    console.error('[getClassesForCurrentMonth]', error);
    return [];
  }
  return (data ?? []) as ClassRow[];
}

export async function logMessage(params: {
  tenantId: string;
  userId: string | null;
  direction: 'inbound' | 'outbound';
  eventType?: string;
  messageType?: string;
  content?: unknown;
  rawEvent?: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('messages').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    direction: params.direction,
    event_type: params.eventType ?? null,
    message_type: params.messageType ?? null,
    content: params.content ?? null,
    raw_event: params.rawEvent ?? null,
  });
  if (error) console.error('[logMessage]', error);
}

// ====================
// Phase 4-Gamma 公開網站(Gamma.1)
// ====================

export type TenantPublic = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  description: string | null;
  brand_color: string | null;
  og_image_url: string | null;
};

/**
 * 公開頁面用:依 slug 拿 tenant(僅 status='active'),含 brand / SEO 欄位。
 * 跟 getTenantBySlug 分開,避免動到既有 admin 路由的 type。
 */
export async function getTenantPublic(slug: string): Promise<TenantPublic | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, plan, description, brand_color, og_image_url, status')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  if ((data as { status?: string }).status && (data as { status?: string }).status !== 'active') return null;
  const { status: _status, ...rest } = data as TenantPublic & { status?: string };
  return rest as TenantPublic;
}

export type ProductPublic = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  min_price_twd: number; // 該 product 所有 active variant 的最低價(展示用)
};

/**
 * 列出某 tenant 所有 active product,順便算出每個 product 的 variant 最低價。
 * 沒 active variant 的 product → min_price_twd = 0(在 UI 上 hide 價格)。
 */
export async function getActiveProducts(tenantId: string): Promise<ProductPublic[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, slug, name, description, image_url, category, product_variants(price_twd, status)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[getActiveProducts]', error);
    return [];
  }
  type Row = {
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    image_url: string | null;
    category: string | null;
    product_variants: { price_twd: number; status: string }[] | null;
  };
  return (data as Row[] | null ?? []).map((p) => {
    const active = (p.product_variants ?? []).filter((v) => v.status === 'active');
    const min = active.length > 0 ? Math.min(...active.map((v) => v.price_twd)) : 0;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      image_url: p.image_url,
      category: p.category,
      min_price_twd: min,
    };
  });
}

// ====================
// Phase 4-Gamma(Gamma.2):商品詳情頁
// ====================

export type VariantPublic = {
  id: string;
  sku: string;
  variant_name: string;
  attributes: Record<string, unknown> | null;
  price_twd: number;
  stock: number;
  image_url: string | null;
  status: string;
};

export type ProductDetail = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  variants: VariantPublic[]; // 只含 active variants
};

/**
 * 拿 tenant 內某個 product(by slug),含 active variants。
 * 找不到 / inactive / 跨 tenant → null。
 */
export async function getProductBySlug(
  tenantId: string,
  productSlug: string,
): Promise<ProductDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(
      'id, slug, name, description, image_url, category, product_variants(id, sku, variant_name, attributes, price_twd, stock, image_url, status)',
    )
    .eq('tenant_id', tenantId)
    .eq('slug', productSlug)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  type Row = {
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    image_url: string | null;
    category: string | null;
    product_variants: VariantPublic[] | null;
  };
  const row = data as Row;
  const variants = (row.product_variants ?? []).filter((v) => v.status === 'active');
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    category: row.category,
    variants,
  };
}
