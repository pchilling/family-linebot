'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { createAdminImageUploadUrl } from '../actions';

/**
 * 表單內建圖片上傳欄(2026-09-08):
 * 「建立前」就能傳圖 — 直傳 Supabase(簽名連結),
 * 完成後把公開 URL 塞進 hidden input(name="image_url")隨表單送出。
 * 目前用於:活動建立表單。
 */
export function UploadImageField({
  tenantSlug,
  folder,
  hint,
}: {
  tenantSlug: string;
  folder: 'classes';
  hint?: string;
}) {
  const [url, setUrl] = useState('');
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
      fd.append('folder', folder);
      fd.append('filename', file.name);
      const sign = await createAdminImageUploadUrl(fd);
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
            alt="圖片預覽"
            // 預覽用 4:5 裁切,跟 LINE 課程卡的顯示比例一致,傳完就能看出會被裁掉哪裡
            style={{ width: 90, aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 6, border: '1px solid #e4e4e7' }}
          />
          <button
            type="button"
            onClick={() => setUrl('')}
            style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ✕ 移除
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
      {hint && <span style={{ fontSize: 11, color: '#71717a' }}>{hint}</span>}
      {err && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{err}</span>}
    </div>
  );
}
