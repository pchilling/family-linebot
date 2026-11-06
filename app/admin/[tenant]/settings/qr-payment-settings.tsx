'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Switch } from '@/lib/ui';
import { IconAlert, IconBank, IconCheckCircle, IconChevronDown, IconCreditCard, IconInfo, IconUpload, IconWallet } from '@/lib/icons';
import { bankDisplayName, TW_BANKS, type BankTransfer } from '@/lib/bank-transfer';
import { FlashToast } from '../../../_components/toast';
import { Field, PanelTitle, SwitchRow } from './settings-ui';
import { SaveButton } from './settings-client';
import {
  clearPaymentGatewayKeys,
  importPaymentGatewayFromEnv,
  removeQrPayment,
  savePaymentGatewayKeys,
  saveQrPayment,
  updateTenantSettings,
  uploadQrPayment,
  type SettingsState,
} from './actions';

/**
 * Phase 34(2026-11-06):線上金流卡片的資料,由 payment/page.tsx 在 server 算好。
 * 只有 flag / 狀態 / 遮罩字串 / 明文 id / 布林 / 日期 — 永遠不含明文金鑰或密文。
 */
export type GatewayCard = {
  key: 'linepay' | 'ecpay';
  name: string;
  desc: string;
  /** features.line_pay / features.ecpay(方案權限,NEOP 開) */
  flag: boolean;
  /** off = flag 沒開;empty = 沒金鑰;env = 走 NEOP 環境變數退路;db = 攤位自己的;broken = DB 有但解不開 */
  state: 'off' | 'empty' | 'env' | 'db' | 'broken';
  brokenCode?: 'no_key' | 'bad_key' | 'bad_format' | 'auth_failed';
  /** 明文 channel_id / merchant_id(非敏感,全碼) */
  id: string | null;
  /** 敏感欄位的遮罩字串(只露最後 4 碼) */
  masked: Record<string, string>;
  source: 'form' | 'env_import' | null;
  updatedAt: string | null;
  sandbox: boolean;
  /** 超級管理員 && 預設攤位 && state === 'env' */
  canImport: boolean;
  /** PAYMENT_CONFIG_KEY 有設好 */
  secretBoxReady: boolean;
};

type Props = {
  tenantSlug: string;
  bank: BankTransfer | null;
  /** 舊版一整段文字的匯款資訊,新欄位填好前客人還是看這段 */
  legacyPaymentInfo: string;
  qr: { enabled: boolean; image_url: string | null; label: string; note: string; link_url: string };
  gateways: GatewayCard[];
};

/**
 * 設定 → 收款(2026-11-01 改版;Peter:先分收款方式,一次列出來,沒設定的不會出現在結帳):
 * 每種收款方式一張卡 — 匯款、掃碼付款可以自己設定與開關;LINE Pay、綠界(Phase 34)填攤位自己的金鑰。
 * 版面:外層是 div,匯款 + 掃碼兩張卡包在 <form id="pay-main">,底部「儲存變更」用 form 屬性掛回去;
 * LINE Pay / 綠界卡片各自有自己的 <form>,金鑰欄位不會跟「儲存變更」一起送出,也避免巢狀 form。
 * QR 圖片上傳 / 移除、金流金鑰的動作是獨立動作,馬上生效。
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
    <div className="sx-form">
      <div className="sx-body">
        <PanelTitle title="收款方式" desc="客人結帳時能選的付款方式。設定好並打開的才會出現在結帳;匯款和掃碼由你自己核帳,線上金流自動對帳。" />

        <div className="sx-methods">
          {/* 匯款 + 掃碼共用一個表單、一顆「儲存變更」(在底部用 form 屬性掛回來) */}
          <form id="pay-main" action={save} style={{ display: 'contents' }}>
            <input type="hidden" name="tenant_slug" value={tenantSlug} />

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
          </form>

          {/* ── 線上金流(Phase 34):每攤位自己的金鑰,各自一張卡、各自的表單 ── */}
          {gateways.map((g) => (
            <GatewayCardView
              key={g.key}
              tenantSlug={tenantSlug}
              g={g}
              onToast={(text) => setToast({ ts: Date.now(), text })}
              onError={(msg) => setError(msg)}
            />
          ))}
        </div>

        <p className="sx-hint" style={{ marginTop: 14 }}>
          LINE Pay、綠界的密鑰只存加密後的版本,存好後只看得到最後 4 碼,請自己留底。要開通新的金流請跟 NEOP 說。
        </p>

        {error && <div className="sx-err" style={{ marginTop: 16 }}>{error}</div>}
      </div>

      {toast && <FlashToast key={toast.ts} message={toast.text} />}

      <div className="sx-foot">
        <span className="sx-note">QR 圖片與金流金鑰的動作立即生效;匯款、掃碼的欄位要按儲存。</span>
        <Button type="submit" form="pay-main" size="sm" disabled={saving}>
          {saving ? '儲存中…' : '儲存變更'}
        </Button>
      </div>
    </div>
  );
}

// ====================
// Phase 34:線上金流卡片(五態:off / empty / env / db / broken)
// ====================

/** 每個金流的欄位名稱與說明文案(表單欄位 name 要跟 settings/actions.ts 的 savePaymentGatewayKeys 對上) */
const GATEWAY_META = {
  linepay: {
    idLabel: 'Channel ID(通路 ID)',
    idShort: 'Channel ID',
    idName: 'channel_id',
    idMax: 20,
    secrets: [{ name: 'channel_secret', label: 'Channel Secret(通路密鑰)', short: 'Channel Secret', hint: '英數字,存好後只顯示最後 4 碼', max: 64 }],
    howTo:
      '到 LINE Pay 商家中心(pay.line.me)→ 左側「管理連結金鑰」,輸入商家中心密碼後會看到 Channel ID 與 Channel Secret Key。商家中心要先通過審核(需要公司統編)。「IP 白名單」請留空。',
    envNames: 'LINEPAY_CHANNEL_ID / LINEPAY_CHANNEL_SECRET',
    clearConfirm:
      '清除 LINE Pay 金鑰?\n\n結帳會立刻不再出現 LINE Pay。還沒付款的 LINE Pay 訂單會付不成、LINE Pay 之後送來的通知會對不到帳,已付款的訂單也無法從後台退款,直到重新填入。',
  },
  ecpay: {
    idLabel: '特店編號(MerchantID)',
    idShort: '特店編號',
    idName: 'merchant_id',
    idMax: 10,
    secrets: [
      { name: 'hash_key', label: 'HashKey', short: 'HashKey', hint: '16 碼英數', max: 16 },
      { name: 'hash_iv', label: 'HashIV', short: 'HashIV', hint: '16 碼英數', max: 16 },
    ],
    howTo:
      '到綠界廠商後台(vendor.ecpay.com.tw)→ 系統開發管理 → 系統介接設定 → 「金流、MPOS」那一列,複製 HashKey 與 HashIV;特店編號(MerchantID)登入後頁面上方就看得到。個人會員也能申請。「允許的 IP」請留空。',
    envNames: 'ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV',
    clearConfirm:
      '清除綠界金鑰?\n\n結帳會立刻不再出現信用卡,ATM 虛擬帳號也會一起停。還沒付款的綠界訂單會付不成、綠界之後送來的通知會對不到帳,已付款的訂單也無法從後台退款,直到重新填入。',
  },
} as const;

function taipeiDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' });
}

function GatewayCardView({
  tenantSlug,
  g,
  onToast,
  onError,
}: {
  tenantSlug: string;
  g: GatewayCard;
  onToast: (text: string) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const meta = GATEWAY_META[g.key];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // A. flag 沒開:靜態卡,不渲染任何 input
  if (g.state === 'off') {
    return (
      <details className="sx-method static">
        <summary onClick={(e) => e.preventDefault()}>
          <span className="mic"><IconCreditCard size={18} /></span>
          <span className="mt">
            <b>{g.name}</b>
            <span>{g.desc}</span>
          </span>
          <span className="mst">未開通</span>
          <span className="act" style={{ color: '#a1a1aa' }}>請聯繫 NEOP 開通</span>
        </summary>
      </details>
    );
  }

  const hasKeys = g.state === 'db' || g.state === 'env';

  async function onClear() {
    if (!window.confirm(meta.clearConfirm)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('tenant_slug', tenantSlug);
    fd.set('gateway', g.key);
    const r = await clearPaymentGatewayKeys(fd);
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      onToast(`已清除 ${g.name} 金鑰`);
      router.refresh();
    } else {
      onError(r.error);
    }
  }

  async function onImport() {
    if (!window.confirm(`把環境變數的 ${g.name} 金鑰匯入這個攤位?匯入後以攤位存的為準。`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('tenant_slug', tenantSlug);
    fd.set('gateway', g.key);
    const r = await importPaymentGatewayFromEnv(fd);
    setBusy(false);
    if (r.ok) {
      onToast(`已匯入 ${g.name} 金鑰,可以到 Vercel 刪掉環境變數了`);
      router.refresh();
    } else {
      onError(r.error);
    }
  }

  const statusEl =
    g.state === 'broken' ? (
      <span className="mst warn"><IconAlert size={16} />無法讀取</span>
    ) : hasKeys ? (
      <span className="mst ok"><IconCheckCircle size={16} />{g.state === 'env' ? '已設定(NEOP 代管)' : '已設定'}</span>
    ) : (
      <span className="mst">未設定</span>
    );
  const actText = g.state === 'broken' ? '處理' : hasKeys ? '編輯' : '設定';

  return (
    <details className="sx-method">
      <summary>
        <span className="mic"><IconCreditCard size={18} /></span>
        <span className="mt">
          <b>{g.name}</b>
          <span>{g.desc}</span>
        </span>
        {statusEl}
        <span className="act">{actText} <IconChevronDown size={14} /></span>
      </summary>
      <div className="body">
        {/* B. 沒金鑰:說明去哪裡抄 + 表單 */}
        {g.state === 'empty' && (
          <>
            {g.secretBoxReady ? (
              <div className="sx-callout">
                <IconInfo size={16} />
                <span>{meta.howTo}</span>
              </div>
            ) : (
              <div className="sx-err" role="alert">NEOP 尚未設定加密金鑰,暫時無法儲存金流金鑰。請聯繫 NEOP。</div>
            )}
            <GatewayKeyForm tenantSlug={tenantSlug} g={g} submitText={`儲存 ${g.name} 金鑰`} onSaved={() => onToast(`已儲存 ${g.name} 金鑰`)} />
          </>
        )}

        {/* E. DB 有但解不開 */}
        {g.state === 'broken' && (
          <div className="sx-callout warn">
            <IconAlert size={16} />
            <span>
              {g.brokenCode === 'no_key' || g.brokenCode === 'bad_key'
                ? 'NEOP 尚未設定(或設錯)加密金鑰,所以存好的金鑰暫時解不開。請聯繫 NEOP,不用重填。'
                : '存的金鑰解不開,通常是 NEOP 的加密金鑰換過了。請重新填一次;不確定的話先聯繫 NEOP。'}
              {' '}結帳暫時不會出現這個付款方式。
            </span>
          </div>
        )}

        {/* C. 有金鑰:遮罩後的值 + 來源 */}
        {hasKeys && (
          <>
            <dl className="sx-dl">
              <dt>{meta.idShort}</dt>
              <dd><span className="sx-mono">{g.id ?? '—'}</span></dd>
              {meta.secrets.map((s) => (
                <SecretRow key={s.name} label={s.short} value={g.masked[s.name]} />
              ))}
              <dt>來源</dt>
              <dd>
                {g.state === 'db' ? (
                  <span className="sx-chip">
                    {g.source === 'env_import' ? '由 NEOP 匯入' : '這個攤位自己的金鑰'}
                    {g.updatedAt ? ` · ${taipeiDate(g.updatedAt)}` : ''}
                  </span>
                ) : (
                  <span className="sx-chip">NEOP 環境變數(過渡期)</span>
                )}
              </dd>
            </dl>
            {g.state === 'env' && (
              <p className="sx-hint" style={{ margin: 0 }}>
                目前由 NEOP 代管,之後會換成你自己的金鑰。存了自己的金鑰後就不再用代管的那組。
              </p>
            )}
          </>
        )}

        {g.sandbox && (g.state === 'db' || g.state === 'env' || g.state === 'broken') && (
          <p className="sx-hint" style={{ margin: 0 }}>本機沙盒模式開著,結帳走測試站,不用這裡的金鑰。</p>
        )}

        {/* 操作列(有金鑰或 broken 才有) */}
        {(hasKeys || g.state === 'broken') && !editing && (
          <div className="sx-gw-ops">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
              更換金鑰
            </Button>
            {g.state !== 'env' && (
              <Button type="button" variant="link" size="xs" disabled={busy} onClick={onClear}>
                清除
              </Button>
            )}
            {g.canImport && (
              <Button type="button" variant="outline" size="sm" disabled={busy || !g.secretBoxReady} onClick={onImport}>
                把環境變數的金鑰匯入這個攤位
              </Button>
            )}
          </div>
        )}
        {g.canImport && !editing && (
          g.secretBoxReady ? (
            <p className="sx-hint" style={{ margin: 0 }}>
              匯入後這個攤位改用資料庫裡的金鑰,Vercel 上的 {meta.envNames} 就可以刪掉。只有超級管理員看得到這顆。
            </p>
          ) : (
            <div className="sx-err" role="alert">NEOP 尚未設定加密金鑰(PAYMENT_CONFIG_KEY),設好後才能匯入。</div>
          )
        )}

        {/* 更換金鑰:同一個 body 下方顯示空表單 */}
        {(hasKeys || g.state === 'broken') && editing && (
          <>
            <div className="sx-callout warn">
              <IconAlert size={16} />
              <span>
                新金鑰會直接取代舊的,存了就不能復原。已發動但還沒付完的訂單會對不到帳、已付款的舊訂單若換到不同商家帳號會無法退款;請在沒有進行中付款時更換。
              </span>
            </div>
            {!g.secretBoxReady && (
              <div className="sx-err" role="alert">NEOP 尚未設定加密金鑰,暫時無法儲存金流金鑰。請聯繫 NEOP。</div>
            )}
            <GatewayKeyForm
              tenantSlug={tenantSlug}
              g={g}
              submitText="儲存新金鑰"
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                onToast(`已儲存 ${g.name} 金鑰`);
              }}
            />
          </>
        )}
      </div>
    </details>
  );
}

function SecretRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <>
      <dt>{label}</dt>
      <dd><span className="sx-mono sx-mask">{value ?? '—'}</span></dd>
    </>
  );
}

/**
 * 金鑰表單(useActionState)。成功後用 key 重掛清空欄位;server 永遠不回傳值。
 * React 19 的 <form action> 在 action 開始時就會 requestFormReset,不管結果成功或失敗都重設 uncontrolled 欄位:
 * 非敏感的 id 欄(channel_id / merchant_id)改成 controlled,錯誤後留著不用重打;
 * 密鑰 input 維持 type=password、不設 defaultValue、不用 controlled state,錯誤時要重貼(表單 hint 有提醒)。
 */
function GatewayKeyForm({
  tenantSlug,
  g,
  submitText,
  onCancel,
  onSaved,
}: {
  tenantSlug: string;
  g: GatewayCard;
  submitText: string;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const meta = GATEWAY_META[g.key];
  const [state, formAction] = useActionState<SettingsState, FormData>(savePaymentGatewayKeys, { status: 'idle' });
  const lastTs = useRef(0);
  const disabled = !g.secretBoxReady;
  // 非敏感 id 欄 controlled:驗證失敗後值留著(成功後整個表單 key 重掛,state 一起歸零)
  const [idValue, setIdValue] = useState('');

  useEffect(() => {
    if (state.status === 'success' && state.ts !== lastTs.current) {
      lastTs.current = state.ts;
      onSaved();
    }
  }, [state, onSaved]);

  const formKey = state.status === 'success' ? state.ts : 0;
  const idInputId = `${g.key}-${meta.idName}`;

  return (
    <form key={formKey} action={formAction} className="sx-group" autoComplete="off">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <input type="hidden" name="gateway" value={g.key} />
      {state.status === 'error' && <div className="sx-err" role="alert">{state.error}</div>}

      {g.key === 'linepay' ? (
        <div className="sx-grid2">
          <Field label={meta.idLabel} htmlFor={idInputId} hint="數字">
            <Input id={idInputId} name={meta.idName} className="sx-mono" required maxLength={meta.idMax} autoComplete="off" inputMode="numeric" disabled={disabled} value={idValue} onChange={(e) => setIdValue(e.target.value)} />
          </Field>
          {meta.secrets.map((s) => (
            <Field key={s.name} label={s.label} htmlFor={`${g.key}-${s.name}`} hint={s.hint}>
              <Input
                id={`${g.key}-${s.name}`}
                name={s.name}
                type="password"
                className="sx-mono"
                required
                maxLength={s.max}
                autoComplete="new-password"
                spellCheck={false}
                autoCapitalize="off"
                disabled={disabled}
              />
            </Field>
          ))}
        </div>
      ) : (
        <>
          <Field label={meta.idLabel} htmlFor={idInputId} hint="數字">
            <Input id={idInputId} name={meta.idName} className="sx-mono" required maxLength={meta.idMax} autoComplete="off" inputMode="numeric" disabled={disabled} value={idValue} onChange={(e) => setIdValue(e.target.value)} />
          </Field>
          <div className="sx-grid2">
            {meta.secrets.map((s) => (
              <Field key={s.name} label={s.label} htmlFor={`${g.key}-${s.name}`} hint={s.hint}>
                <Input
                  id={`${g.key}-${s.name}`}
                  name={s.name}
                  type="password"
                  className="sx-mono"
                  required
                  maxLength={s.max}
                  autoComplete="new-password"
                  spellCheck={false}
                  autoCapitalize="off"
                  disabled={disabled}
                />
              </Field>
            ))}
          </div>
        </>
      )}

      <div className="sx-gw-ops">
        <SaveButton disabled={disabled}>{submitText}</SaveButton>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
      <p className="sx-hint" style={{ margin: 0 }}>存好後只會顯示最後 4 碼,之後看不到完整值,請自己留底。送出後若有錯誤,密鑰欄會清空、要重貼一次。</p>
    </form>
  );
}
