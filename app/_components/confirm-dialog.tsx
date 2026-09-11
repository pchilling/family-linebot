'use client';

import { useEffect } from 'react';

/**
 * 確認對話框(2026-09-11,shadcn Alert Dialog 風格手刻版):
 * 取代 window.confirm 的原生醜框 — 背景霧化 + 置中卡片 + 取消/確定。
 * Esc 或點背景 = 取消。
 */
export function ConfirmDialog({
  text,
  onCancel,
  onConfirm,
  confirmLabel = '確定',
  danger = false,
}: {
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(24, 24, 27, 0.35)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'cdlg-fade 0.15s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#fff',
          borderRadius: 14,
          padding: '22px 20px 16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.22)',
          animation: 'cdlg-pop 0.18s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            style={{
              padding: '9px 18px',
              background: '#fff',
              color: '#374151',
              border: '1px solid #d4d4d8',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '9px 18px',
              background: danger ? '#dc2626' : '#18181b',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
@keyframes cdlg-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cdlg-pop { from { opacity: 0; transform: scale(0.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}
