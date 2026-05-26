import { ImageResponse } from 'next/og';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * 分享卡 v0(Phase 9,2026-05-26)。
 *
 * GET /api/og/product/{product_id} → 1080×1920 IG Story PNG
 * 設計:full-bleed product image + bottom gradient overlay + name / price / NEOP STALL watermark
 *
 * 限制 v0:
 * - 只 IG Story 9:16 比例(其他尺寸 v0.1 再加)
 * - 沒載自訂字型(用 system fallback,v0.1 加 Space Grotesk)
 * - admin 右鍵存圖,沒一鍵分享
 */
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, price_twd, image_url, tenants(name, logo_url)')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return new Response('Product not found', { status: 404 });
  }

  type Row = {
    id: string;
    name: string;
    price_twd: number | null;
    image_url: string | null;
    tenants: { name: string; logo_url: string | null } | null;
  };
  const product = data as unknown as Row;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: '#0A0A0A',
        }}
      >
        {/* Full-bleed cover image */}
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Gradient overlay — 從 50% 高度開始黑漸層 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: '40%',
            background:
              'linear-gradient(to top, rgba(10,10,10,0.96) 0%, rgba(10,10,10,0.85) 30%, rgba(10,10,10,0.4) 75%, rgba(10,10,10,0) 100%)',
            display: 'flex',
          }}
        />

        {/* 底部 NEOP green tint(微暈染) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 240,
            background:
              'linear-gradient(to top, rgba(5,200,120,0.08) 0%, transparent 100%)',
            display: 'flex',
          }}
        />

        {/* Text overlay - bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: 72,
            right: 72,
            display: 'flex',
            flexDirection: 'column',
            color: '#ffffff',
          }}
        >
          {/* Product name */}
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              maxWidth: '90%',
            }}
          >
            {product.name}
          </div>

          {/* Price */}
          {product.price_twd !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                marginTop: 28,
                fontFamily: 'monospace',
              }}
            >
              <span
                style={{
                  fontSize: 32,
                  opacity: 0.7,
                  marginRight: 12,
                  letterSpacing: '0.05em',
                }}
              >
                NT$
              </span>
              <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {product.price_twd.toLocaleString()}
              </span>
            </div>
          )}

          {/* Watermark — bottom left stacked */}
          <div
            style={{
              marginTop: 88,
              display: 'flex',
              flexDirection: 'column',
              opacity: 0.65,
            }}
          >
            <div
              style={{
                fontSize: 16,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Made with
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
              }}
            >
              NEOP <span style={{ fontWeight: 300, marginLeft: 8 }}>STALL</span>
            </div>
          </div>
        </div>

        {/* Top right - tenant logo + name(品牌歸屬,不搶主視覺)*/}
        {product.tenants && (
          <div
            style={{
              position: 'absolute',
              top: 64,
              left: 72,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 20px',
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 999,
            }}
          >
            {product.tenants.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.tenants.logo_url}
                alt=""
                width={36}
                height={36}
                style={{
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            )}
            <span
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#0A0A0A',
                letterSpacing: '-0.01em',
              }}
            >
              {product.tenants.name}
            </span>
          </div>
        )}
      </div>
    ),
    {
      width: 1080,
      height: 1920,
    },
  );
}
