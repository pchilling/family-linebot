'use client';

/**
 * 設定頁的小型 client 元件(2026-11-01):左側分頁導覽、送出鈕、複製鈕、滿額贈送法切換。
 * 版面與樣式在 settings-ui.tsx。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Input, Switch } from '@/lib/ui';
import { Field, SwitchRow } from './settings-ui';
import {
  IconCheck,
  IconCopy,
  IconGift,
  IconInfo,
  IconPalette,
  IconStore,
  IconTrash,
  IconTruck,
  IconWallet,
} from '@/lib/icons';
import { addDiscountCode, setDiscountCodeEnabled, setGiftMode, setGroupbuyFollowersOnly, type SettingsState } from './actions';

const ITEMS = [
  { href: '', label: '基本資料', icon: IconStore },
  { href: '/look', label: '外觀', icon: IconPalette },
  { href: '/payment', label: '收款', icon: IconWallet },
  { href: '/shipping', label: '配送', icon: IconTruck },
  { href: '/promo', label: '行銷', icon: IconGift },
  { href: '/about', label: '攤位資訊', icon: IconInfo },
];

export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/admin/${slug}/settings`;
  return (
    <nav className="sx-nav" aria-label="設定分頁">
      {ITEMS.map((it) => {
        const href = base + it.href;
        const active = it.href === '' ? pathname === base : pathname === href || pathname.startsWith(href + '/');
        const Icon = it.icon;
        return (
          <Link key={it.href} href={href} aria-current={active ? 'page' : undefined}>
            <Icon size={16} />
            {it.label}
          </Link>
        );
      })}
      <p className="sx-tip">方案、LINE Bot、改網址請聯繫 NEOP。</p>
    </nav>
  );
}

/** 表單送出鈕:送出中自動停用並換字(useFormStatus 要放在 form 裡面) */
export function SaveButton({
  children,
  pendingText = '儲存中…',
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** 清單列右側的刪除 icon 鈕,放在 <form action={...}> 裡;按下先 confirm */
export function DeleteIconButton({ confirmText, title = '刪除' }: { confirmText: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="sx-ib danger"
      title={title}
      aria-label={title}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <IconTrash size={15} />
    </button>
  );
}

export function CopyButton({ text, title = '複製' }: { text: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="sx-ib"
      title={title}
      aria-label={title}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}

function ModeSaving() {
  const { pending } = useFormStatus();
  return pending ? <span className="sx-hint">儲存中…</span> : null;
}

/** 滿額贈「多條門檻怎麼送」:兩個選項的分段控制,點了直接送出,不用另外按儲存 */
export function GiftModeControl({ slug, mode }: { slug: string; mode: 'stack' | 'highest' }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setGiftMode} className="sx-segwrap">
      <input type="hidden" name="tenant_slug" value={slug} />
      <div className="sx-seg" role="radiogroup" aria-label="多條門檻怎麼送">
        {[
          { key: 'stack', label: '累積式' },
          { key: 'highest', label: '擇高式' },
        ].map((m) => (
          <label key={m.key}>
            <input
              type="radio"
              name="mode"
              value={m.key}
              defaultChecked={mode === m.key}
              onChange={() => ref.current?.requestSubmit()}
            />
            {m.label}
          </label>
        ))}
      </div>
      <ModeSaving />
    </form>
  );
}

// ====================
// Phase 33(2026-11-06):折扣碼(設定 → 行銷)
// ====================

/** 折扣碼清單上的啟用開關:切了直接送出,不用另外按儲存(同 GiftModeControl) */
export function DiscountEnabledSwitch({ slug, id, enabled }: { slug: string; id: string; enabled: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setDiscountCodeEnabled} className="sx-segwrap">
      <input type="hidden" name="tenant_slug" value={slug} />
      <input type="hidden" name="id" value={id} />
      <Switch name="enabled" defaultChecked={enabled} aria-label="啟用" onChange={() => ref.current?.requestSubmit()} />
      <ModeSaving />
    </form>
  );
}

// ====================
// Phase 35(2026-11-07):團購只給追蹤這家店的人看(設定 → 行銷 → 團購)
// ====================

/** 開關切了直接送出,不用另外按儲存(同 DiscountEnabledSwitch) */
export function GroupbuyFollowersOnlySwitch({ slug, enabled }: { slug: string; enabled: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setGroupbuyFollowersOnly} className="sx-segwrap">
      <input type="hidden" name="tenant_slug" value={slug} />
      <Switch name="enabled" defaultChecked={enabled} aria-label="團購只給追蹤這家店的人看" onChange={() => ref.current?.requestSubmit()} />
      <ModeSaving />
    </form>
  );
}

const fmtMoney = (n: number) => n.toLocaleString('en-US');

/**
 * 新增折扣碼表單。錯誤留在表單內(.sx-err),成功後用 state.ts 當 key 重掛一次把欄位清空。
 * 即時預覽句是防「想打 9 折卻填 90」的主要手段,所以 label 不只寫「折扣 %」。
 */
export function DiscountCodeForm({ slug }: { slug: string }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(addDiscountCode, { status: 'idle' });
  const key = state.status === 'success' ? state.ts : 0;
  return (
    <form key={key} action={formAction} className="sx-dash">
      <input type="hidden" name="tenant_slug" value={slug} />
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>新增折扣碼</div>
      {state.status === 'error' && <div className="sx-err" role="alert">{state.error}</div>}
      {state.status === 'success' && <span className="sx-hint" style={{ color: '#15803d' }}>已新增折扣碼,清單在上面。</span>}
      <DiscountCodeFields />
      <SwitchRow
        title="每位客人限用一次"
        desc="以收件電話判斷;取消、退款的訂單不算用過。"
        control={<Switch name="per_customer_once" aria-label="每位客人限用一次" />}
      />
      <div>
        <SaveButton pendingText="新增中…">新增折扣碼</SaveButton>
      </div>
    </form>
  );
}

/** 表單欄位拆開放,key 重掛時 state 一起歸零 */
function DiscountCodeFields() {
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [valueText, setValueText] = useState('');
  const [minText, setMinText] = useState('');
  const value = /^\d+$/.test(valueText) ? Number(valueText) : null;
  const minSubtotal = /^\d+$/.test(minText) ? Number(minText) : null;
  const isPercent = type === 'percent';

  // 預覽句:percent 以買 NT$ 1,000 為例;fixed 直接算付多少
  let preview: ReactNode = null;
  if (value !== null && value > 0) {
    if (isPercent && value <= 99) {
      const zhe = (100 - value) / 10;
      const zheText = Number.isInteger(zhe) ? `${zhe}` : zhe.toFixed(1);
      preview = (
        <span style={{ color: value >= 50 ? '#b45309' : undefined }}>
          便宜 {value}%:客人買 NT$ 1,000 省 NT$ {fmtMoney(value * 10)},等於打 {zheText} 折{value >= 50 ? ',超過五折,確認一下' : ''}
        </span>
      );
    } else if (!isPercent) {
      preview = <span>客人買 NT$ 1,000 付 NT$ {fmtMoney(Math.max(0, 1000 - value))}</span>;
    }
  }
  const zeroWarn = !isPercent && value !== null && value > 0 && (minSubtotal === null || minSubtotal <= value);

  return (
    <>
      <div className="sx-grid4">
        <Field label="折扣碼" htmlFor="dc-code" hint="3 到 20 位英文或數字,會存成大寫;客人輸入不分大小寫。建議至少 6 位、別用 SALE / VIP 這類一猜就中的字">
          <Input
            id="dc-code"
            name="code"
            required
            maxLength={20}
            pattern="[A-Za-z0-9]{3,20}"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="sx-mono"
            style={{ textTransform: 'uppercase' }}
            placeholder="WELCOME100"
            title="3 到 20 位英文或數字"
          />
        </Field>
        <Field label="折扣方式">
          <div className="sx-seg" role="radiogroup" aria-label="折扣方式" style={{ alignSelf: 'flex-start' }}>
            {([
              { key: 'percent', label: '打折(%)' },
              { key: 'fixed', label: '折固定金額' },
            ] as const).map((m) => (
              <label key={m.key}>
                <input type="radio" name="type" value={m.key} checked={type === m.key} onChange={() => setType(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label={isPercent ? '便宜幾 %' : '折抵金額(NT$)'} htmlFor="dc-value">
          <Input
            id="dc-value"
            name="value"
            type="number"
            required
            min={1}
            max={isPercent ? 99 : 9999999}
            step={1}
            inputMode="numeric"
            placeholder={isPercent ? '10' : '100'}
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
          />
        </Field>
        <Field label="最低消費" optional htmlFor="dc-min" hint="以折扣前的商品小計算">
          <Input
            id="dc-min"
            name="min_subtotal"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="不限"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
          />
        </Field>
      </div>
      {preview && <span className="sx-hint">{preview}</span>}
      {zeroWarn && (
        <span className="sx-hint" style={{ color: '#b45309' }}>
          沒設最低消費,商品小計低於 NT$ {fmtMoney(value ?? 0)} 的訂單會折到 0 元,客人會看到不能用
        </span>
      )}
      <div className="sx-grid4">
        <Field label="開始日" optional htmlFor="dc-starts" hint="留空 = 現在就能用,台北時間">
          <Input id="dc-starts" name="starts_at" type="date" />
        </Field>
        <Field label="結束日" optional htmlFor="dc-ends" hint="留空 = 不限;結束日當天整天都能用">
          <Input id="dc-ends" name="ends_at" type="date" />
        </Field>
        <Field label="總可用次數" optional htmlFor="dc-max" hint="所有客人加起來;用完自動變已用完">
          <Input id="dc-max" name="max_uses" type="number" min={1} step={1} inputMode="numeric" placeholder="不限" />
        </Field>
        <div />
      </div>
    </>
  );
}
