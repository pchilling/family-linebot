import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { ShippingRules, type ShippingOption } from '../shipping-rules';

/**
 * 設定 → 配送(2026-11-01 新增):運費規則後台。
 * 以前 tenants.shipping_rules 只能請 NEOP 改 SQL,現在攤主自己編。
 */
export default async function ShippingSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin.from('tenants').select('shipping_rules').eq('slug', slug).maybeSingle();
  if (!data) notFound();
  const rules = (data as { shipping_rules?: { options?: ShippingOption[] } | null }).shipping_rules;
  const options = Array.isArray(rules?.options) ? rules.options : [];

  return <ShippingRules tenantSlug={slug} initial={options} />;
}
