'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ConfirmDialog } from '../../_components/confirm-dialog';

/**
 * 訂單列表 inline quick action 用的小顆 submit button(2026-09-02)。
 * 跟 SubmitButton 的差別:尺寸固定 11px 小顆、bg 可自訂,且必帶 confirm 防誤觸。
 * 2026-09-11:window.confirm 換自製對話框。
 */
export function ConfirmButton({
  confirmText,
  bg,
  children,
}: {
  confirmText: string;
  bg: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  return (
    <>
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        formRef.current = e.currentTarget.form;
        setConfirming(true);
      }}
      style={{
        padding: '5px 10px',
        background: pending ? '#9ca3af' : bg,
        color: '#fff',
        border: 0,
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {pending ? '處理中…' : children}
    </button>
    {confirming && (
      <ConfirmDialog
        text={confirmText}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    )}
    </>
  );
}
