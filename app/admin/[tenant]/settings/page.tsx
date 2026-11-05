import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { siteOrigin } from '@/lib/return-to';
import { BasicForm } from './settings-form';

/**
 * 設定 → 基本資料(2026-11-01 改版):店名、簡介、公開網址、對外聯絡資訊。
 * 其他分頁:look / payment / shipping / promo / about,外框在 layout.tsx。
 */
export default async function BasicSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, description, contact_info, disclaimer')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) notFound();
  const t = data as { slug: string; name: string; description: string | null; contact_info: string | null; disclaimer: string | null };
  const origin = siteOrigin();

  return (
    <BasicForm
      tenantSlug={t.slug}
      publicHost={origin.replace(/^https?:\/\//, '')}
      publicUrl={`${origin}/${t.slug}`}
      defaults={{ name: t.name, description: t.description ?? '', contact_info: t.contact_info ?? '', disclaimer: t.disclaimer ?? '' }}
    />
  );
}
