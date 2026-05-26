import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * 公開商品分享頁(Phase 9.3,2026-05-27):
 * `/share/p/{product_id}`
 *
 * 用途:WhatsApp / 訊息 / FB / LINE 之類**不能直接傳圖**的 app,
 * 用戶分享這個 URL → 對方 app 抓 OG meta tag → 顯示我們產的分享圖預覽。
 *
 * 體驗:用戶點 URL → 看到大張圖 + 攤位 + 「逛攤位」CTA。
 */

async function getProduct(id: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, price_twd, image_url, status, tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  type Row = {
    id: string;
    name: string;
    price_twd: number | null;
    image_url: string | null;
    status: string;
    tenant_id: string;
  };
  const p = data as Row;

  const { data: tData } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, logo_url, status')
    .eq('id', p.tenant_id)
    .maybeSingle();
  type T = { slug: string; name: string; logo_url: string | null; status: string };
  const tenant = tData as T | null;
  if (!tenant || tenant.status !== 'active') return null;

  return { ...p, tenant };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    return { title: 'NEOP STALL' };
  }
  const ogUrl = `/api/og/product/${id}`;
  const desc = product.price_twd !== null ? `NT$ ${product.price_twd.toLocaleString()}` : '';
  return {
    title: `${product.name} · ${product.tenant.name}`,
    description: desc,
    openGraph: {
      title: product.name,
      description: desc,
      images: [{ url: ogUrl, width: 1080, height: 1920 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: desc,
      images: [ogUrl],
    },
  };
}

export default async function ShareProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A0A0A',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 48px',
        boxSizing: 'border-box',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/og/product/${product.id}`}
        alt={product.name}
        style={{
          width: '100%',
          maxWidth: 432,
          aspectRatio: '9 / 16',
          objectFit: 'cover',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      />

      <div
        style={{
          marginTop: 24,
          maxWidth: 432,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            margin: '0 0 8px',
          }}
        >
          {product.name}
        </h1>
        {product.price_twd !== null && (
          <p style={{ fontSize: 18, opacity: 0.75, margin: '0 0 24px', fontFamily: 'var(--font-geist-mono), monospace' }}>
            NT$ {product.price_twd.toLocaleString()}
          </p>
        )}

        <Link
          href={`/${product.tenant.slug}`}
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            background: '#05C878',
            color: '#fff',
            borderRadius: 999,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          逛 {product.tenant.name} 攤位 →
        </Link>

        <p
          style={{
            marginTop: 32,
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontWeight: 700 }}>NEOP</span>{' '}
          <span style={{ fontWeight: 300 }}>STALL</span>
        </p>
      </div>
    </main>
  );
}
