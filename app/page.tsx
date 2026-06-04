import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 60;

type TenantLink = {
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
};

async function getActiveTenants(): Promise<TenantLink[]> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, logo_url, description')
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
};

export default async function Home() {
  const tenants = await getActiveTenants();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: c.bg,
        color: c.text,
      }}
    >
      <main
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: '64px 24px 48px',
        }}
      >
        {/* Hero — Brand */}
        <header style={{ textAlign: 'center', marginBottom: 56 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-mark.png"
            alt="NEOP"
            width={76}
            height={76}
            style={{ display: 'block', margin: '0 auto 22px' }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 700,
              color: '#0A0A0A',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            NEOP
            <span style={{ fontWeight: 300, color: '#6b7280', marginLeft: 10 }}>STALL</span>
          </h1>
          <p
            style={{
              margin: '18px auto 0',
              fontSize: 15,
              color: c.textSec,
              lineHeight: 1.6,
              maxWidth: 360,
            }}
          >
            為小事業打造的線上攤位平台。
            <br />
            一個攤位,一個故事。
          </p>
        </header>

        {/* 攤位列表 */}
        {tenants.length > 0 && (
          <section style={{ marginBottom: 64 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.textMuted,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 14,
                textAlign: 'center',
              }}
            >
              我們的攤位 · {tenants.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tenants.map((t) => (
                <Link
                  key={t.slug}
                  href={`/${t.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '16px 18px',
                    background: c.card,
                    border: `1px solid ${c.border}`,
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: c.text,
                    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                  }}
                >
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logo_url}
                      alt=""
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `1px solid ${c.border}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: '#e4e4e7',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: c.textMuted,
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      {t.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: c.text }}>
                      {t.name}
                    </div>
                    {t.description && (
                      <div
                        style={{
                          fontSize: 13,
                          color: c.textMuted,
                          marginTop: 3,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {t.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 20, color: c.textMuted, flexShrink: 0 }}>›</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Footer — admin / apply 小字入口 */}
        <footer
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: c.textMuted,
            lineHeight: 1.9,
            paddingTop: 32,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            已是賣家?
            <Link href="/admin/login" style={{ color: c.textSec, marginLeft: 4, textDecoration: 'underline' }}>
              登入後台 →
            </Link>
          </div>
          <div style={{ marginBottom: 18 }}>
            想開自己的店?
            <Link href="/admin/login?tab=signup" style={{ color: c.textSec, marginLeft: 4, textDecoration: 'underline' }}>
              申請開店 →
            </Link>
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#a1a1aa',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            NEO Potential Studio
          </div>
        </footer>
      </main>
    </div>
  );
}
