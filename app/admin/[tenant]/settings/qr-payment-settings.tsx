'use client';

import { useRef, useState } from 'react';
import { Button, Input, Switch } from '@/lib/ui';
import { IconBank, IconCheckCircle, IconChevronDown, IconCreditCard, IconUpload, IconWallet } from '@/lib/icons';
import { bankDisplayName, TW_BANKS, type BankTransfer } from '@/lib/bank-transfer';
import { FlashToast } from '../../../_components/toast';
import { Field, PanelTitle, SwitchRow } from './settings-ui';
import { removeQrPayment, saveQrPayment, updateTenantSettings, uploadQrPayment } from './actions';

export type Gateway = { key: string; name: string; desc: string; on: boolean };

type Props = {
  tenantSlug: string;
  bank: BankTransfer | null;
  /** 舊版一整段文字的匯款資訊,新欄位填好前客人還是看這段 */
  legacyPaymentInfo: string;
  qr: { enabled: boolean; image_url: string | null; label: string; note: string; link_url: string };
  gateways: Gateway[];
};

/**
 * 設定 → 收款(2026-11-01 改版;Peter:先分收款方式,一次列出來,沒設定的不會出現在結帳):
 * 每種收款方式一張卡 — 匯款、掃碼付款可以自己設定與開關;LINE Pay、綠界由 NEOP 開通,只顯示狀態。
 * 一個表單、一顆儲存:先存匯款欄位(updateTenantSettings 只動 bank_transfer),再存掃碼設定。
 * QR 圖片上傳 / 移除是獨立動作,馬上生效。
 */
export function PaymentSettings({ tenantSlug, bank, legacyPaymentInfo, qr, gateways }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(qr.image_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ts: number; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 卡片右側的狀態(Peter:設定好的打勾,要改再按編輯):看目前存的資料,不跟著表單即時變,儲存後頁面會重讀
  const bankStatus = bank
    ? bank.enabled
      ? { ok: true, text: '已設定' }
      : { ok: false, text: '已關閉' }
    : legacyPaymentInfo
      ? { ok: true, text: '舊格式' }
      : { ok: false, text: '未設定' };
  const qrStatus = qr.enabled && imageUrl
    ? { ok: true, text: '已設定' }
    : imageUrl
      ? { ok: false, text: '已關閉' }
      : { ok: false, text: '未設定' };
  const bankConfigured = !!bank || !!legacyPaymentInfo;

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
    setToast({ ts: Date.now(), text: '已儲存收款方式' });
  }

  return (
    <form action={save} className="sx-form">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <div className="sx-body">
        <PanelTitle title="收款方式" desc="客人結帳時能選的付款方式。設定好並打開的才會出現在結帳;匯款和掃碼由你自己核帳,線上金流自動對帳。" />

        <div className="sx-methods">
          {/* ── 匯款 ── */}
          <details className="sx-method">
            <summary>
              <span className="mic"><IconBank size={18} /></span>
              <span className="mt">
                <b>匯款(銀行轉帳)</b>
                <span>客人匯到你的帳戶,再到訂單頁回報後五碼,你核對入帳後確認收款。</span>
              </span>
              <span className={`mst${bankStatus.ok ? ' ok' : ''}`}>
                {bankStatus.ok && <IconCheckCircle size={16} />}
                {bankStatus.text}
              </span>
              <span className="act">{bankConfigured ? '編輯' : '設定'} <IconChevronDown size={14} /></span>
            </summary>
            <div className="body">
              <div className="sx-grid2">
                <Field label="銀行" htmlFor="bank-bank" hint="從清單選,或直接打名稱。">
                  <Input id="bank-bank" name="bank_bank" list="tw-banks" defaultValue={bank ? bankDisplayName(bank) : ''} placeholder="例:808 玉山銀行" maxLength={40} autoComplete="off" />
                  <datalist id="tw-banks">
                    {TW_BANKS.map((b) => (
                      <option key={b.code} value={`${b.code} ${b.name}`} />
                    ))}
                  </datalist>
                </Field>
                <Field label="帳號" htmlFor="bank-account" hint="只填數字,可以用連字號分段。">
                  <Input id="bank-account" name="bank_account" defaultValue={bank?.account ?? ''} placeholder="例:1234567890123" inputMode="numeric" maxLength={24} autoComplete="off" />
                </Field>
                <Field label="戶名" htmlFor="bank-holder">
                  <Input id="bank-holder" name="bank_holder" defaultValue={bank?.holder ?? ''} placeholder="例:王小明" maxLength={40} />
                </Field>
                <Field label="給客人的說明" optional htmlFor="bank-note">
                  <Input id="bank-note" name="bank_note" defaultValue={bank?.note ?? ''} placeholder="例:匯款後回訂單頁填後五碼,核帳後出貨" maxLength={200} />
                </Field>
              </div>
              <SwitchRow
                title="在結帳顯示匯款"
                desc="關掉的話客人結帳就看不到這個選項,資料會留著。"
                control={<Switch name="bank_enabled" defaultChecked={bank ? bank.enabled : !!legacyPaymentInfo} aria-label="在結帳顯示匯款" />}
              />
              {!bank && legacyPaymentInfo && (
                <div className="sx-callout" style={{ whiteSpace: 'pre-wrap' }}>
                  <span>
                    <strong>目前客人看到的是舊的文字版:</strong>
                    {'\n'}
                    {legacyPaymentInfo}
                    {'\n\n'}
                    把上面的欄位填好儲存後,就會改用新的格式,舊文字不再顯示。
                  </span>
                </div>
              )}
            </div>
          </details>

          {/* ── 掃碼付款 ── */}
          <details className="sx-method">
            <summary>
              <span className="mic"><IconWallet size={18} /></span>
              <span className="mt">
                <b>掃碼付款</b>
                <span>上傳你的收款 QR(LINE Pay 轉帳碼、街口、全支付都可以)。客人掃碼付款後按「我已付款」,你核帳。</span>
              </span>
              <span className={`mst${qrStatus.ok ? ' ok' : ''}`}>
                {qrStatus.ok && <IconCheckCircle size={16} />}
                {qrStatus.text}
              </span>
              <span className="act">{imageUrl ? '編輯' : '設定'} <IconChevronDown size={14} /></span>
            </summary>
            <div className="body">
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
              <SwitchRow
                title="在結帳顯示掃碼付款"
                desc="要先上傳 QR 才能打開。用不帶金額的靜態收款碼,客人付款時自己輸入金額。"
                control={<Switch name="enabled" defaultChecked={qr.enabled} aria-label="在結帳顯示掃碼付款" />}
              />
            </div>
          </details>

          {/* ── 線上金流:由 NEOP 開通,這裡只看狀態 ── */}
          {gateways.map((g) => (
            <details key={g.key} className="sx-method static">
              <summary onClick={(e) => e.preventDefault()}>
                <span className="mic"><IconCreditCard size={18} /></span>
                <span className="mt">
                  <b>{g.name}</b>
                  <span>{g.desc}</span>
                </span>
                <span className={`mst${g.on ? ' ok' : ''}`}>
                  {g.on && <IconCheckCircle size={16} />}
                  {g.on ? '已開通' : '未開通'}
                </span>
                <span className="act" style={{ color: '#a1a1aa' }}>由 NEOP 開通</span>
              </summary>
            </details>
          ))}
        </div>

        <p className="sx-hint" style={{ marginTop: 14 }}>
          線上金流之後會開放填自己的商店金鑰。想加其他收款方式請跟 NEOP 說。
        </p>

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
