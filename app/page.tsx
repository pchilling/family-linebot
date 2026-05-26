import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 60;

type TenantLink = {
  slug: string;
  name: string;
  logo_url: string | null;
  plan: string;
};

async function getActiveTenants(): Promise<TenantLink[]> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, logo_url, plan')
    .eq('status', 'active')
    .order('name');
  return (data ?? []) as TenantLink[];
}

const c = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  accent: '#18181b',
};

export default async function Home() {
  const tenants = await getActiveTenants();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
        color: c.text,
      }}
    >
      <main
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '40px 20px 60px',
        }}
      >
        {/* Brand — NEOP STALL */}
        <header style={{ marginBottom: 32, textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-mark.png"
            alt="NEOP"
            width={64}
            height={64}
            style={{ display: 'block', margin: '0 auto 14px' }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              color: '#0A0A0A',
              letterSpacing: '-0.025em',
              lineHeight: 1,
            }}
          >
            <strong style={{ fontWeight: 700 }}>NEOP</strong>{' '}
            <span style={{ fontWeight: 300 }}>STALL</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: c.textMuted }}>
            多攤位電商 + LINE Bot · NEO Potential Studio
          </p>
        </header>

        {/* 入口 */}
        <section style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: c.textMuted,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            管理員 / 老師
          </div>
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              background: c.accent,
              color: '#fff',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <span>🛠 進管理後台</span>
            <span style={{ fontSize: 18, opacity: 0.7 }}>›</span>
          </Link>
        </section>

        {/* 攤位列表 */}
        {tenants.length > 0 && (
          <section>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.textMuted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              逛攤位({tenants.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tenants.map((t) => (
                <Link
                  key={t.slug}
                  href={`/${t.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    background: c.card,
                    border: `1px solid ${c.border}`,
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: c.text,
                  }}
                >
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logo_url}
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `1px solid ${c.border}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: '#e4e4e7',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: c.textMuted,
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      {t.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: c.text }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                      /{t.slug} · {t.plan.toUpperCase()}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: c.textMuted }}>›</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: c.textMuted, lineHeight: 1.6 }}>
          NEO Potential Studio
          <br />
          已加 LINE@ 好友的學員,主選單直接點功能即可
        </footer>
      </main>
    </div>
  );
}
