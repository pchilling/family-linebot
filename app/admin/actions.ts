'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

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

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

// 'YYYY-MM-DDTHH:MM'(datetime-local 輸出)→ ISO timestamptz 含 +08:00
function toIsoTaipei(local: string): string {
  return `${local}:00+08:00`;
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

  await supabaseAdmin.from('classes').insert({
    tenant_id: tIdFromForm(formData),
    region_id,
    name,
    scheduled_at,
    instructor,
    is_paid,
    price_twd,
    duration_min,
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

  await supabaseAdmin
    .from('classes')
    .update({ region_id, name, scheduled_at, instructor, is_paid, price_twd })
    .eq('id', id);
  revalForRoute(formData, 'classes');
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
  if (slug) revalidatePath(`/admin/${slug}/products`);
  revalidatePath('/admin/products'); // legacy
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
  const sku = String(formData.get('sku') || '').trim() || null;
  const name = String(formData.get('name')).trim();
  const description = String(formData.get('description') || '').trim() || null;
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const category = String(formData.get('category') || '').trim() || null;

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
      category,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !product) {
    console.error('[createProduct]', error);
    revalidateProductRoutes(formData);
    return;
  }

  // 同步建 default variant(沿用 product 同 sku;sku 為 null 就 AUTO 補)
  const variantSku = sku || `AUTO-${product.id.slice(0, 8)}`;
  const { error: vErr } = await supabaseAdmin.from('product_variants').insert({
    tenant_id: tenantId,
    product_id: product.id,
    sku: variantSku,
    variant_name: 'default',
    price_twd,
    cost_twd,
    stock,
    image_url,
    status: 'active',
  });
  if (vErr) console.error('[createProduct default variant]', vErr);

  revalidateProductRoutes(formData);
}

// ====================
// Variant CRUD(Phase 5.2 Stage B)
// ====================

export async function createVariant(formData: FormData) {
  const tenantId = tenantIdFromForm(formData);
  const product_id = String(formData.get('product_id'));
  const sku = String(formData.get('sku')).trim();
  const variant_name = String(formData.get('variant_name') || '').trim() || 'default';
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const scan_id = String(formData.get('scan_id') || '').trim() || null;

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

  await supabaseAdmin
    .from('product_variants')
    .update({ sku, variant_name, price_twd, cost_twd, stock, status })
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
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const category = String(formData.get('category') || '').trim() || null;
  const status = String(formData.get('status') || 'active');
  const slug = String(formData.get('tenant_slug') || '').trim();

  await supabaseAdmin
    .from('products')
    .update({ sku, name, description, price_twd, cost_twd, stock, image_url, category, status })
    .eq('id', id);
  revalidateProductRoutes(formData);

  // 存後 redirect 帶 saved 參數讓 page 顯示「✓ 已儲存」banner + 滾到該商品
  if (slug) {
    redirect(`/admin/${slug}/products?saved=${id}#product-${id}`);
  }
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('products').delete().eq('id', id);
  revalidateProductRoutes(formData);
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
  const tracking = String(formData.get('tracking_no') || '').trim() || null;

  await supabaseAdmin
    .from('orders')
    .update({
      status: 'shipped',
      tracking_no: tracking,
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
  const tracking_no = strOrNull(formData.get('tracking_no'));
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
      tracking_no,
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
}
