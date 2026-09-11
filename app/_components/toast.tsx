'use client';

import { useEffect, useState } from 'react';
import { IconCheckCircle, IconX } from '@/lib/icons';

/**
 * 滑入通知(2026-09-11,shadcn Sonner 風格手刻版):
 * 頂部置中滑入,2.4 秒後自動滑走。mount 即播,重播用 key 換掉。
 * 用途:取代版面內卡著的「✓ 已儲存」橫幅。
 */
export function FlashToast({
  message,
  tone = 'success',
}: {
  message: string;
  tone?: 'success' | 'error';
}) {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('out'), 2400);
    const t2 = window.setTimeout(() => setPhase('gone'), 2850);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === 'gone') return null;

  const ok = tone === 'success';
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 14,
        left: '50%',
        transform: 'translate(-50%, 0)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        maxWidth: 'calc(100vw - 32px)',
        background: '#fff',
        border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
        borderRadius: 999,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        fontSize: 14,
        fontWeight: 600,
        color: ok ? '#15803d' : '#b91c1c',
        animation:
          phase === 'in'
            ? 'neop-toast-in 0.3s cubic-bezier(0.3, 1.3, 0.5, 1)'
            : 'neop-toast-out 0.4s ease forwards',
      }}
    >
      {ok ? <IconCheckCircle size={16} /> : <IconX size={16} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message}</span>
      <style>{`
@keyframes neop-toast-in { from { opacity: 0; transform: translate(-50%, -18px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes neop-toast-out { to { opacity: 0; transform: translate(-50%, -18px); } }
      `}</style>
    </div>
  );
}
