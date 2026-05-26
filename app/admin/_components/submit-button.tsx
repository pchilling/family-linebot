'use client';

import { useFormStatus } from 'react-dom';
import { colors, fontSize, fontWeight, radius, space } from '@/lib/admin-theme';

type Variant = 'primary' | 'danger' | 'secondary';

/**
 * 共用 submit button(Phase 8.3,2026-05-26)。
 *
 * 用 React 19 useFormStatus 抓 form 送出時的 pending 狀態,
 * 顯示 spinner + 替換文字,避免用戶以為當掉。
 *
 * 用法:
 *   <form action={...}>
 *     <SubmitButton>儲存</SubmitButton>
 *   </form>
 *
 * Props:
 *   - variant: 'primary'(綠) | 'danger'(紅) | 'secondary'(白底黑字)
 *   - pendingText: 送出時顯示的文字,default「處理中…」
 *   - fullWidth: button width 100%
 *   - size: 'sm' / 'md'
 */
export function SubmitButton({
  children,
  pendingText,
  variant = 'primary',
  fullWidth = false,
  size = 'md',
}: {
  children: React.ReactNode;
  pendingText?: React.ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
  size?: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();

  const palette: Record<Variant, { bg: string; fg: string; pendingBg: string; border?: string }> = {
    primary: { bg: colors.neopGreen, fg: '#fff', pendingBg: '#9ca3af' },
    danger: { bg: '#dc2626', fg: '#fff', pendingBg: '#9ca3af' },
    secondary: {
      bg: colors.bgCard,
      fg: colors.textPrimary,
      pendingBg: colors.bgSubtle,
      border: `1px solid ${colors.border}`,
    },
  };
  const p = palette[variant];

  const padding = size === 'sm' ? `${space['2']}px ${space['3']}px` : `${space['3']}px ${space['5']}px`;
  const fs = size === 'sm' ? fontSize.sm : fontSize.md;

  return (
    <button
      type="submit"
      disabled={pending}
      className="neop-cta"
      style={{
        padding,
        background: pending ? p.pendingBg : p.bg,
        color: p.fg,
        border: p.border ?? 0,
        borderRadius: radius.md,
        fontSize: fs,
        fontWeight: fontWeight.semibold,
        cursor: pending ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: pending ? 0.85 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['2'],
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      {pending && (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: size === 'sm' ? 12 : 14,
            height: size === 'sm' ? 12 : 14,
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: variant === 'secondary' ? colors.textPrimary : '#fff',
            borderRadius: '50%',
            animation: 'neop-spin 0.7s linear infinite',
          }}
        />
      )}
      {pending ? pendingText ?? '處理中…' : children}
      <style>{`@keyframes neop-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
