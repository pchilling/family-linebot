'use client';

import { useRef, useState } from 'react';
import { addProductMedia, removeProductMedia, reorderProductMedia } from '../../actions';
import { uploadProductMediaVideo } from './image-actions';
import { ProductImageUploader } from './image-uploader';

type MediaItem = { type: 'image' | 'video'; url: string };

/**
 * 商品多媒體管理(Phase 9.6/9.7,2026-06-02):
 *  - 顯示 media 陣列,首格為列表縮圖
 *  - +/編/刪/↑↓ 排序
 *  - 上傳圖 / 上傳影片(50MB)/ 貼 YouTube URL 三選一
 */
export function MediaManager({
  productId,
  tenantSlug,
  media,
  legacyImageUrl,
}: {
  productId: string;
  tenantSlug: string;
  media: MediaItem[];
  legacyImageUrl: string | null;
}) {
  const [uploading, setUploading] = useState<'video' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const vidInputRef = useRef<HTMLInputElement>(null);

  async function handleVideoUpload(file: File) {
    setErr(null);
    setUploading('video');
    try {
      const fd = new FormData();
      fd.append('tenant_slug', tenantSlug);
      fd.append('product_id', productId);
      fd.append('file', file);
      const res = await uploadProductMediaVideo(fd);
      if (!res.ok) setErr(res.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
      if (vidInputRef.current) vidInputRef.current.value = '';
    }
  }

  async function handleYouTube() {
    if (!ytUrl.trim()) return;
    setErr(null);
    const fd = new FormData();
    fd.append('tenant_slug', tenantSlug);
    fd.append('product_id', productId);
    fd.append('type', 'video');
    fd.append('url', ytUrl.trim());
    await addProductMedia(fd);
    setYtUrl('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 沒任何 media + 舊 image_url → fallback 提示 */}
      {media.length === 0 && legacyImageUrl && (
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
          目前用舊欄位「商品圖」({legacyImageUrl.slice(0, 50)}…)。
          上傳第一張多媒體後會以多媒體為主。
        </div>
      )}

      {/* Media list */}
      {media.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {media.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
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
              {/* 縮圖 */}
              <div
                style={{
                  width: 60,
                  height: 75,
                  background: '#000',
                  borderRadius: 4,
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {m.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ color: '#fff', fontSize: 22 }}>▶</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      background: m.type === 'video' ? '#dbeafe' : '#dcfce7',
                      color: m.type === 'video' ? '#1d4ed8' : '#15803d',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {m.type === 'video' ? '影片' : '圖片'}
                  </span>
                  {i === 0 && (
                    <span style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>
                      ★ 首格(列表縮圖)
                    </span>
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
                  title={m.url}
                >
                  {m.url}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <form action={reorderProductMedia} style={{ display: 'inline-block' }}>
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="product_id" value={productId} />
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
                <form action={reorderProductMedia} style={{ display: 'inline-block' }}>
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === media.length - 1}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: '#fff',
                      border: '1px solid #e4e4e7',
                      borderRadius: 4,
                      cursor: i === media.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: i === media.length - 1 ? 0.4 : 1,
                    }}
                    title="往下"
                  >
                    ↓
                  </button>
                </form>
                <form action={removeProductMedia} style={{ display: 'inline-block' }}>
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="product_id" value={productId} />
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

      {/* 加圖(走 ProductImageUploader 裁切 3:4 + 上傳到 media)*/}
      <div
        style={{
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
          + 加圖片(會裁切 3:4 直式)
        </div>
        <ProductImageUploader
          entity="product"
          mode="media"
          entityId={productId}
          tenantSlug={tenantSlug}
          currentImageUrl={null}
          productName="商品圖"
          compact
          uploadLabel="選圖上傳"
        />
      </div>

      {/* 加影片(自上傳 / YouTube URL)*/}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
          + 加影片
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
                if (f) handleVideoUpload(f);
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
        {err && (
          <div style={{ fontSize: 11, color: '#dc2626' }}>⚠️ {err}</div>
        )}
      </div>
    </div>
  );
}
