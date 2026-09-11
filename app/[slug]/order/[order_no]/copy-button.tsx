'use client';

import { useState } from 'react';

type Props = {
  text: string;
  label?: string; // 按鈕文字,預設「複製」
  big?: boolean; // 2026-09-11:匯款帳號用整排大按鈕
};

export function CopyButton({ text, label, big }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      // navigator.clipboard 需要 https 或 localhost
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback:某些舊瀏覽器
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

  const style: React.CSSProperties = big
    ? {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.7rem 1rem',
        background: copied ? '#10b981' : '#111827',
        color: '#fff',
        border: 0,
        borderRadius: 8,
        fontSize: '0.9375rem',
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }
    : {
        marginLeft: 8,
        padding: '3px 9px',
        background: copied ? '#10b981' : '#ffffff',
        color: copied ? '#ffffff' : '#166534',
        border: `1px solid ${copied ? '#10b981' : '#bbf7d0'}`,
        borderRadius: 4,
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: 'pointer',
        verticalAlign: 'baseline',
        fontFamily: 'inherit',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      };

  return (
    <button type="button" onClick={handleCopy} style={style}>
      {copied ? '✓ 已複製' : (label ?? '複製')}
    </button>
  );
}
