'use client';

import { useState } from 'react';

type Props = {
  text: string;
};

export function CopyButton({ text }: Props) {
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

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
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
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      {copied ? '✓ 已複製' : '📋 複製'}
    </button>
  );
}
