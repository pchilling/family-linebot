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
import { uploadBanner, removeBanner } from './actions';

type Props = {
  tenantSlug: string;
  currentBannerUrl: string | null;
};

const ASPECT = 1200 / 630; // og:image 比例 ≈ 1.905
const OUTPUT_W = 1200;
const OUTPUT_H = 630;

function centerInitial(imgW: number, imgH: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 95 }, ASPECT, imgW, imgH),
    imgW,
    imgH,
  );
}

/**
 * 連結分享預覽圖(og:image)上傳(Phase 7.3;2026-11-01 換成設定頁新版面)。
 * 選圖 → 裁成 1200×630 → 上傳即生效。輪播圖是空的時候公開頁開頭也用這張。
 */
export function BannerUploader({ tenantSlug, currentBannerUrl }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(currentBannerUrl);
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
      setError('只支援圖片');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('檔案太大,請 10MB 以內');
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
    setBusy(true);
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
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('裁切失敗'))), 'image/jpeg', 0.88);
      });

      const formData = new FormData();
      formData.append('tenant_slug', tenantSlug);
      formData.append('file', blob, 'banner.jpg');
      const result = await uploadBanner(formData);
      if (result.ok) {
        setUrl(result.url);
        setImgSrc('');
        setToast({ ts: Date.now(), text: '分享預覽圖已更新' });
        router.refresh();
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
    if (!window.confirm('確定移除分享預覽圖?貼網址到 LINE、FB 時就不會有縮圖,可以隨時再上傳。')) return;
    setBusy(true);
    setError(null);
    const r = await removeBanner(tenantSlug);
    setBusy(false);
    if (r.ok) {
      setUrl(null);
      setToast({ ts: Date.now(), text: '已移除分享預覽圖' });
      router.refresh();
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="sx-group">
      {!imgSrc && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="目前的分享預覽圖" className="sx-og" />
          ) : (
            <div className="sx-og">還沒上傳</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="ui-btn ui-btn-outline ui-btn-sm sx-filebtn">
              <IconUpload size={14} />
              {url ? '更換' : '上傳'}
              <input type="file" accept="image/*" onChange={onFileChange} disabled={busy} />
            </label>
            {url && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy} style={{ color: '#b91c1c' }}>
                移除
              </Button>
            )}
          </div>
        </div>
      )}

      {imgSrc && (
        <>
          <span className="sx-hint">拖曳裁切框,比例固定 1200 × 630。</span>
          <div className="sx-crop">
            <ReactCrop
              crop={crop}
              onChange={(_, p) => setCrop(p)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={ASPECT}
              keepSelection
              minWidth={120}
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
