'use client';

import { useFormStatus } from 'react-dom';
import { colors, fontSize, fontWeight, radius, space } from '@/lib/admin-theme';

/**
 * Apply 頁送出 button(Phase 8.3,2026-05-26)。
 * 用 React 19 useFormStatus 抓 pending 狀態給視覺 feedback,
 * 避免送出後 user 以為當掉。
 */
export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="neop-cta"
      style={{
        marginTop: space['3'],
        padding: `${space['3']}px ${space['5']}px`,
        background: pending ? '#9ca3af' : colors.neopGreen,
        color: '#fff',
        border: 0,
        borderRadius: radius.md,
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        cursor: pending ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: pending ? 0.8 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['2'],
      }}
    >
      {pending && (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'apply-spin 0.7s linear infinite',
          }}
        />
      )}
      {pending ? '送出中…' : '送出申請,立刻進後台'}
      <style>{`@keyframes apply-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
