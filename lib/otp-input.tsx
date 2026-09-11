'use client';

import { useRef, useState } from 'react';

/**
 * 後五碼輸入格(2026-09-11,shadcn Input OTP 風格手刻版):
 * 5 個獨立數字格,打一碼跳一格。實際輸入是覆蓋在上面的隱形 input
 * (單一輸入框最穩,iOS 不會有逐格切換焦點的怪問題),表單送出值也由它承載。
 *
 * 兩種用法:
 * - 表單模式:<OtpInput name="last5" required />(值隨 form 送出)
 * - 受控模式:<OtpInput value={v} onChange={setV} />
 */
export function OtpInput({
  name,
  length = 5,
  value,
  onChange,
  required = false,
  autoFocus = false,
  boxSize = 44,
}: {
  name?: string;
  length?: number;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  boxSize?: number;
}) {
  const [inner, setInner] = useState('');
  const val = value ?? inner;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function set(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, length);
    if (onChange) onChange(clean);
    else setInner(clean);
  }

  const activeIdx = Math.min(val.length, length - 1);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', gap: 8 }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        name={name}
        value={val}
        required={required}
        pattern={`[0-9]{${length}}`}
        maxLength={length}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        aria-label={`${length} 位數字`}
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          border: 0,
          padding: 0,
          fontSize: 16,
          background: 'transparent',
          caretColor: 'transparent',
        }}
      />
      {Array.from({ length }).map((_, i) => {
        const ch = val[i] ?? '';
        const isActive = focused && i === activeIdx;
        return (
          <div
            key={i}
            aria-hidden
            style={{
              width: boxSize,
              height: boxSize + 8,
              borderRadius: 10,
              border: `1.5px solid ${isActive ? '#18181b' : ch ? '#a1a1aa' : '#d1d5db'}`,
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              color: '#18181b',
              boxShadow: isActive ? '0 0 0 3px rgba(24, 24, 27, 0.08)' : 'none',
              transition: 'border-color 0.12s, box-shadow 0.12s',
              pointerEvents: 'none',
            }}
          >
            {ch || (isActive ? (
              <span style={{ width: 2, height: 22, background: '#18181b', animation: 'otp-caret 1s steps(1) infinite' }} />
            ) : '')}
          </div>
        );
      })}
      <style>{'@keyframes otp-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }'}</style>
    </div>
  );
}
