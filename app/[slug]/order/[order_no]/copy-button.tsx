'use client';

import { useState } from 'react';

type Props = {
  text: string;
  label?: string; // 按鈕文字,預設「複製」
  big?: boolean; // 匯款帳號用整排按鈕
};

/** 一鍵複製(2026-10-23 樣式對齊共用元件:小的是 xs outline,大的是 md outline 滿版) */
export function CopyButton({ text, label, big }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      // navigator.clipboard 需要 https 或 localhost
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 失敗就不要狀態變更,讓使用者重試
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={big ? 'ui-btn ui-btn-outline ui-btn-md ui-num' : 'ui-btn ui-btn-outline ui-btn-xs ui-num'}
      style={big ? { width: '100%' } : { marginLeft: 8, verticalAlign: 'middle' }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          已複製
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          {label ?? '複製'}
        </>
      )}
    </button>
  );
}
