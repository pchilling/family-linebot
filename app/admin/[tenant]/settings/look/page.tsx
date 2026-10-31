import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { bgStyleFromLegacy } from '@/lib/theme';
import { GroupHead, PanelTitle } from '../settings-ui';
import { LogoUploader } from '../logo-uploader';
import { BannerManager } from '../banner-manager';
import { BannerUploader } from '../banner-uploader';
import { LookForm } from '../settings-form';

type BannerItem = { type: 'image' | 'video'; url: string };

/**
 * 設定 → 外觀(2026-11-01 改版):Logo、公開頁輪播、分享預覽圖(三個上傳即生效),
 * 最後是品牌色 + 底色風格(LookForm,要按儲存)。
 */
export default async function LookSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, brand_color, shop_bg_color, logo_url, banners, og_image_url')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) notFound();
  const t = data as {
    slug: string;
    name: string;
    brand_color: string | null;
    shop_bg_color: string | null;
    logo_url: string | null;
    banners: BannerItem[] | null;
    og_image_url: string | null;
  };
  const banners = Array.isArray(t.banners) ? t.banners : [];

  return (
    <>
      <div className="sx-body sx-body-top">
        <PanelTitle title="外觀" desc="Logo、品牌色與公開頁的圖片。圖片上傳後立即生效,不用再按儲存。" />

        <div className="sx-group">
          <GroupHead title="Logo" desc="正方形,至少 256 × 256。顯示在公開頁頂部列、後台左上角與分享預覽。" />
          <LogoUploader tenantSlug={t.slug} currentLogoUrl={t.logo_url} tenantName={t.name} />
        </div>

        <hr className="sx-sep" />

        <div className="sx-group">
          <GroupHead
            title="公開頁輪播"
            desc="建議 1200 × 900(4:3)。第一格是公開頁開頭。可上傳圖片、影片,或貼 YouTube 連結。"
          />
          <BannerManager tenantSlug={t.slug} banners={banners} legacyOgImageUrl={t.og_image_url} />
        </div>

        <hr className="sx-sep" />

        <div className="sx-group">
          <GroupHead
            title="連結分享預覽圖"
            desc="把攤位網址貼到 LINE、FB、IG 時對方看到的縮圖。建議 1200 × 630,只能一張。"
          />
          <BannerUploader tenantSlug={t.slug} currentBannerUrl={t.og_image_url} />
        </div>
      </div>

      <LookForm
        tenantSlug={t.slug}
        tenantName={t.name}
        brandColor={t.brand_color}
        bgStyle={bgStyleFromLegacy(t.shop_bg_color)}
      />
    </>
  );
}
