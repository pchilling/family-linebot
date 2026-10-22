import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin, type MediaItem } from '@/lib/supabase';
import { ReviewForm, type ReviewItem } from './review-form';

type Props = {
  params: Promise<{ slug: string; order_no: string }>;
  searchParams?: Promise<{ k?: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { order_no } = await params;
  return { title: `評價訂單 ${order_no}`, robots: { index: false } };
}

/**
 * 評價頁(Phase 25):LINE 卡片的「給個評價」按鈕帶訂單存取碼進來,
 * 列出這筆訂單買過的商品(贈品不列),每個打 1–5 星。沒帶對碼就不給評。
 */
export default async function ReviewOrderPage({ params, searchParams }: Props) {
  const { slug, order_no } = await params;
  const k = (searchParams ? await searchParams : undefined)?.k ?? '';
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, status, access_key, users(display_name), order_items(product_id, price_at_purchase, products(id, name, image_url, media))')
    .eq('tenant_id', tenant.id)
    .eq('order_no', order_no)
    .maybeSingle();
  const order = (data ?? null) as unknown as {
    id: string;
    status: string;
    access_key: string | null;
    users: { display_name: string | null } | null;
    order_items: { product_id: string; price_at_purchase: number; products: { id: string; name: string; image_url: string | null; media: MediaItem[] | null } | null }[] | null;
  } | null;

  const invalid = !order || !order.access_key || order.access_key !== k;
  const notYet = !invalid && order!.status !== 'shipped' && order!.status !== 'delivered';

  if (invalid || notYet) {
    return (
      <div style={{ maxWidth: 560, margin: '2rem auto' }}>
        <div className="ui-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{invalid ? '這個連結無效' : '出貨後才能評價'}</h1>
          <p className="ui-muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.7 }}>
            {invalid
              ? '請從 LINE 通知裡的「給個評價」按鈕進入,或等出貨後我們再邀請您。'
              : '商品送到之後我們會透過 LINE 邀請您評價,到時再來給星星。'}
          </p>
          <a href={`/${slug}`} className="ui-btn ui-btn-outline ui-btn-md" style={{ marginTop: 20 }}>回商店</a>
        </div>
      </div>
    );
  }

  const { data: existing } = await supabaseAdmin
    .from('product_reviews')
    .select('product_id, rating, comment, display_name')
    .eq('order_id', order!.id);
  const existingByProduct = new Map(
    ((existing as { product_id: string; rating: number; comment: string | null; display_name: string | null }[] | null) ?? []).map((r) => [r.product_id, r]),
  );

  const seen = new Set<string>();
  const items: ReviewItem[] = [];
  for (const i of order!.order_items ?? []) {
    if (!i.products || i.price_at_purchase <= 0 || seen.has(i.product_id)) continue; // 贈品不評
    seen.add(i.product_id);
    const img = (i.products.media ?? []).find((m) => m.type === 'image')?.url ?? i.products.image_url ?? null;
    const ex = existingByProduct.get(i.product_id);
    items.push({ productId: i.product_id, name: i.products.name, image: img, rating: ex?.rating ?? null, comment: ex?.comment ?? null });
  }
  const defaultName = existingByProduct.values().next().value?.display_name ?? order!.users?.display_name ?? '';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ padding: '8px 0 20px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>這次買的東西還滿意嗎?</h1>
        <p className="ui-muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
          訂單 <span className="ui-num" style={{ color: 'var(--ui-ink)', fontWeight: 500 }}>{order_no}</span> · 點星星打分數,想多說一點也可以。
        </p>
      </div>
      <ReviewForm slug={slug} orderNo={order_no} accessKey={k} defaultName={defaultName} items={items} />
    </div>
  );
}
