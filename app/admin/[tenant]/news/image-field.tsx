'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { createNewsImageUploadUrl } from './actions';

/**
 * D#4(2026-09-02):消息圖片欄位 — 選檔直傳 Supabase(簽名連結),
 * 上傳完把公開 URL 塞進同表單的 hidden input(name="image_url")。
 * Phase 15.5(2026-09-08):同時偵測圖片原始比例(name="image_ratio",格式 W:H),
 * bot 圖卡照原比例顯示不裁圖。LINE 限制高 ≤ 寬 3 倍,超過先 clamp。
 */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function detectRatio(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) return resolve('3:4');
      if (h > w * 3) h = w * 3; // LINE flex image 高度上限 = 寬 × 3
      const g = gcd(Math.round(w), Math.round(h));
      resolve(`${Math.round(w / g)}:${Math.round(h / g)}`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('3:4');
    };
    img.src = url;
  });
}

export function NewsImageField({
  tenantSlug,
  defaultUrl,
  defaultRatio,
}: {
  tenantSlug: string;
  defaultUrl?: string | null;
  defaultRatio?: string | null;
}) {
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [ratio, setRatio] = useState(defaultRatio ?? '');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  async function handleFile(file: File) {
    setErr('');
    if (file.size > 5 * 1024 * 1024) {
      setErr('圖檔應 < 5MB');
      return;
    }
    setUploading(true);
    try {
      const detected = await detectRatio(file);
      const fd = new FormData();
      fd.append('tenant_slug', tenantSlug);
      fd.append('filename', file.name);
      const sign = await createNewsImageUploadUrl(fd);
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
      setUrl(sign.publicUrl);
      setRatio(detected);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="image_url" value={url} />
      <input type="hidden" name="image_ratio" value={ratio} />
      {url ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="消息圖片預覽"
            style={{ width: 110, borderRadius: 6, border: '1px solid #e4e4e7', display: 'block' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            {ratio && (
              <span style={{ fontSize: 11, color: '#71717a' }}>比例 {ratio.replace(':', ' : ')}(卡片照此顯示,不裁圖)</span>
            )}
            <button
              type="button"
              onClick={() => { setUrl(''); setRatio(''); }}
              style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ✕ 移除圖片
            </button>
          </div>
        </div>
      ) : (
        <label
          style={{
            display: 'inline-block',
            padding: '7px 14px',
            background: uploading ? '#9ca3af' : '#fff',
            color: uploading ? '#fff' : '#374151',
            border: '1px solid #d4d4d8',
            borderRadius: 4,
            cursor: uploading ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
            width: 'fit-content',
          }}
        >
          {uploading ? '上傳中…' : '⬆ 上傳圖片(選填,≤ 5MB,任意比例)'}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
      )}
      {err && <span style={{ fontSize: 11, color: '#dc2626' }}>⚠️ {err}</span>}
    </div>
  );
}
