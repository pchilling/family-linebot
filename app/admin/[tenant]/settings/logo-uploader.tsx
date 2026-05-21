'use client';

import { useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { uploadLogo, removeLogo } from './actions';

type Props = {
  tenantSlug: string;
  currentLogoUrl: string | null;
};

const LOGO_ASPECT = 1; // 正方形
const LOGO_OUTPUT_SIZE = 256; // 上傳出 256×256

function centerSquareCrop(imgW: number, imgH: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, imgW, imgH),
    imgW,
    imgH,
  );
}

export function LogoUploader({ tenantSlug, currentLogoUrl }: Props) {
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
      setError('只支援圖片檔');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('檔案太大,請 5MB 以內');
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
    setCrop(centerSquareCrop(naturalWidth, naturalHeight, LOGO_ASPECT));
  }

  function cancel() {
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setError(null);
  }

  async function handleUpload() {
    if (!completedCrop || !imgRef.current) {
      setError('請先選圖 + 確認裁切範圍');
      return;
    }
    setUploading(true);
    setError(null);

    try {
      // 用 canvas 把裁切區域畫出來,再轉 blob
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_OUTPUT_SIZE;
      canvas.height = LOGO_OUTPUT_SIZE;
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
        LOGO_OUTPUT_SIZE,
        LOGO_OUTPUT_SIZE,
      );

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('裁切失敗'))),
          'image/jpeg',
          0.9,
        );
      });

      const formData = new FormData();
      formData.append('tenant_slug', tenantSlug);
      formData.append('file', blob, 'logo.jpg');
      const result = await uploadLogo(formData);

      if (result.ok) {
        setSuccess('上傳成功');
        // 短暫顯示成功,然後 reload 看新 logo
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 目前 logo + 換新 + 移除 */}
      {currentLogoUrl && !imgSrc && (
        <div
          style={{
            padding: 16,
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <img
            src={currentLogoUrl}
            alt="目前 logo"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #e4e4e7',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#18181b', marginBottom: 2 }}>目前 logo</div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>256×256 · 圓形顯示</div>
          </div>
          <label
            style={{
              padding: '7px 12px',
              background: '#18181b',
              color: '#fff',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            📷 換新
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              if (!confirm('確定移除 logo 嗎?移除後 sidebar / 公開頁會顯示首字 fallback。')) return;
              setUploading(true);
              setError(null);
              try {
                const r = await removeLogo(tenantSlug);
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
            }}
            disabled={uploading}
            style={{
              padding: '7px 10px',
              background: '#fff',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: 6,
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            🗑️
          </button>
        </div>
      )}

      {!imgSrc && !currentLogoUrl && (
        <div
          style={{
            padding: '24px 20px',
            background: '#fafafa',
            border: '2px dashed #d4d4d8',
            borderRadius: 10,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>👤</div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#71717a' }}>
            還沒上傳 logo
          </p>
          <label
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#18181b',
              color: '#fff',
              borderRadius: 7,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            📷 上傳 logo
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {!imgSrc && currentLogoUrl && (
        <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>
          顯示在公開頁 header 跟 admin sidebar。建議用 logo / 商店招牌相似的圖片。
        </p>
      )}

      {/* 裁切預覽 */}
      {imgSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#52525b' }}>
            拖曳邊框調整裁切範圍(顯示時會是圓形)
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
              onChange={(_, percent) => setCrop(percent)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={LOGO_ASPECT}
              circularCrop
              keepSelection
              minWidth={48}
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

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !completedCrop}
              style={{
                padding: '10px 18px',
                background: uploading ? '#a1a1aa' : '#18181b',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                fontSize: 14,
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
                padding: '10px 18px',
                background: '#fff',
                color: '#52525b',
                border: '1px solid #e4e4e7',
                borderRadius: 6,
                fontSize: 14,
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
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 13,
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: '10px 14px',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 13,
            borderRadius: 6,
            fontWeight: 500,
          }}
        >
          ✓ {success}
        </div>
      )}
    </div>
  );
}
