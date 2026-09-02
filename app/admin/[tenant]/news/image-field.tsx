'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { createNewsImageUploadUrl } from './actions';

/**
 * D#4(2026-09-02):消息圖片欄位 — 選檔直傳 Supabase(簽名連結),
 * 上傳完把公開 URL 塞進同表單的 hidden input(name="image_url"),
 * 隨 createNews / updateNews 表單一起送出。
 */
export function NewsImageField({
  tenantSlug,
  defaultUrl,
}: {
  tenantSlug: string;
  defaultUrl?: string | null;
}) {
  const [url, setUrl] = useState(defaultUrl ?? '');
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="image_url" value={url} />
      {url ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="消息圖片預覽"
            style={{ width: 90, aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 6, border: '1px solid #e4e4e7' }}
          />
          <button
            type="button"
            onClick={() => setUrl('')}
            style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ✕ 移除圖片
          </button>
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
          {uploading ? '上傳中…' : '⬆ 上傳圖片(選填,≤ 5MB)'}
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
