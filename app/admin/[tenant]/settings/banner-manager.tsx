'use client';

import { useOptimistic, useRef, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import {
  addTenantBanner,
  createBannerUploadUrl,
  finalizeBannerUpload,
  removeTenantBanner,
  reorderTenantBanner,
} from './actions';

type BannerItem = { type: 'image' | 'video'; url: string };

/**
 * 攤位 Banner 多媒體管理(Phase 9.8,2026-06-02):
 * 跟商品 MediaManager 同 pattern,target 是 tenants.banners 而非 products.media。
 * Banner 預設比例 1200×630(16:9 寬),公開頁 hero 用。
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

  // 檔案不走 Server Action(Vercel body 4.5MB 硬限制),改瀏覽器直傳 Supabase Storage:
  // 1. createBannerUploadUrl 拿簽名上傳連結 → 2. 直傳 → 3. finalizeBannerUpload 記進 banners
  async function handleUpload(type: 'image' | 'video', file: File) {
    setErr(null);
    setUploading(type);
    try {
      const maxMb = type === 'image' ? 5 : 50;
      if (file.size > maxMb * 1024 * 1024) {
        setErr(`${type === 'image' ? '圖檔' : '影片'}應 < ${maxMb}MB`);
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
        .uploadToSignedUrl(sign.path, sign.token, file, {
          contentType: file.type || undefined,
        });
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
      if (imgInputRef.current) imgInputRef.current.value = '';
      if (vidInputRef.current) vidInputRef.current.value = '';
    }
  }

  async function handleYouTube() {
    if (!ytUrl.trim()) return;
    setErr(null);
    const fd = new FormData();
    fd.append('tenant_slug', tenantSlug);
    fd.append('type', 'video');
    fd.append('url', ytUrl.trim());
    await addTenantBanner(fd);
    setYtUrl('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {optimisticBanners.length === 0 && legacyOgImageUrl && (
        <div
          style={{
            padding: '8px 10px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 6,
            fontSize: 11,
            color: '#92400e',
            lineHeight: 1.5,
          }}
        >
          目前用舊欄位 og_image_url。新增 banner 後改用多媒體陣列。
        </div>
      )}

      {optimisticBanners.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {optimisticBanners.map((b, i) => (
            <div
              key={`${b.url}-${i}`}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: 8,
                background: i === 0 ? '#f0fdf4' : '#fafafa',
                border: `1px solid ${i === 0 ? '#bbf7d0' : '#e4e4e7'}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 50,
                  background: '#000',
                  borderRadius: 4,
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {b.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#fff', fontSize: 18 }}>▶</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      background: b.type === 'video' ? '#dbeafe' : '#dcfce7',
                      color: b.type === 'video' ? '#1d4ed8' : '#15803d',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {b.type === 'video' ? '影片' : '圖片'}
                  </span>
                  {i === 0 && (
                    <span style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>★ 首格</span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#71717a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={b.url}
                >
                  {b.url}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'reorder', index: i, direction: 'up' });
                    await reorderTenantBanner(fd);
                  }}
                  style={{ display: 'inline-block' }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={i === 0}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: '#fff',
                      border: '1px solid #e4e4e7',
                      borderRadius: 4,
                      cursor: i === 0 ? 'not-allowed' : 'pointer',
                      opacity: i === 0 ? 0.4 : 1,
                    }}
                    title="往上"
                  >
                    ↑
                  </button>
                </form>
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'reorder', index: i, direction: 'down' });
                    await reorderTenantBanner(fd);
                  }}
                  style={{ display: 'inline-block' }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === optimisticBanners.length - 1}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: '#fff',
                      border: '1px solid #e4e4e7',
                      borderRadius: 4,
                      cursor: i === optimisticBanners.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: i === optimisticBanners.length - 1 ? 0.4 : 1,
                    }}
                    title="往下"
                  >
                    ↓
                  </button>
                </form>
                <form
                  action={async (fd) => {
                    applyOptimistic({ type: 'remove', index: i });
                    await removeTenantBanner(fd);
                  }}
                  style={{ display: 'inline-block' }}
                >
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="index" value={i} />
                  <button
                    type="submit"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: '#fff',
                      border: '1px solid #fecaca',
                      borderRadius: 4,
                      color: '#dc2626',
                      cursor: 'pointer',
                    }}
                    title="刪除"
                  >
                    ✕
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>+ 加圖 / 影片</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              background: uploading === 'image' ? '#9ca3af' : '#fff',
              color: uploading === 'image' ? '#fff' : '#374151',
              border: '1px solid #d4d4d8',
              borderRadius: 4,
              cursor: uploading ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {uploading === 'image' ? '上傳中…' : '上傳圖片 (≤ 5MB)'}
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              disabled={!!uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload('image', f);
              }}
              style={{ display: 'none' }}
            />
          </label>
          <label
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              background: uploading === 'video' ? '#9ca3af' : '#fff',
              color: uploading === 'video' ? '#fff' : '#374151',
              border: '1px solid #d4d4d8',
              borderRadius: 4,
              cursor: uploading ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {uploading === 'video' ? '上傳中…' : '上傳影片 (≤ 50MB)'}
            <input
              ref={vidInputRef}
              type="file"
              accept="video/*"
              disabled={!!uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload('video', f);
              }}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="url"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder="或貼 YouTube URL (https://youtu.be/...)"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #d4d4d8',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleYouTube}
            disabled={!ytUrl.trim()}
            style={{
              padding: '6px 12px',
              background: !ytUrl.trim() ? '#e4e4e7' : '#18181b',
              color: !ytUrl.trim() ? '#9ca3af' : '#fff',
              border: 0,
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: !ytUrl.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            加 YouTube
          </button>
        </div>
        {err && <div style={{ fontSize: 11, color: '#dc2626' }}>⚠️ {err}</div>}
      </div>
    </div>
  );
}
