'use client';

import { useRef, useState } from 'react';
import { Badge, Button, Input, Switch, Textarea } from '@/lib/ui';
import { IconCheck, IconUpload } from '@/lib/icons';
import { FlashToast } from '../../../_components/toast';
import { Field, GroupHead, PanelTitle, SwitchRow } from './settings-ui';
import { removeQrPayment, saveQrPayment, updateTenantSettings, uploadQrPayment } from './actions';

export type Gateway = { key: string; name: string; desc: string; on: boolean };

type Props = {
  tenantSlug: string;
  paymentInfo: string;
  qr: { enabled: boolean; image_url: string | null; label: string; note: string; link_url: string };
  gateways: Gateway[];
};

/**
 * 設定 → 收款(2026-11-01 改版):匯款資訊 + 掃碼付款(Phase 27)+ 線上金流狀態,
 * 一個表單、一顆儲存:先存匯款文字(updateTenantSettings 只動 payment_info),再存掃碼設定。
 * QR 圖片上傳 / 移除是獨立動作,馬上生效。
 */
export function PaymentSettings({ tenantSlug, paymentInfo, qr, gateways }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(qr.image_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ts: number; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set('tenant_slug', tenantSlug);
    fd.set('file', file);
    const r = await uploadQrPayment(fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (r.ok) {
      setImageUrl(r.url);
      setToast({ ts: Date.now(), text: 'QR 已上傳' });
    } else {
      setError(r.error);
    }
  }

  async function onRemove() {
    if (!window.confirm('移除 QR 與掃碼設定?結帳就不會再出現「掃碼付款」。')) return;
    const r = await removeQrPayment(tenantSlug);
    if (r.ok) {
      setImageUrl(null);
      setToast({ ts: Date.now(), text: '已移除掃碼付款' });
    } else {
      setError(r.error);
    }
  }

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    const a = await updateTenantSettings({ status: 'idle' }, formData);
    if (a.status === 'error') {
      setSaving(false);
      setError(a.error);
      return;
    }
    const b = await saveQrPayment(formData);
    setSaving(false);
    if (!b.ok) {
      setError(b.error);
      return;
    }
    setToast({ ts: Date.now(), text: '已儲存收款設定' });
  }

  return (
    <form action={save} className="sx-form">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <div className="sx-body">
        <PanelTitle title="收款" desc="客人結帳時能選的付款方式。匯款和掃碼付款由你自己核帳,線上金流會自動對帳。" />

        <div className="sx-group">
          <GroupHead
            title="匯款"
            desc="訂單成立後客人會立刻看到這段。寫清楚銀行、帳號、戶名與後續流程;留空就不提供匯款。"
            right={
              paymentInfo ? (
                <Badge className="sx-badge-ok">
                  <IconCheck size={12} />
                  開放中
                </Badge>
              ) : (
                <Badge className="sx-badge-off">未設定</Badge>
              )
            }
          />
          <Textarea
            name="payment_info"
            rows={5}
            defaultValue={paymentInfo}
            placeholder={'玉山銀行(808)\n帳號:1234-5678-9012-345\n戶名:王小明\n\n匯款後請回到訂單頁填帳號後五碼,我們會盡快對帳出貨。'}
            aria-label="匯款資訊"
          />
        </div>

        <hr className="sx-sep" />

        <div className="sx-group">
          <SwitchRow
            title="掃碼付款"
            desc="上傳你的收款 QR(LINE Pay 轉帳碼、街口、全支付都可以)。客人掃碼付款後按「我已付款」,你在訂單頁核帳。要用不帶金額的靜態收款碼。"
            control={<Switch name="enabled" defaultChecked={qr.enabled} aria-label="開放掃碼付款" />}
          />
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="收款 QR" className="sx-qr" />
              ) : (
                <div className="sx-qr">
                  還沒上傳
                  <br />
                  收款 QR
                </div>
              )}
              <label className="ui-btn ui-btn-outline ui-btn-sm sx-filebtn">
                <IconUpload size={14} />
                {uploading ? '上傳中…' : imageUrl ? '更換 QR' : '上傳 QR'}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} disabled={uploading} />
              </label>
              {imageUrl && (
                <Button type="button" variant="link" size="xs" onClick={onRemove}>
                  移除 QR
                </Button>
              )}
            </div>
            <div className="sx-group" style={{ flex: 1, minWidth: 240 }}>
              <div className="sx-grid2">
                <Field label="顯示名稱" htmlFor="qr-label" hint="結帳選項上的字,寫清楚是哪個 App。">
                  <Input id="qr-label" name="label" defaultValue={qr.label} placeholder="例:LINE Pay 轉帳碼" maxLength={30} />
                </Field>
                <Field label="付款連結" optional htmlFor="qr-link" hint="手機上可以直接點開付款,不用掃自己的螢幕。">
                  <Input id="qr-link" name="link_url" defaultValue={qr.link_url} placeholder="https://" />
                </Field>
              </div>
              <Field label="給客人的說明" optional htmlFor="qr-note">
                <Input id="qr-note" name="note" defaultValue={qr.note} placeholder="例:轉帳備註請填訂單編號,付完按「我已付款」" maxLength={120} />
              </Field>
            </div>
          </div>
        </div>

        <hr className="sx-sep" />

        <div className="sx-group">
          <GroupHead title="線上金流" desc="由 NEOP 代為開通,付款完成自動標記已付款。之後會開放填自己的商店金鑰。" />
          <div className="sx-list">
            {gateways.map((g) => (
              <div key={g.key} className="sx-li">
                <div className="main">
                  <div className="t">{g.name}</div>
                  <div className="d">{g.desc}</div>
                </div>
                {g.on ? (
                  <Badge className="sx-badge-ok">
                    <IconCheck size={12} />
                    已開通
                  </Badge>
                ) : (
                  <Badge className="sx-badge-off">未開通</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div className="sx-err" style={{ marginTop: 16 }}>{error}</div>}
      </div>

      {toast && <FlashToast key={toast.ts} message={toast.text} />}

      <div className="sx-foot">
        <span className="sx-note">QR 圖片上傳後立即生效,其他要按儲存。</span>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? '儲存中…' : '儲存變更'}
        </Button>
      </div>
    </form>
  );
}
