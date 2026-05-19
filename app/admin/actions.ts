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

export async function createProduct(formData: FormData) {
  const sku = String(formData.get('sku') || '').trim() || null;
  const name = String(formData.get('name')).trim();
  const description = String(formData.get('description') || '').trim() || null;
  const price_twd = numOrNull(formData.get('price_twd')) ?? 0;
  const cost_twd = numOrNull(formData.get('cost_twd'));
  const stock = numOrNull(formData.get('stock')) ?? 0;
  const image_url = String(formData.get('image_url') || '').trim() || null;
  const category = String(formData.get('category') || '').trim() || null;

  await supabaseAdmin.from('products').insert({
    tenant_id: tenantIdFromForm(formData),
    sku,
    name,
    description,
    price_twd,
    cost_twd,
    stock,
    image_url,
    category,
    status: 'active',
  });
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

  await supabaseAdmin
    .from('products')
    .update({ sku, name, description, price_twd, cost_twd, stock, image_url, category, status })
    .eq('id', id);
  revalidateProductRoutes(formData);
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('products').delete().eq('id', id);
  revalidateProductRoutes(formData);
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
