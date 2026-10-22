'use client';

import { useActionState, useState } from 'react';
import { Button, Input } from '@/lib/ui';
import { sendMagicLink, type MagicLinkState } from './actions';

type Props = {
  slug: string;
  /** 登入完成後回哪一頁(已經過 safeReturnTo) */
  returnTo: string;
  /** 沒設寄信金鑰時整段改成說明文字 */
  enabled: boolean;
};

/**
 * 信箱登入(Phase 26):輸入信箱 → 寄登入連結。寄出後同一個位置顯示「連結已寄到 …」。
 * 「換一個信箱」用 key 重掛表單,把 useActionState 的狀態歸零。
 */
export function EmailLoginForm({ slug, returnTo, enabled }: Props) {
  const [formKey, setFormKey] = useState(0);
  if (!enabled) {
    return <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>信箱登入尚未開通,請先用 LINE 或 Google 登入。</p>;
  }
  return <Inner key={formKey} slug={slug} returnTo={returnTo} onReset={() => setFormKey((k) => k + 1)} />;
}

function Inner({ slug, returnTo, onReset }: { slug: string; returnTo: string; onReset: () => void }) {
  const [state, formAction, pending] = useActionState<MagicLinkState, FormData>(sendMagicLink, null);

  if (state?.ok) {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          連結已寄到 <strong>{state.email}</strong>,打開信裡的連結就完成登入。
        </p>
        <p className="ui-muted" style={{ margin: 0 }}>沒收到的話,看一下垃圾信件匣。</p>
        <Button type="button" variant="link" size="xs" onClick={onReset} style={{ alignSelf: 'flex-start' }}>換一個信箱</Button>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
        <span>信箱</span>
        <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" />
      </label>
      <Button type="submit" variant="outline" size="md" disabled={pending}>
        {pending ? '寄送中…' : '寄登入連結'}
      </Button>
      {state?.ok === false && (
        <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, lineHeight: 1.6 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
