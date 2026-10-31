'use client';

import { useRef, useState } from 'react';
import { removeQrPayment, saveQrPayment, uploadQrPayment } from './actions';

type Props = {
  tenantSlug: string;
  current: { enabled: boolean; image_url: string | null; label: string; note: string; link_url: string };
};

const input: React.CSSProperties = {
  padding: 9,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 5,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: '#fff',
};
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', fontWeight: 500 };
const hint: React.CSSProperties = { fontSize: 12, color: '#888', marginTop: 2 };

/**
 * 掃碼付款設定(Phase 27):上傳收款 QR、標籤、說明、付款連結、開關。
 * 圖片上傳與文字儲存是兩個獨立的 action,上傳完不用再按儲存。
 */
export function QrPaymentSettings({ tenantSlug, current }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(current.image_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('tenant_slug', tenantSlug);
    fd.set('file', file);
    const r = await uploadQrPayment(fd);
    setUploading(false);
    if (r.ok) {
      setImageUrl(r.url);
      setMsg({ ok: true, text: 'QR 已上傳,記得確認下面的開關是開的' });
    } else {
      setMsg({ ok: false, text: r.error });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onSave(formData: FormData) {
    setSaving(true);
    setMsg(null);
    const r = await saveQrPayment(formData);
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: '已儲存' } : { ok: false, text: r.error });
  }

  async function onRemove() {
    if (!window.confirm('移除 QR 與設定?結帳會不再出現「掃碼付款」。')) return;
    const r = await removeQrPayment(tenantSlug);
    if (r.ok) {
      setImageUrl(null);
      setMsg({ ok: true, text: '已移除' });
    } else {
      setMsg({ ok: false, text: r.error });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 160, height: 160, border: '1px dashed #d4d4d8', borderRadius: 8, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="收款 QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', padding: 12 }}>還沒上傳<br />收款 QR</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={uploading} style={{ fontSize: 13 }} />
          <span style={hint}>
            把 LINE Pay、街口、全支付等 App 裡的「收款碼」截圖或匯出的圖片直接上傳,PNG / JPG,3MB 以內。
            <br />
            要用「不帶金額」的靜態收款碼,客人付款時自己輸入金額;帶金額的碼是一次性的,不能用。
          </span>
          {uploading && <span style={{ fontSize: 13, color: '#71717a' }}>上傳中…</span>}
          {imageUrl && (
            <button type="button" onClick={onRemove} style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 5, cursor: 'pointer' }}>
              移除 QR 與設定
            </button>
          )}
        </div>
      </div>

      <form action={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="tenant_slug" value={tenantSlug} />
        <label style={label}>
          <span style={labelText}>顯示名稱</span>
          <input name="label" defaultValue={current.label} placeholder="例:LINE Pay 轉帳" maxLength={30} style={input} />
          <span style={hint}>客人在結帳和訂單頁看到的名稱,寫清楚是哪個 App</span>
        </label>
        <label style={label}>
          <span style={labelText}>付款說明(選填)</span>
          <input name="note" defaultValue={current.note} placeholder="例:轉帳備註請填訂單編號,付完按「我已付款」" maxLength={120} style={input} />
        </label>
        <label style={label}>
          <span style={labelText}>付款連結(選填)</span>
          <input name="link_url" defaultValue={current.link_url} placeholder="https://…(App 給的收款連結,手機上會變成一顆「開啟付款」按鈕)" style={input} />
          <span style={hint}>手機掃不到自己的螢幕,有連結的話手機客人會方便很多;沒有也沒關係,頁面會教他長按存圖再用 App 讀取</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" name="enabled" defaultChecked={current.enabled} />
          在結帳顯示「掃碼付款」
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" disabled={saving} style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, border: 0, borderRadius: 6, background: saving ? '#a1a1aa' : '#18181b', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '儲存中…' : '儲存掃碼付款設定'}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.text}</span>}
        </div>
      </form>
    </div>
  );
}
