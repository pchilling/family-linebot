'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { refundLinePayPayment } from '@/lib/linepay';
import { refundEcpayCredit } from '@/lib/ecpay';
import { buildPaymentFlexMessage, lineClient } from '@/lib/line';

const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

// tenant_id 從 formData 取(舊 routes 沒帶就 fallback env)
function tIdFromForm(formData: FormData): string {
  const fromForm = String(formData.get('tenant_id') || '').trim();
  return fromForm || TENANT_ID;
}

// revalidate 新 + 舊 admin path
function revalForRoute(formData: FormData, suffix: string) {
  const slug = String(formData.get('tenant_slug') || '').trim();
  if (slug) revalidatePath(`/admin/${slug}/${suffix}`);
  revalidatePath(`/admin/${suffix}`); // legacy
}

export async function signIn(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/admin/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/admin/classes');
}

/**
 * Email + 密碼 自助註冊(Phase 7.11,2026-05-26)。
 * Supabase Auth Confirm Email 已開 → 送驗證信 → 用戶點 link 才能登入。
 * 點 link 走 /auth/callback → exchange code → /admin → 沒 tenant → /admin/apply。
 */
export async function signUp(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect(`/admin/login?tab=signup&error=${encodeURIComponent('email 與密碼必填')}`);
  }
  if (password.length < 6) {
    redirect(`/admin/login?tab=signup&error=${encodeURIComponent('密碼至少 6 字')}`);
  }

  const h = await (await import('next/headers')).headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/admin/login?tab=signup&error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/admin/login?signup=sent&email=${encodeURIComponent(email)}`);
}

/**
 * Google OAuth 登入(Phase A,2026-05-26)。
 * 跳 Google 同意頁 → callback 到 /auth/callback。
 * redirectTo 必須是絕對網址,且要在 Supabase Auth → URL Configuration 的 Redirect URLs 內。
 */
export async function signInWithGoogle() {
  const supabase = await createSupabaseServerClient();
  const h = await (await import('next/headers')).headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    console.error('[signInWithGoogle]', error);
    redirect(`/admin/login?error=${encodeURIComponent('signin_failed')}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

// 'YYYY-MM-DDTHH:MM'(datetime-local 輸出)→ ISO timestamptz 含 +08:00
function toIsoTaipei(local: string): string {
  return `${local}:00+08:00`;
}

/**
 * 2026-09-08:表單「建立前」就能上傳圖片的通用簽名連結
 * (原本活動要先建立才能傳圖)。folder 白名單防亂塞路徑。
 */
export type AdminUploadUrlResult =
  | { ok: true; path: string; token: string; publicUrl: string }
  | { ok: false; error: string };

export async function createAdminImageUploadUrl(formData: FormData): Promise<AdminUploadUrlResult> {
  const slug = String(formData.get('tenant_slug') || '').trim();
  const folder = String(formData.get('folder') || '').trim();
  const filename = String(formData.get('filename') || '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!['classes'].includes(folder)) return { ok: false, error: '資料夾不合法' };

  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const path = `${tenant.id}/${folder}/${Date.now()}.${safeExt}`;

  const { data, error } = await supabaseAdmin.storage
    .from('tenant-assets')
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[createAdminImageUploadUrl]', error);
    return { ok: false, error: '建立上傳連結失敗' };
  }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  return { ok: true, path: data.path, token: data.token, publicUrl };
}

export async function createClass(formData: FormData) {
  const region_id = String(formData.get('region_id'));
  const name = String(formData.get('name')).trim();
  const scheduled_at = toIsoTaipei(String(formData.get('scheduled_at')));
  const instructor = String(formData.get('instructor') || '').trim() || null;
  const is_paid = formData.get('is_paid') === 'on';
  const price_str = String(formData.get('price_twd') || '').trim();
  const price_twd = is_paid && price_str ? Number(price_str) : null;
  const duration_min = Number(formData.get('duration_min') || 90);
  const cap_str = String(formData.get('capacity') || '').trim();
  const cap_num = cap_str ? Number(cap_str) : NaN;
  const capacity = Number.isFinite(cap_num) && cap_num > 0 ? cap_num : null;
  const description = String(formData.get('description') || '').replace(/^\s+|\s+$/g, '') || null;
  // 2026-09-08:建立時就能帶圖(前端直傳完把 URL 塞 hidden input)
  const image_url = String(formData.get('image_url') || '').trim() || null;

  await supabaseAdmin.from('classes').insert({
    tenant_id: tIdFromForm(formData),
    region_id,
    name,
    scheduled_at,
    instructor,
    is_paid,
    price_twd,
    duration_min,
    capacity,
    description,
    image_url,
    status: 'open',
  });
  revalForRoute(formData, 'classes');
}

export async function updateClass(formData: FormData) {
  const id = String(formData.get('id'));
  const region_id = String(formData.get('region_id'));
  const name = String(formData.get('name')).trim();
  const scheduled_at = toIsoTaipei(String(formData.get('scheduled_at')));
  const instructor = String(formData.get('instructor') || '').trim() || null;
  const is_paid = formData.get('is_paid') === 'on';
  const price_str = String(formData.get('price_twd') || '').trim();
  const price_twd = is_paid && price_str ? Number(price_str) : null;
  const cap_str = String(formData.get('capacity') || '').trim();
  const cap_num = cap_str ? Number(cap_str) : NaN;
  const capacity = Number.isFinite(cap_num) && cap_num > 0 ? cap_num : null;
  const description = String(formData.get('description') || '').replace(/^\s+|\s+$/g, '') || null;
  const slug = String(formData.get('tenant_slug') || '').trim();

  await supabaseAdmin
    .from('classes')
    .update({ region_id, name, scheduled_at, instructor, is_paid, price_twd, capacity, description })
    .eq('id', id);
  revalForRoute(formData, 'classes');

  // 帶 ?saved=<id> redirect 讓 page 顯示「✓ 已儲存」banner + 自動展開該卡
  if (slug) {
    redirect(`/admin/${slug}/classes?saved=${id}`);
  }
}

export async function deleteClass(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('classes').delete().eq('id', id);
  revalForRoute(formData, 'classes');
}

// ====================
// Products CRUD(線 2 月 1)
// ====================

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// tenant_id from formData(舊 routes 沒帶 fallback env)
function tenantIdFromForm(formData: FormData): string {
  const fromForm = String(formData.get('tenant_id') || '').trim();
  return fromForm || TENANT_ID;
}

function revalidateProductRoutes(formData: FormData) {
  const slug = String(formData.get('tenant_slug') || '').trim();
  if (slug) {
    revalidatePath(`/admin/${slug}/products`);
    // 2026-10-20 商品頁改版:編輯頁在 /products/[id],用 layout 一併重新驗證整個子樹
    revalidatePath(`/admin/${slug}/products`, 'layout');
  }
  revalidatePath('/admin/products'); // legacy
}

/**
 * 2026-10-20 商品頁改版:商品相關動作存完要回哪裡。
 * 表單帶 return_to=edit(+ tab)→ 回編輯頁該分頁;沒帶 → 沿用舊的列表頁行為。
 */
function productRedirect(formData: FormData, slug: string, productId: string, err?: string): never {
  const returnTo = String(formData.get('return_to') || '').trim();
  if (returnTo === 'edit') {
    const tab = String(formData.get('tab') || 'basic').trim();
    redirect(
      `/admin/${slug}/products/${productId}?tab=${encodeURIComponent(tab)}&${err ? `err=${err}` : 'saved=1'}`,
    );
  }
  redirect(
    err
      ? `/admin/${slug}/products?err=${err}#product-${productId}`
      : `/admin/${slug}/products?saved=${productId}#product-${productId}`,
  );
}

/**
 * 取 tenant 的 order_prefix(SKU 前綴用)。
 * NOT NULL + 格式 ^[A-Z]{2,5}$,所以一定有值。
 */
async function getTenantPrefix(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('order_prefix')
    .eq('id', tenantId)
    .maybeSingle();
  return ((data as { order_prefix?: string } | null)?.order_prefix ?? 'SKU').toUpperCase();
}

/**
 * 產 product SKU:{order_prefix}-{3 位流水號}
 * 掃既有 SKU 找最大,+1,跳過已被刪 / 不依此 pattern 的舊 SKU。
 */
async function nextProductSku(tenantId: string, prefix: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('sku')
    .eq('tenant_id', tenantId);
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const row of (data ?? []) as { sku: string | null }[]) {
    if (!row.sku) continue;
    const m = row.sku.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * 產 variant SKU:{product_sku}-V{n}
 * 第 1 個 variant(default)直接用 product_sku;追加的從 V2 起跳。
 */
async function nextVariantSku(productId: string, productSku: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('product_variants')
    .select('sku')
    .eq('product_id', productId);
  const rows = (data ?? []) as { sku: string }[];
  if (rows.length === 0) return productSku; // default variant
  const re = new RegExp(`^${productSku}-V(\\d+)$`);
  let max = 1; // default variant 視為 V1
  for (const row of rows) {
    const m = row.sku.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${productSku}-V${max + 1}`;
}

/**
 * 從商品名產 slug:
 * - 全英文 → 純小寫 hyphenated + 6 字隨機尾(避免撞)
 * - 含中文 / 完全沒 ascii → 用 timestamp36 + 隨機 4 字(URL safe)
 */
function generateProductSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const rand = Math.random().toString(36).slice(2, 8);
  if (ascii.length >= 2) {
    return `${ascii.slice(0, 32)}-${rand}`;
  }
  // 中文名 fallback:純隨機 8 字
  return `${Date.now().toString(36)}${rand}`.slice(0, 12);
}

export async function createProduct(formData: FormData) {
  const tenantId = tenantIdFromForm(formData);
  const name = String(formData.get('name')).trim();
  const description = String(formData.get('description') || '').trim() || null;
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  // 2026-10-20:新增 modal 可一次上傳多張圖(media_url 重複欄位),第一張兼作 image_url
  const mediaUrls = formData.getAll('media_url').map(String).map((s) => s.trim()).filter(Boolean);
  const image_url = String(formData.get('image_url') || '').trim() || mediaUrls[0] || null;
  const media = mediaUrls.map((url) => ({ type: 'image' as const, url }));
  const category = String(formData.get('category') || '').trim() || null;
  const badge = String(formData.get('badge') || '').trim() || null;
  const badgeColorRaw = String(formData.get('badge_color') || '').trim();
  const badge_color = /^#[0-9a-fA-F]{6}$/.test(badgeColorRaw) ? badgeColorRaw : null;

  // SKU 系統產:{tenant.order_prefix}-{3 位流水號}
  const prefix = await getTenantPrefix(tenantId);
  const sku = await nextProductSku(tenantId, prefix);

  // 自動產 slug:英文名直接 slugify,中文名 / 混合則用前 8 字 + 隨機尾(避免重複)
  // tenant 內 unique(因為 products.slug 有 unique constraint per tenant)
  const slug = generateProductSlug(name);

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({
      tenant_id: tenantId,
      sku,
      slug,
      name,
      description,
      price_twd,
      cost_twd,
      stock,
      image_url,
      media,
      category,
      badge,
      badge_color,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !product) {
    console.error('[createProduct]', error);
    revalidateProductRoutes(formData);
    return;
  }

  // 同步建 default variant,沿用 product SKU
  const { error: vErr } = await supabaseAdmin.from('product_variants').insert({
    tenant_id: tenantId,
    product_id: product.id,
    sku,
    variant_name: 'default',
    price_twd,
    cost_twd,
    stock,
    image_url,
    status: 'active',
  });
  if (vErr) console.error('[createProduct default variant]', vErr);

  revalidateProductRoutes(formData);

  // 2026-10-20:從新增 modal 來的,直接進該商品的編輯頁補規格與圖片
  const tenantSlug = String(formData.get('tenant_slug') || '').trim();
  if (tenantSlug && String(formData.get('return_to') || '') === 'edit') {
    redirect(`/admin/${tenantSlug}/products/${product.id}?tab=variants&saved=1`);
  }
}

// ====================
// Variant CRUD(Phase 5.2 Stage B)
// ====================

export async function createVariant(formData: FormData) {
  const tenantId = tenantIdFromForm(formData);
  const product_id = String(formData.get('product_id'));
  // SKU 系統產:撈該 product 的 SKU 後追加 -V{n}
  const { data: parent } = await supabaseAdmin
    .from('products')
    .select('sku')
    .eq('id', product_id)
    .maybeSingle();
  const productSku = (parent as { sku?: string | null } | null)?.sku;
  if (!productSku) {
    console.error('[createVariant] product missing sku', product_id);
    revalidateProductRoutes(formData);
    return;
  }
  const sku = await nextVariantSku(product_id, productSku);
  const variant_name = String(formData.get('variant_name') || '').trim() || 'default';
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const scan_id = String(formData.get('scan_id') || '').trim() || null;
  // Phase 16.4:組合品(如 3本組)— 固定價,不參與分階
  const is_bundle = formData.get('is_bundle') === 'on';

  await supabaseAdmin.from('product_variants').insert({
    tenant_id: tenantId,
    product_id,
    sku,
    variant_name,
    price_twd,
    cost_twd,
    stock,
    image_url,
    scan_id,
    is_bundle,
    status: 'active',
  });
  revalidateProductRoutes(formData);
}

export async function updateVariant(formData: FormData) {
  const id = String(formData.get('id'));
  const sku = String(formData.get('sku')).trim();
  const variant_name = String(formData.get('variant_name') || '').trim() || 'default';
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const status = String(formData.get('status') || 'active');
  const slug = String(formData.get('tenant_slug') || '').trim();
  const is_bundle = formData.get('is_bundle') === 'on'; // Phase 16.4

  await supabaseAdmin
    .from('product_variants')
    .update({ sku, variant_name, price_twd, cost_twd, stock, status, is_bundle })
    .eq('id', id);
  revalidateProductRoutes(formData);

  if (slug) {
    redirect(`/admin/${slug}/products?saved=variant_${id}#variant-${id}`);
  }
}

export async function deleteVariant(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('product_variants').delete().eq('id', id);
  revalidateProductRoutes(formData);
}

export async function updateProduct(formData: FormData) {
  const id = String(formData.get('id'));
  const sku = String(formData.get('sku') || '').trim() || null;
  const name = String(formData.get('name')).trim();
  const description = String(formData.get('description') || '').trim() || null;
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  // 2026-10-06:不再寫 products.stock — 真實庫存一律在變體(products.stock 是
  // 無變體時代的舊欄位,後台同時顯示兩個庫存一直造成「庫存有誤」的混淆)
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const category = String(formData.get('category') || '').trim() || null;
  const badge = String(formData.get('badge') || '').trim() || null;
  const badgeColorRaw = String(formData.get('badge_color') || '').trim();
  const badge_color = /^#[0-9a-fA-F]{6}$/.test(badgeColorRaw) ? badgeColorRaw : null;
  const status = String(formData.get('status') || 'active');
  const slug = String(formData.get('tenant_slug') || '').trim();

  await supabaseAdmin
    .from('products')
    .update({ sku, name, description, price_twd, cost_twd, image_url, category, badge, badge_color, status })
    .eq('id', id);
  revalidateProductRoutes(formData);

  // 存後 redirect 帶 saved 參數讓 page 顯示「✓ 已儲存」banner + 滾到該商品
  if (slug) productRedirect(formData, slug, id);
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get('id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  await supabaseAdmin.from('products').delete().eq('id', id);
  revalidateProductRoutes(formData);
  // 從編輯頁刪的話,商品已經不在了,回列表
  if (slug && String(formData.get('return_to') || '') === 'edit') {
    redirect(`/admin/${slug}/products?deleted=1`);
  }
}

// ====================
// 2026-10-20 商品頁改版:列表上直接改庫存 / 上下架、編輯頁一鍵存整組規格
// ====================

/** 列表上的庫存框:離開欄位就存,回 ok 讓前端顯示「已存」 */
export async function setVariantStock(
  tenantSlug: string,
  variantId: string,
  stock: number,
): Promise<{ ok: boolean }> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !variantId) return { ok: false };
  const n = Math.max(0, Math.floor(Number(stock)));
  if (!Number.isFinite(n)) return { ok: false };
  const { error } = await supabaseAdmin
    .from('product_variants')
    .update({ stock: n })
    .eq('id', variantId)
    .eq('tenant_id', tenant.id);
  if (error) {
    console.error('[setVariantStock]', error);
    return { ok: false };
  }
  revalidatePath(`/admin/${tenantSlug}/products`, 'layout');
  revalidatePath(`/${tenantSlug}`);
  return { ok: true };
}

/** 上架開關:關掉 = 暫停(inactive),保留資料、商城不顯示 */
export async function setProductStatus(
  tenantSlug: string,
  productId: string,
  active: boolean,
): Promise<{ ok: boolean }> {
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || !productId) return { ok: false };
  const { error } = await supabaseAdmin
    .from('products')
    .update({ status: active ? 'active' : 'inactive' })
    .eq('id', productId)
    .eq('tenant_id', tenant.id);
  if (error) {
    console.error('[setProductStatus]', error);
    return { ok: false };
  }
  revalidatePath(`/admin/${tenantSlug}/products`, 'layout');
  revalidatePath(`/${tenantSlug}`);
  return { ok: true };
}

/**
 * 編輯頁「規格與庫存」分頁一次存整組:
 * 規格(含順序、新增、刪除、組合品)+ 分階定價。
 * 表單欄位是重複名稱的陣列(v_id / v_name / …),同一個 index 是同一列;
 * v_id 空字串 = 新規格,要產 SKU 再 insert。
 */
export async function saveVariantsBulk(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') || '').trim();
  const tenantId = tenantIdFromForm(formData);
  const productId = String(formData.get('product_id') || '').trim();
  if (!slug || !productId) throw new Error('缺必要參數');

  const ids = formData.getAll('v_id').map(String);
  const names = formData.getAll('v_name').map(String);
  const prices = formData.getAll('v_price').map(String);
  const costs = formData.getAll('v_cost').map(String);
  const stocks = formData.getAll('v_stock').map(String);
  const statuses = formData.getAll('v_status').map(String);
  const bundles = formData.getAll('v_bundle').map(String);
  const vDeleted = formData.getAll('v_deleted').map(String).filter(Boolean);

  if (vDeleted.length > 0) {
    const { error } = await supabaseAdmin
      .from('product_variants')
      .delete()
      .in('id', vDeleted)
      .eq('tenant_id', tenantId)
      .eq('product_id', productId);
    if (error) console.error('[saveVariantsBulk delete]', error);
  }

  const { data: parent } = await supabaseAdmin
    .from('products')
    .select('sku')
    .eq('id', productId)
    .maybeSingle();
  const productSku = (parent as { sku?: string | null } | null)?.sku ?? null;

  for (let i = 0; i < names.length; i++) {
    const row = {
      variant_name: names[i].trim() || 'default',
      price_twd: numOrNull(prices[i]) ?? 0,
      cost_twd: numOrNull(costs[i]),
      stock: numOrNull(stocks[i]) ?? 0,
      status: statuses[i] || 'active',
      is_bundle: bundles[i] === '1',
      sort_order: i, // 畫面上的順序就是顯示順序
    };
    const id = (ids[i] || '').trim();
    if (id) {
      const { error } = await supabaseAdmin
        .from('product_variants')
        .update(row)
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) console.error('[saveVariantsBulk update]', id, error);
    } else {
      if (!productSku) {
        console.error('[saveVariantsBulk] product missing sku,無法新增規格', productId);
        continue;
      }
      const sku = await nextVariantSku(productId, productSku);
      const { error } = await supabaseAdmin
        .from('product_variants')
        .insert({ tenant_id: tenantId, product_id: productId, sku, ...row });
      if (error) console.error('[saveVariantsBulk insert]', error);
    }
  }

  const tIds = formData.getAll('t_id').map(String);
  const tMins = formData.getAll('t_min').map(String);
  const tPrices = formData.getAll('t_price').map(String);
  const tDeleted = formData.getAll('t_deleted').map(String).filter(Boolean);
  if (tDeleted.length > 0) {
    await supabaseAdmin.from('product_price_tiers').delete().in('id', tDeleted).eq('tenant_id', tenantId);
  }
  for (let i = 0; i < tMins.length; i++) {
    const min_qty = Number(tMins[i]);
    const price_twd = Number(tPrices[i]);
    if (!(min_qty >= 2) || !(price_twd >= 0)) continue;
    const id = (tIds[i] || '').trim();
    if (id) {
      await supabaseAdmin.from('product_price_tiers').update({ min_qty, price_twd }).eq('id', id).eq('tenant_id', tenantId);
    } else {
      await supabaseAdmin.from('product_price_tiers').insert({ tenant_id: tenantId, product_id: productId, min_qty, price_twd });
    }
  }

  revalidateProductRoutes(formData);
  revalidatePath(`/${slug}`);
  redirect(`/admin/${slug}/products/${productId}?tab=variants&saved=1`);
}

/**
 * C#8 分類顯示順序(2026-09-08 改版):
 * 原本每按一下 ↑↓ 都 redirect 重算整個商品大頁 → 慢到像沒反應。
 * 改成 client 樂觀排序(畫面立即動),這裡只負責把「完整順序陣列」存起來。
 */
export async function saveCategoryOrder(
  tenantId: string,
  tenantSlug: string,
  order: string[],
): Promise<{ ok: boolean }> {
  if (!Array.isArray(order) || order.some((c) => typeof c !== 'string' || !c.trim())) {
    return { ok: false };
  }
  const clean = order.map((c) => c.trim()).slice(0, 100);

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ category_order: clean })
    .eq('id', tenantId);
  if (error) {
    console.error('[saveCategoryOrder]', error);
    return { ok: false };
  }

  if (tenantSlug) {
    revalidatePath(`/admin/${tenantSlug}/products`);
    revalidatePath(`/${tenantSlug}`);
  }
  return { ok: true };
}

// ====================
// Phase 16.2(2026-09-18):商品手動排序 — 拖曳排序頁寫入
// orderedIds = 某分類內由前到後的商品 id,依序寫 sort_order 0..n
// ====================
export async function saveProductOrder(
  tenantSlug: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { ok: false };
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false };
  const ids = orderedIds.filter((id) => typeof id === 'string' && id).slice(0, 200);

  const results = await Promise.all(
    ids.map((id, i) =>
      supabaseAdmin
        .from('products')
        .update({ sort_order: i })
        .eq('id', id)
        .eq('tenant_id', tenant.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('[saveProductOrder]', failed.error);
    return { ok: false };
  }

  revalidatePath(`/${tenantSlug}`);
  revalidatePath(`/admin/${tenantSlug}/products`);
  return { ok: true };
}

// ====================
// Phase 19(2026-10-19):變體顯示順序 — 上移 / 下移一格
// 同商品的 active 變體依現況重排後交換相鄰兩個,再把整組寫回 0..n。
// 整組重寫是為了把舊資料的 null 一次補成實際數字,之後排序才穩定。
// ====================
export async function saveVariantOrder(
  tenantSlug: string,
  productId: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  if (!tenantSlug || !productId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false };
  }
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return { ok: false };
  const ids = orderedIds.filter((id) => typeof id === 'string' && id).slice(0, 100);

  // 整組寫回 0..n:順便把舊資料殘留的 null 補成實際數字,之後排序才穩定
  const results = await Promise.all(
    ids.map((id, i) =>
      supabaseAdmin
        .from('product_variants')
        .update({ sort_order: i })
        .eq('id', id)
        .eq('product_id', productId)
        .eq('tenant_id', tenant.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('[saveVariantOrder]', failed.error);
    return { ok: false };
  }

  // 只重新驗證前台(後台畫面已經在 client 端換好位置了,不需要整頁重載)
  revalidatePath(`/${tenantSlug}`);
  return { ok: true };
}

// ====================
// Phase 9.5(2026-06-02):商品分階定價 CRUD
// ====================

export async function createPriceTier(formData: FormData) {
  const tenantId = tenantIdFromForm(formData);
  const product_id = String(formData.get('product_id'));
  const min_qty = Number(formData.get('min_qty') || 0);
  const price_twd = Number(formData.get('price_twd') || 0);

  if (min_qty < 2 || price_twd < 0) {
    revalidateProductRoutes(formData);
    return;
  }

  await supabaseAdmin.from('product_price_tiers').insert({
    tenant_id: tenantId,
    product_id,
    min_qty,
    price_twd,
  });
  revalidateProductRoutes(formData);
}

export async function updatePriceTier(formData: FormData) {
  const id = String(formData.get('id'));
  const min_qty = Number(formData.get('min_qty') || 0);
  const price_twd = Number(formData.get('price_twd') || 0);

  if (min_qty < 2 || price_twd < 0) {
    revalidateProductRoutes(formData);
    return;
  }

  await supabaseAdmin
    .from('product_price_tiers')
    .update({ min_qty, price_twd })
    .eq('id', id);
  revalidateProductRoutes(formData);
}

// ====================
// Phase 9.9(2026-06-03):商品限時優惠
// ====================

/**
 * 設特價 + 起 / 迄。空字串清空(取消優惠)。
 * datetime-local format 'YYYY-MM-DDTHH:MM' 加 +08:00 → ISO timestamptz
 */
export async function updateProductSale(formData: FormData) {
  const id = String(formData.get('product_id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const pctStr = String(formData.get('sale_discount_pct') || '').trim();
  const startStr = String(formData.get('sale_start_at') || '').trim();
  const endStr = String(formData.get('sale_end_at') || '').trim();

  let sale_discount_pct: number | null = null;
  if (pctStr) {
    const n = Number(pctStr);
    if (Number.isFinite(n) && n >= 1 && n <= 99) sale_discount_pct = Math.round(n);
  }
  const sale_start_at = startStr ? toIsoTaipei(startStr) : null;
  const sale_end_at = endStr ? toIsoTaipei(endStr) : null;

  // 2026-09-08:錯誤不再靜默(原本失敗也照跳「已儲存」,用戶以為存好了)
  const { error } = await supabaseAdmin
    .from('products')
    .update({ sale_discount_pct, sale_start_at, sale_end_at })
    .eq('id', id);
  revalidateProductRoutes(formData);
  if (error) {
    console.error('[updateProductSale]', error);
    if (slug) productRedirect(formData, slug, id, 'sale');
    return;
  }
  if (slug) productRedirect(formData, slug, id);
}

export async function deletePriceTier(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('product_price_tiers').delete().eq('id', id);
  revalidateProductRoutes(formData);
}

// ====================
// Phase 12.1(2026-06-04):分享卡橫向焦點
// ====================

/**
 * 設 share_focus_x(0-100,預設 50 = 中)。
 * OG 卡 3:4 → 9:16 兩側裁切時,讓使用者決定焦點偏左 / 中 / 右。
 */
export async function updateShareFocus(formData: FormData) {
  const id = String(formData.get('product_id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const raw = Number(formData.get('share_focus_x'));
  const focus = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 50;

  await supabaseAdmin
    .from('products')
    .update({ share_focus_x: focus })
    .eq('id', id);
  revalidateProductRoutes(formData);
  if (slug) productRedirect(formData, slug, id);
}

// ====================
// Phase 9.6/9.7(2026-06-02):商品多媒體 — image + video
// ====================

type MediaItem = { type: 'image' | 'video'; url: string };

async function getProductMedia(productId: string): Promise<MediaItem[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('media')
    .eq('id', productId)
    .maybeSingle();
  const m = (data as { media?: MediaItem[] | null } | null)?.media;
  return Array.isArray(m) ? m : [];
}

async function setProductMedia(productId: string, media: MediaItem[]) {
  await supabaseAdmin.from('products').update({ media }).eq('id', productId);
}

/**
 * Media 動作後 redirect 回 products 頁,?saved=<id>#product-<id> 讓 details 保持展開 + 滾到該商品。
 */
function mediaRedirect(formData: FormData, slug: string, productId: string) {
  if (slug) productRedirect(formData, slug, productId);
}

/**
 * 追加 image / video URL 到 product.media 陣列尾端
 */
export async function addProductMedia(formData: FormData): Promise<void> {
  const product_id = String(formData.get('product_id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const type = String(formData.get('type'));
  const url = String(formData.get('url') ?? '').trim();
  if (!url || (type !== 'image' && type !== 'video')) {
    revalidateProductRoutes(formData);
    mediaRedirect(formData, slug, product_id);
    return;
  }
  const current = await getProductMedia(product_id);
  await setProductMedia(product_id, [...current, { type, url }]);
  revalidateProductRoutes(formData);
  mediaRedirect(formData, slug, product_id);
}

export async function removeProductMedia(formData: FormData): Promise<void> {
  const product_id = String(formData.get('product_id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const index = Number(formData.get('index'));
  if (!Number.isFinite(index)) {
    revalidateProductRoutes(formData);
    mediaRedirect(formData, slug, product_id);
    return;
  }
  const current = await getProductMedia(product_id);
  const next = current.filter((_, i) => i !== index);
  await setProductMedia(product_id, next);
  revalidateProductRoutes(formData);
  mediaRedirect(formData, slug, product_id);
}

export async function reorderProductMedia(formData: FormData): Promise<void> {
  const product_id = String(formData.get('product_id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const index = Number(formData.get('index'));
  const direction = String(formData.get('direction')); // 'up' | 'down'
  const current = await getProductMedia(product_id);
  if (!Number.isFinite(index) || index < 0 || index >= current.length) {
    revalidateProductRoutes(formData);
    mediaRedirect(formData, slug, product_id);
    return;
  }
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (targetIdx < 0 || targetIdx >= current.length) {
    revalidateProductRoutes(formData);
    mediaRedirect(formData, slug, product_id);
    return;
  }
  const next = [...current];
  [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
  await setProductMedia(product_id, next);
  revalidateProductRoutes(formData);
  mediaRedirect(formData, slug, product_id);
}

// ====================
// 對帳:一鍵標已付款(2026-05-22)
// 設 status='paid' + payment_status='paid' + payment_last5
// paid_at 由 trigger handle_order_status_change 自動填
// ====================
export async function markOrderPaid(formData: FormData) {
  const id = String(formData.get('id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const last5 = String(formData.get('payment_last5') || '').trim() || null;
  const method = String(formData.get('payment_method') || 'bank').trim() || 'bank';

  // Try with payment_last5 first; if column missing(SQL 沒跑)→ retry without
  const fullPayload: Record<string, unknown> = {
    status: 'paid',
    payment_status: 'paid',
    payment_method: method,
  };
  if (last5) fullPayload.payment_last5 = last5;

  let { error } = await supabaseAdmin
    .from('orders')
    .update(fullPayload)
    .eq('id', id);

  if (error && last5) {
    // 可能 payment_last5 column 還沒建,retry without
    delete fullPayload.payment_last5;
    ({ error } = await supabaseAdmin
      .from('orders')
      .update(fullPayload)
      .eq('id', id));
    if (!error) {
      console.warn('[markOrderPaid] payment_last5 column not in DB, saved without');
    }
  }

  if (error) {
    console.error('[markOrderPaid]', error);
  }

  if (slug) {
    revalidatePath(`/admin/${slug}/orders/${id}`);
    revalidatePath(`/admin/${slug}/orders`);
    revalidatePath(`/admin/${slug}`);
    // return_to=list → 留在訂單列表(從 inline button 來);否則跳詳情頁(從詳情按來)
    const returnTo = String(formData.get('return_to') || '').trim();
    if (returnTo === 'list') {
      redirect(`/admin/${slug}/orders?saved=${id}`);
    }
    redirect(`/admin/${slug}/orders/${id}?saved=paid`);
  }
}

// 一鍵標已出貨(2026-05-22)
export async function markOrderShipped(formData: FormData) {
  const id = String(formData.get('id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  await supabaseAdmin
    .from('orders')
    .update({
      status: 'shipped',
    })
    .eq('id', id);

  if (slug) {
    revalidatePath(`/admin/${slug}/orders/${id}`);
    revalidatePath(`/admin/${slug}/orders`);
    revalidatePath(`/admin/${slug}`);
    const returnTo = String(formData.get('return_to') || '').trim();
    if (returnTo === 'list') {
      redirect(`/admin/${slug}/orders?saved=${id}`);
    }
    redirect(`/admin/${slug}/orders/${id}?saved=shipped`);
  }
}

// ====================
// LINE Pay 退款(2026-10-15)— 半自動:要在退款卡填金額 + 二次確認才會送出
// 全額退 → 順便把訂單標已退款(trigger 自動退庫存);部分退 → 只退錢,狀態不動。
// ⚠️ 退款不可逆,先退錢成功才改訂單。
// ====================
export async function refundLinePayOrder(formData: FormData) {
  const id = String(formData.get('id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const amountRaw = Number(formData.get('refund_amount'));

  const back = (saved: string) => {
    if (!slug) return;
    revalidatePath(`/admin/${slug}/orders/${id}`);
    revalidatePath(`/admin/${slug}/orders`);
    redirect(`/admin/${slug}/orders/${id}?saved=${saved}`);
  };

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, total_twd, shipping_fee_twd, payment_status, payment_method, linepay_transaction_id, linepay_refunded_twd, users(line_user_id)',
    )
    .eq('id', id)
    .maybeSingle();
  const order = (data ?? null) as unknown as {
    id: string;
    order_no: string;
    total_twd: number;
    shipping_fee_twd: number | null;
    payment_status: string;
    payment_method: string | null;
    linepay_transaction_id: string | null;
    linepay_refunded_twd: number | null;
    users: { line_user_id: string | null } | null;
  } | null;

  if (!order || order.payment_method !== 'line_pay' || !order.linepay_transaction_id) {
    console.error('[refundLinePayOrder] 不是可退款的 LINE Pay 訂單', id);
    return back('refund_failed');
  }

  const grandTotal = order.total_twd + (order.shipping_fee_twd ?? 0);
  const already = order.linepay_refunded_twd ?? 0;
  const remaining = grandTotal - already;
  if (remaining <= 0) {
    console.error('[refundLinePayOrder] 已無可退金額', order.order_no);
    return back('refund_failed');
  }

  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0 ? Math.floor(amountRaw) : remaining;
  if (amount > remaining) {
    console.error('[refundLinePayOrder] 退款金額超過可退金額', order.order_no, amount, remaining);
    return back('refund_over');
  }

  const result = await refundLinePayPayment(order.linepay_transaction_id, amount);
  if (!result.ok) return back('refund_failed');

  const refundedTotal = already + amount;
  const isFullRefund = refundedTotal >= grandTotal;
  const payload: Record<string, unknown> = { linepay_refunded_twd: refundedTotal };
  if (isFullRefund) {
    // status 改 refunded 會觸發 handle_order_cancel 自動退庫存
    payload.status = 'refunded';
    payload.payment_status = 'refunded';
  }
  const { error: updErr } = await supabaseAdmin.from('orders').update(payload).eq('id', id);
  if (updErr) {
    // 錢已經退了,這裡失敗要人工補標,務必留 log
    console.error('[refundLinePayOrder] 已退款但更新訂單失敗', order.order_no, amount, updErr);
  }

  const lineUserId = order.users?.line_user_id;
  if (lineUserId) {
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
      const tenant = await getTenantBySlug(slug);
      await lineClient.pushMessage({
        to: lineUserId,
        messages: [
          buildPaymentFlexMessage({
            kind: 'refunded',
            orderNo: order.order_no,
            amountTwd: amount,
            remainingTwd: grandTotal - refundedTotal,
            orderUrl: `${baseUrl}/${tenant?.slug ?? slug}/order/${order.order_no}`,
          }),
        ],
      });
    } catch (e) {
      console.warn('[refundLinePayOrder] push 失敗', e);
    }
  }

  return back('refunded');
}

// ====================
// 綠界信用卡退款(2026-10-22)— 跟 LINE Pay 同一套:填金額 + 二次確認。
// 全額退 → 順便把訂單標已退款(trigger 自動退庫存);部分退 → 只退錢,狀態不動。
// 今天剛刷還沒請款的單會走「放棄授權」(免手續費),已請款的走「退刷」(扣 NT$1 處理費)。
// ⚠️ 退款不可逆,先退錢成功才改訂單。失敗原因用 msg 帶回頁面顯示。
// ====================
export async function refundEcpayOrder(formData: FormData) {
  const id = String(formData.get('id'));
  const slug = String(formData.get('tenant_slug') || '').trim();
  const amountRaw = Number(formData.get('refund_amount'));

  const back = (saved: string, msg?: string) => {
    if (!slug) return;
    revalidatePath(`/admin/${slug}/orders/${id}`);
    revalidatePath(`/admin/${slug}/orders`);
    redirect(`/admin/${slug}/orders/${id}?saved=${saved}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`);
  };

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, order_no, total_twd, shipping_fee_twd, payment_status, payment_method, ecpay_merchant_trade_no, ecpay_trade_no, ecpay_refunded_twd, users(line_user_id)',
    )
    .eq('id', id)
    .maybeSingle();
  const order = (data ?? null) as unknown as {
    id: string;
    order_no: string;
    total_twd: number;
    shipping_fee_twd: number | null;
    payment_status: string;
    payment_method: string | null;
    ecpay_merchant_trade_no: string | null;
    ecpay_trade_no: string | null;
    ecpay_refunded_twd: number | null;
    users: { line_user_id: string | null } | null;
  } | null;

  if (
    !order ||
    order.payment_method !== 'ecpay_credit' ||
    !order.ecpay_merchant_trade_no ||
    !order.ecpay_trade_no ||
    order.payment_status !== 'paid'
  ) {
    console.error('[refundEcpayOrder] 不是可退款的綠界信用卡訂單', id);
    return back('refund_failed', '這筆不是已收款的綠界信用卡訂單');
  }

  const grandTotal = order.total_twd + (order.shipping_fee_twd ?? 0);
  const already = order.ecpay_refunded_twd ?? 0;
  const remaining = grandTotal - already;
  if (remaining <= 0) {
    console.error('[refundEcpayOrder] 已無可退金額', order.order_no);
    return back('refund_failed', '已無可退金額');
  }

  const amount =
    Number.isFinite(amountRaw) && amountRaw > 0 ? Math.floor(amountRaw) : remaining;
  if (amount > remaining) {
    console.error('[refundEcpayOrder] 退款金額超過可退金額', order.order_no, amount, remaining);
    return back('refund_over');
  }

  // 整筆沒退過而且這次退全額,才有資格走「放棄授權」免手續費
  const result = await refundEcpayCredit({
    merchantTradeNo: order.ecpay_merchant_trade_no,
    tradeNo: order.ecpay_trade_no,
    amount,
    fullRefund: already === 0 && amount === grandTotal,
  });
  if (!result.ok) {
    return back(result.code === 'closing_window' ? 'refund_closing' : 'refund_failed', result.message);
  }

  const refundedTotal = already + amount;
  const isFullRefund = refundedTotal >= grandTotal;
  const payload: Record<string, unknown> = { ecpay_refunded_twd: refundedTotal };
  if (isFullRefund) {
    // status 改 refunded 會觸發 handle_order_cancel 自動退庫存
    payload.status = 'refunded';
    payload.payment_status = 'refunded';
  }
  const { error: updErr } = await supabaseAdmin.from('orders').update(payload).eq('id', id);
  if (updErr) {
    // 錢已經退了,這裡失敗要人工補標,務必留 log
    console.error('[refundEcpayOrder] 已退款但更新訂單失敗', order.order_no, amount, updErr);
  }

  const lineUserId = order.users?.line_user_id;
  if (lineUserId) {
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_PROD_URL ?? 'https://stall.neop.tw').replace(/\/+$/, '');
      const tenant = await getTenantBySlug(slug);
      await lineClient.pushMessage({
        to: lineUserId,
        messages: [
          buildPaymentFlexMessage({
            kind: 'refunded',
            orderNo: order.order_no,
            amountTwd: amount,
            remainingTwd: grandTotal - refundedTotal,
            orderUrl: `${baseUrl}/${tenant?.slug ?? slug}/order/${order.order_no}`,
            method: '信用卡',
            refundNote:
              result.action === 'R'
                ? '款項將退回您刷卡的信用卡,發卡銀行約需 14–21 個工作天入帳,可能會落在下一期帳單。'
                : '這筆刷卡已取消授權,不會出現在您的信用卡帳單;若已看到暫時的佔額,銀行會在幾個工作天內釋放。',
          }),
        ],
      });
    } catch (e) {
      console.warn('[refundEcpayOrder] push 失敗', e);
    }
  }

  return back(result.action === 'R' ? 'refunded' : 'refunded_void');
}

// ====================
// Orders 改狀態(線 2 月 1)
// 改 status='cancelled' / 'refunded' 會觸發 handle_order_cancel trigger 自動退庫存
// ====================

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export async function updateOrder(formData: FormData) {
  const id = String(formData.get('id'));
  const status = String(formData.get('status') || 'open');
  const payment_status = String(formData.get('payment_status') || 'pending');
  const payment_method = strOrNull(formData.get('payment_method'));
  const shipping_recipient = strOrNull(formData.get('shipping_recipient'));
  const shipping_phone = strOrNull(formData.get('shipping_phone'));
  const shipping_address = strOrNull(formData.get('shipping_address'));
  const note = strOrNull(formData.get('note'));

  await supabaseAdmin
    .from('orders')
    .update({
      status,
      payment_status,
      payment_method,
      shipping_recipient,
      shipping_phone,
      shipping_address,
      note,
    })
    .eq('id', id);
  const slug = String(formData.get('tenant_slug') || '').trim();
  if (slug) {
    revalidatePath(`/admin/${slug}/orders/${id}`);
    revalidatePath(`/admin/${slug}/orders`);
  }
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath('/admin/orders');
  if (slug) {
    redirect(`/admin/${slug}/orders/${id}?saved=edit`);
  }
}
