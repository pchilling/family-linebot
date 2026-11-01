'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/lib/ui';
import { IconUpload } from '@/lib/icons';
import { FlashToast } from '../../../_components/toast';
import { uploadLogo, removeLogo } from './actions';

type Props = {
  tenantSlug: string;
  currentLogoUrl: string | null;
  tenantName: string;
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

/**
 * Logo 上傳(Phase 7.1;2026-11-01 換成設定頁新版面)。
 * 選圖 → 裁成正方形 → 上傳即生效;移除也立即生效。
 */
export function LogoUploader({ tenantSlug, currentLogoUrl, tenantName }: Props) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl);
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ts: number; text: string } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      setError('請先選圖並確認裁切範圍');
      return;
    }
    setBusy(true);
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
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('裁切失敗'))), 'image/jpeg', 0.9);
      });

      const formData = new FormData();
      formData.append('tenant_slug', tenantSlug);
      formData.append('file', blob, 'logo.jpg');
      const result = await uploadLogo(formData);
      if (result.ok) {
        setLogoUrl(result.url);
        setImgSrc('');
        setToast({ ts: Date.now(), text: 'Logo 已更新' });
        router.refresh(); // 左側欄的 logo 一起換
      } else {
        setError(result.error);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('確定移除 Logo?商店與後台會改顯示店名首字。')) return;
    setBusy(true);
    setError(null);
    const r = await removeLogo(tenantSlug);
    setBusy(false);
    if (r.ok) {
      setLogoUrl(null);
      setToast({ ts: Date.now(), text: '已移除 Logo' });
      router.refresh();
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="sx-group">
      {!imgSrc && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="目前 Logo" className="sx-logo" />
          ) : (
            <div className="sx-logo" aria-hidden>
              {tenantName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="ui-btn ui-btn-outline ui-btn-sm sx-filebtn">
              <IconUpload size={14} />
              {logoUrl ? '更換' : '上傳 Logo'}
              <input type="file" accept="image/*" onChange={onFileChange} disabled={busy} />
            </label>
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy} style={{ color: '#b91c1c' }}>
                移除
              </Button>
            )}
          </div>
        </div>
      )}

      {imgSrc && (
        <>
          <span className="sx-hint">拖曳邊框調整裁切範圍,顯示時會是圓形。</span>
          <div className="sx-crop">
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
              <img ref={imgRef} src={imgSrc} alt="待裁切" onLoad={onImageLoad} style={{ maxWidth: '100%', maxHeight: 400, display: 'block' }} />
            </ReactCrop>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" size="sm" onClick={handleUpload} disabled={busy || !completedCrop}>
              {busy ? '上傳中…' : '套用'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={busy}>
              取消
            </Button>
          </div>
        </>
      )}

      {error && <div className="sx-err">{error}</div>}
      {toast && <FlashToast key={toast.ts} message={toast.text} />}
    </div>
  );
}
