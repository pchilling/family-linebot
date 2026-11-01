'use client';

import { useOptimistic, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { Button, Input } from '@/lib/ui';
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash, IconVideo } from '@/lib/icons';
import {
  addTenantBanner,
  createBannerUploadUrl,
  finalizeBannerUpload,
  removeTenantBanner,
  reorderTenantBanner,
} from './actions';

type BannerItem = { type: 'image' | 'video'; url: string };

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * 公開頁輪播管理(Phase 9.8;2026-11-01 換成設定頁新版面:4:3 縮圖格)。
 * 跟商品 MediaManager 同 pattern,target 是 tenants.banners。
 * 檔案不走 Server Action(Vercel body 4.5MB 硬限制),改瀏覽器直傳 Supabase Storage:
 * createBannerUploadUrl 拿簽名上傳連結 → 直傳 → finalizeBannerUpload 記進 banners。
 */
export function BannerManager({
  tenantSlug,
  banners,
  legacyOgImageUrl,
}: {
  tenantSlug: string;
  banners: BannerItem[];
  legacyOgImageUrl: string | null;
}) {
  const [uploading, setUploading] = useState<'image' | 'video' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);

  type Action =
    | { type: 'reorder'; index: number; direction: 'up' | 'down' }
    | { type: 'remove'; index: number };
  const [optimisticBanners, applyOptimistic] = useOptimistic(
    banners,
    (current: BannerItem[], action: Action): BannerItem[] => {
      if (action.type === 'reorder') {
        const target = action.direction === 'up' ? action.index - 1 : action.index + 1;
        if (target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[action.index], next[target]] = [next[target], next[action.index]];
        return next;
      }
      if (action.type === 'remove') {
        return current.filter((_, i) => i !== action.index);
      }
      return current;
    },
  );

  async function handleUpload(type: 'image' | 'video', file: File) {
    setErr(null);
    setUploading(type);
    try {
      const maxMb = type === 'image' ? 5 : 50;
      if (file.size > maxMb * 1024 * 1024) {
        setErr(`${type === 'image' ? '圖片' : '影片'}要在 ${maxMb}MB 以內`);
        return;
      }
      const signFd = new FormData();
      signFd.append('tenant_slug', tenantSlug);
      signFd.append('type', type);
      signFd.append('filename', file.name);
      const sign = await createBannerUploadUrl(signFd);
      if (!sign.ok) {
        setErr(sign.error);
        return;
      }
      const supabase = createSupabaseBrowser();
      const { error: upErr } = await supabase.storage
        .from('tenant-assets')
        .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || undefined });
      if (upErr) {
        setErr('上傳失敗:' + upErr.message);
        return;
      }
      const finFd = new FormData();
      finFd.append('tenant_slug', tenantSlug);
      finFd.append('type', type);
      finFd.append('path', sign.path);
      const res = await finalizeBannerUpload(finFd);
      if (!res.ok) setErr(res.error);
      else setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
      if (imgInputRef.current) imgInputRef.current.value = '';
      if (vidInputRef.current) vidInputRef.current.value = '';
    }
  }

  async function handleYouTube() {
    const url = ytUrl.trim();
    if (!url) return;
    if (!youtubeId(url)) {
      setErr('看不出這是 YouTube 影片連結,要像 https://youtu.be/xxxxxxxxxxx');
      return;
    }
    setErr(null);
    const fd = new FormData();
    fd.append('tenant_slug', tenantSlug);
    fd.append('type', 'video');
    fd.append('url', url);
    await addTenantBanner(fd);
    setYtUrl('');
    setAdding(false);
  }

  return (
    <div className="sx-group">
      {optimisticBanners.length === 0 && legacyOgImageUrl && (
        <div className="sx-callout">還沒有輪播圖,商店開頭暫時用下面的「連結分享預覽圖」。加了輪播圖之後就改用輪播。</div>
      )}

      <div className="sx-media">
        {optimisticBanners.map((b, i) => {
          const yt = b.type === 'video' ? youtubeId(b.url) : null;
          const last = i === optimisticBanners.length - 1;
          return (
            <div key={`${b.url}-${i}`} className="sx-thumb">
              {b.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.url} alt={`輪播第 ${i + 1} 格`} />
              ) : yt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt={`輪播第 ${i + 1} 格(YouTube)`} />
              ) : (
                <video src={b.url} muted playsInline preload="metadata" />
              )}
              <span className="no">{i + 1}</span>
              {b.type === 'video' && (
                <span className="ui-badge sx-badge-off tag">
                  <IconVideo size={12} />
                  {yt ? 'YouTube' : '影片'}
                </span>
              )}
              <div className="ops">
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'reorder', index: i, direction: 'up' });
                    await reorderTenantBanner(fd);
                  }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" className="sx-ib" disabled={i === 0} title="往前" aria-label="往前">
                    <IconChevronUp size={14} />
                  </button>
                </form>
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'reorder', index: i, direction: 'down' });
                    await reorderTenantBanner(fd);
                  }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" className="sx-ib" disabled={last} title="往後" aria-label="往後">
                    <IconChevronDown size={14} />
                  </button>
                </form>
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'remove', index: i });
                    await removeTenantBanner(fd);
                  }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <button
                    type="submit"
                    className="sx-ib danger"
                    title="刪除"
                    aria-label="刪除"
                    onClick={(e) => {
                      if (!window.confirm('刪除這一格?')) e.preventDefault();
                    }}
                  >
                    <IconTrash size={14} />
                  </button>
                </form>
              </div>
            </div>
          );
        })}

        <button type="button" className="sx-thumb-add" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          <IconPlus size={20} />
          新增圖片、影片或 YouTube
        </button>
      </div>

      {adding && (
        <div className="sx-dash">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="ui-btn ui-btn-outline ui-btn-sm sx-filebtn">
              {uploading === 'image' ? '上傳中…' : '上傳圖片'}
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload('image', f);
                }}
              />
            </label>
            <label className="ui-btn ui-btn-outline ui-btn-sm sx-filebtn">
              {uploading === 'video' ? '上傳中…' : '上傳影片'}
              <input
                ref={vidInputRef}
                type="file"
                accept="video/*"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload('video', f);
                }}
              />
            </label>
          </div>
          <span className="sx-hint">圖片 5MB 以內、影片 50MB 以內,比例都建議 4:3。</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              className="ui-input-sm"
              type="url"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="或貼 YouTube 連結,例如 https://youtu.be/…"
              aria-label="YouTube 連結"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleYouTube} disabled={!ytUrl.trim()}>
              加入
            </Button>
          </div>
        </div>
      )}

      {err && <div className="sx-err">{err}</div>}
    </div>
  );
}
