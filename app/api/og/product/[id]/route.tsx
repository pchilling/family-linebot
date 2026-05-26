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

/**
 * 拿 Google Fonts 的 subset(只含我們要 render 的字)。
 * 中文字一定要 load font,Satori 預設 Inter 沒中文 glyph → 500。
 */
async function loadGoogleFont(family: string, text: string, weight = 700) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype|woff2?)'\)/);
  if (!m) throw new Error(`font url not found for ${family}`);
  const buf = await (await fetch(m[1])).arrayBuffer();
  return buf;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 拆 2 個 query 比 join 穩定(Supabase nested select FK 推不出時整個 null)
  const { data: pData, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id, name, price_twd, image_url, tenant_id')
    .eq('id', id)
    .maybeSingle();

  if (pErr || !pData) {
    console.error('[og/product] product query', pErr, 'id=', id);
    return new Response('Product not found', { status: 404 });
  }

  type ProductRow = {
    id: string;
    name: string;
    price_twd: number | null;
    image_url: string | null;
    tenant_id: string;
  };
  const p = pData as ProductRow;

  const { data: tData } = await supabaseAdmin
    .from('tenants')
    .select('name, logo_url')
    .eq('id', p.tenant_id)
    .maybeSingle();
  const tenant = tData as { name: string; logo_url: string | null } | null;

  const product = {
    id: p.id,
    name: p.name,
    price_twd: p.price_twd,
    image_url: p.image_url,
    tenants: tenant,
  };

  // Load fonts(中文 + 英文 + 數字,所有會出現的字)
  const textForFonts =
    product.name +
    (tenant?.name ?? '') +
    'NT$0123456789MADEWITHNEOPSTALL';

  let notoFont: ArrayBuffer | null = null;
  let monoFont: ArrayBuffer | null = null;
  try {
    [notoFont, monoFont] = await Promise.all([
      loadGoogleFont('Noto Sans TC', textForFonts, 700),
      loadGoogleFont('JetBrains Mono', 'NT$0123456789', 700),
    ]);
  } catch (e) {
    console.error('[og/product] font load', e);
    // 字型沒撈到也不要 500,讓 Satori 用 fallback render(英文會 OK,中文會空)
  }

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
              fontFamily: 'Noto Sans TC',
              display: 'flex',
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
                fontFamily: 'JetBrains Mono',
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
                fontWeight: 700,
                color: '#0A0A0A',
                letterSpacing: '-0.01em',
                fontFamily: 'Noto Sans TC',
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
      fonts: [
        ...(notoFont
          ? [
              {
                name: 'Noto Sans TC' as const,
                data: notoFont,
                weight: 700 as const,
                style: 'normal' as const,
              },
            ]
          : []),
        ...(monoFont
          ? [
              {
                name: 'JetBrains Mono' as const,
                data: monoFont,
                weight: 700 as const,
                style: 'normal' as const,
              },
            ]
          : []),
      ],
    },
  );
}
