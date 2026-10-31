import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/supabase';
import { UI_CSS } from '@/lib/ui';
import { derivePalette, paletteCssVars } from '@/lib/theme';
import { siteOrigin } from '@/lib/return-to';
import { IconExternal } from '@/lib/icons';
import { SETTINGS_CSS } from './settings-ui';
import { CopyButton, SettingsNav } from './settings-client';

/**
 * 「設定」頁外框(2026-11-01 改版):頁首 + 一張卡片(左導覽、右內容)。
 * 六個分頁各自是獨立路由(/settings、/look、/payment、/shipping、/promo、/about),
 * 網址可以直接分享,每頁只撈自己要的欄位。
 * 表單元件沿用公開商店的 lib/ui.tsx,色票設成後台的 zinc(品牌色 #18181b → 中性灰階)。
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const origin = siteOrigin();
  const host = origin.replace(/^https?:\/\//, '');
  const publicUrl = `${origin}/${tenant.slug}`;
  const vars = paletteCssVars(derivePalette('#18181b', 'white')) as React.CSSProperties;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: UI_CSS + SETTINGS_CSS }} />
      <div className="sx" style={{ maxWidth: 1120, ...vars }}>
        <header className="sx-head">
          <div>
            <h1>設定</h1>
            <p>攤位的基本資料、外觀、收款與配送方式。每個分頁各自儲存。</p>
          </div>
          <div className="sx-actions">
            <span className="sx-url">
              {host}/<b>{tenant.slug}</b>
              <CopyButton text={publicUrl} title="複製網址" />
            </span>
            <a className="ui-btn ui-btn-outline ui-btn-sm" href={publicUrl} target="_blank" rel="noreferrer">
              開啟公開頁 <IconExternal size={14} />
            </a>
          </div>
        </header>

        <div className="sx-card">
          <SettingsNav slug={tenant.slug} />
          <div className="sx-panel">{children}</div>
        </div>
      </div>
    </main>
  );
}
