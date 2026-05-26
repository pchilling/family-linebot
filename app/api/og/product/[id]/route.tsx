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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  const origin = url.origin;

  // Test bypass:?test=1 → 不跑 ImageResponse,直接回 plain text 證明 route 在
  if (url.searchParams.get('test') === '1') {
    const { id } = await params;
    return new Response(
      `OG route alive\nproduct id: ${id}\ntime: ${new Date().toISOString()}`,
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  // Debug 模式:?debug=1 → 把 error stack 倒給用戶看(否則 Vercel 吞成 500)
  const debug = url.searchParams.get('debug') === '1';
  try {
    const resp = await renderOg(params, origin);
    // 強制立刻 render — ImageResponse 預設是 lazy,
    // Satori 出錯不會被外層 try/catch 接到。
    // 把 stream 立刻消費成 buffer,errors 在這裡 throw 才能 debug 抓到。
    if (resp instanceof ImageResponse) {
      const buf = await resp.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    }
    return resp;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n\n${e.stack}` : String(e);
    console.error('[og/product] render', msg);
    if (debug) {
      return new Response(msg, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return new Response('Internal error', { status: 500 });
  }
}

async function renderOg(params: Promise<{ id: string }>, origin: string) {
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
          background: '#0A0A0A',
        }}
      >
        {/* 上半:4:5 圖完整顯示(1080×1350) */}
        <div
          style={{
            width: 1080,
            height: 1350,
            display: 'flex',
            background: '#1a1a1a',
            position: 'relative',
          }}
        >
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </div>

        {/* 下半:1080×570 黑底資訊區(兩欄:左 text、右 logo) */}
        <div
          style={{
            width: 1080,
            height: 570,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '40px 72px 56px',
            color: '#ffffff',
            gap: 32,
            background: '#0A0A0A',
            boxSizing: 'border-box',
          }}
        >
          {/* 左欄:tenant pill + 標題 + 價格 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Tenant pill */}
            {product.tenants && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: product.tenants.logo_url ? '8px 20px 8px 8px' : '10px 20px',
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: 999,
                  marginBottom: 20,
                  alignSelf: 'flex-start',
                }}
              >
                {product.tenants.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.tenants.logo_url}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      borderRadius: 999,
                      objectFit: 'cover',
                      marginRight: 12,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#0A0A0A',
                    letterSpacing: '-0.01em',
                    fontFamily: 'Noto Sans TC',
                    lineHeight: 1,
                  }}
                >
                  {product.tenants.name}
                </span>
              </div>
            )}

            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontFamily: 'Noto Sans TC',
                display: 'flex',
              }}
            >
              {product.name}
            </div>

            {product.price_twd !== null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 20,
                  fontFamily: 'JetBrains Mono',
                  fontSize: 56,
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    fontWeight: 400,
                    opacity: 0.7,
                    marginRight: 12,
                    letterSpacing: '0.02em',
                  }}
                >
                  NT$
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {product.price_twd.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* 右欄:NEOP logo 白版 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              flexShrink: 0,
              width: 180,
              height: 180,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${origin}/brand/logo-mark-white.png`}
              alt=""
              width={180}
              height={180}
              style={{ display: 'block', objectFit: 'contain' }}
            />
          </div>
        </div>

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
