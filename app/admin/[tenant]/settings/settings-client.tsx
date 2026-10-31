'use client';

/**
 * 設定頁的小型 client 元件(2026-11-01):左側分頁導覽、送出鈕、複製鈕、滿額贈送法切換。
 * 版面與樣式在 settings-ui.tsx。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/lib/ui';
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
import { setGiftMode } from './actions';

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
