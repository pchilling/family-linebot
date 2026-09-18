import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { SortBoard, type SortGroup } from './sort-board';

/**
 * 商品拖曳排序頁(Phase 16.2,2026-09-18):
 * 預覽格照商城樣式,拖卡片調「同分類內」順序;分類間先後照分類顯示順序。
 */
export default async function ProductSortPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const [{ data: rows }, { data: catRow }] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('id, name, image_url, media, category, sort_order, product_variants(price_twd, status)')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active'),
    supabaseAdmin.from('tenants').select('category_order').eq('id', tenant.id).maybeSingle(),
  ]);

  type Row = {
    id: string;
    name: string;
    image_url: string | null;
    media: { type: string; url: string }[] | null;
    category: string | null;
    sort_order: number | null;
    product_variants: { price_twd: number; status: string }[] | null;
  };
  const products = (((rows ?? []) as Row[])).map((p) => {
    const img = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url;
    const active = (p.product_variants ?? []).filter((v) => v.status === 'active');
    return {
      id: p.id,
      name: p.name,
      image: img ?? null,
      price: active.length > 0 ? Math.min(...active.map((v) => v.price_twd)) : 0,
      category: p.category ?? '未分類',
      sort_order: p.sort_order,
    };
  });

  // 分類先後照 tenants.category_order(跟商城一致),沒列的照筆劃排後面
  const savedOrder: string[] = Array.isArray(
    (catRow as { category_order?: string[] } | null)?.category_order,
  )
    ? (catRow as { category_order: string[] }).category_order
    : [];
  const found = [...new Set(products.map((p) => p.category))];
  const catSeq = [
    ...savedOrder.filter((c) => found.includes(c)),
    ...found.filter((c) => !savedOrder.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ];

  const groups: SortGroup[] = catSeq.map((cat) => ({
    category: cat,
    items: products
      .filter((p) => p.category === cat)
      .sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name, 'zh-Hant'),
      )
      .map(({ id, name, image, price }) => ({ id, name, image, price })),
  }));

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <Link href={`/admin/${tenant.slug}/products`} style={{ color: '#666', fontSize: 13 }}>
        ← 返回商品管理
      </Link>
      <h1 style={{ fontSize: 22, marginTop: 12, marginBottom: 6 }}>商品排序</h1>
      <p style={{ color: '#71717a', fontSize: 13, marginBottom: 20, lineHeight: 1.7 }}>
        按住卡片直接拖到想要的位置,放開自動儲存(手機 / iPad 請<strong>長按半秒</strong>再拖)。
        只能在同一分類內移動;分類之間的先後請到「商品管理 → 分類顯示順序」調整。
        特價中與有角標的商品在商城仍會優先置頂。
      </p>
      <SortBoard tenantSlug={tenant.slug} initialGroups={groups} />
    </main>
  );
}
