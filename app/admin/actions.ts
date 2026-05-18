'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';

const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

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
    tenant_id: TENANT_ID,
    region_id,
    name,
    scheduled_at,
    instructor,
    is_paid,
    price_twd,
    duration_min,
    status: 'open',
  });
  revalidatePath('/admin/classes');
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
  revalidatePath('/admin/classes');
}

export async function deleteClass(formData: FormData) {
  const id = String(formData.get('id'));
  await supabaseAdmin.from('classes').delete().eq('id', id);
  revalidatePath('/admin/classes');
}
