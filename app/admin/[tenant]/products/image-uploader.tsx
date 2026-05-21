'use client';

import { useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { uploadProductImage } from './image-actions';

type Props = {
  productId: string;
  tenantSlug: string;
  currentImageUrl: string | null;
  productName: string;
};

const ASPECT = 4 / 5; // 直式 portrait,跟 IG 貼文同比例
const OUTPUT_W = 600;
const OUTPUT_H = 750;

function centerInitial(imgW: number, imgH: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, ASPECT, imgW, imgH),
    imgW,
    imgH,
  );
}

export function ProductImageUploader({
  productId,
  tenantSlug,
  currentImageUrl,
  productName,
}: Props) {
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
    if (file.size > 8 * 1024 * 1024) {
      setError('檔案太大,請 8MB 以內');
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
      formData.append('product_id', productId);
      formData.append('file', blob, 'product.jpg');
      const result = await uploadProductImage(formData);

      if (result.ok) {
        setSuccess('上傳成功');
        setTimeout(() => window.location.reload(), 500);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 縮圖 + 換圖按鈕(沒裁切中時) */}
      {!imgSrc && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {currentImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImageUrl}
              alt={productName}
              style={{
                width: 80,
                height: 100, // 4:5 ratio
                borderRadius: 6,
                objectFit: 'cover',
                border: '1px solid #e4e4e7',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 100,
                borderRadius: 6,
                background: '#f4f4f5',
                border: '1px dashed #d4d4d8',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a1a1aa',
                fontSize: 11,
              }}
            >
              無圖
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                background: '#fff',
                color: '#52525b',
                border: '1px solid #e4e4e7',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                width: 'fit-content',
              }}
            >
              {currentImageUrl ? '換圖' : '上傳商品圖'}
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
            </label>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>
              4:5 直式,輸出 600×750
            </span>
          </div>
        </div>
      )}

      {/* 裁切預覽 */}
      {imgSrc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#52525b' }}>
            拖曳裁切框(鎖定 4:5 直式)
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
              aspect={ASPECT}
              keepSelection
              minWidth={64}
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
