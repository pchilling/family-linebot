'use client';

import { useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { uploadBanner, removeBanner } from './actions';

type Props = {
  tenantSlug: string;
  currentBannerUrl: string | null;
};

const ASPECT = 1200 / 630; // OG / hero banner 通用比例 ≈ 1.905
const OUTPUT_W = 1200;
const OUTPUT_H = 630;

function centerInitial(imgW: number, imgH: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 95 }, ASPECT, imgW, imgH),
    imgW,
    imgH,
  );
}

export function BannerUploader({ tenantSlug, currentBannerUrl }: Props) {
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('只支援圖片');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('檔案太大,請 10MB 以內');
      return;
    }
    setError(null);
    setSuccess(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    const reader = new FileReader();
    reader.onload = () => setImgSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerInitial(naturalWidth, naturalHeight));
  }

  function cancel() {
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setError(null);
  }

  async function handleUpload() {
    if (!completedCrop || !imgRef.current) {
      setError('請先選圖');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_W;
      canvas.height = OUTPUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不支援');

      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        OUTPUT_W,
        OUTPUT_H,
      );

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('裁切失敗'))),
          'image/jpeg',
          0.88,
        );
      });

      const formData = new FormData();
      formData.append('tenant_slug', tenantSlug);
      formData.append('file', blob, 'banner.jpg');
      const result = await uploadBanner(formData);
      if (result.ok) {
        setSuccess('已上傳');
        setTimeout(() => window.location.reload(), 600);
      } else {
        setError(result.error);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirm('確定移除 banner 嗎?移除後公開頁就不會顯示 hero 圖,可以隨時再上傳。')) return;
    setUploading(true);
    setError(null);
    try {
      const r = await removeBanner(tenantSlug);
      if (r.ok) {
        setSuccess('已移除');
        setTimeout(() => window.location.reload(), 500);
      } else {
        setError(r.error);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!imgSrc && currentBannerUrl && (
        <div
          style={{
            position: 'relative',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: 12,
            padding: 14,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#71717a',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            目前 banner · 1200×630
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentBannerUrl}
            alt="banner 預覽"
            style={{
              width: '100%',
              aspectRatio: '1200 / 630',
              objectFit: 'cover',
              borderRadius: 8,
              display: 'block',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <label
              style={{
                flex: 1,
                padding: '9px 14px',
                background: '#18181b',
                color: '#fff',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center',
                fontFamily: 'inherit',
              }}
            >
              📷 換新圖
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              style={{
                padding: '9px 14px',
                background: '#fff',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: 7,
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'inherit',
              }}
            >
              🗑️ 移除
            </button>
          </div>
        </div>
      )}

      {!imgSrc && !currentBannerUrl && (
        <div
          style={{
            background: '#fafafa',
            border: '2px dashed #d4d4d8',
            borderRadius: 12,
            padding: '32px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>🖼️</div>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: '#18181b' }}>
            還沒上傳 banner
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#71717a', lineHeight: 1.5 }}>
            橫式圖,顯示在公開頁頂部當 hero<br />
            同時用作 LINE / IG / FB 分享預覽圖(og:image)
          </p>
          <label
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              background: '#18181b',
              color: '#fff',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            📷 上傳 banner
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </label>
          <p style={{ fontSize: 11, color: '#a1a1aa', margin: '12px 0 0' }}>
            建議比例 1200×630,JPG / PNG / WebP 都可
          </p>
        </div>
      )}

      {imgSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#52525b' }}>
            拖曳裁切框(鎖定 1200×630 比例)
          </div>
          <div
            style={{
              padding: 12,
              background: '#fafafa',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              display: 'flex',
              justifyContent: 'center',
              maxHeight: 480,
              overflow: 'auto',
            }}
          >
            <ReactCrop
              crop={crop}
              onChange={(_, p) => setCrop(p)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={ASPECT}
              keepSelection
              minWidth={120}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imgSrc}
                alt="待裁切"
                onLoad={onImageLoad}
                style={{ maxWidth: '100%', maxHeight: 400, display: 'block' }}
              />
            </ReactCrop>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !completedCrop}
              style={{
                padding: '8px 16px',
                background: uploading ? '#a1a1aa' : '#18181b',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {uploading ? '上傳中…' : '套用'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                background: '#fff',
                color: '#52525b',
                border: '1px solid #e4e4e7',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 12,
            borderRadius: 5,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: '8px 12px',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 12,
            borderRadius: 5,
            fontWeight: 500,
          }}
        >
          ✓ {success}
        </div>
      )}
    </div>
  );
}
