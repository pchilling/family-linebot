'use client';

/**
 * 列表上直接改庫存(2026-10-20 商品頁改版)
 * 每個規格一個數字框,離開欄位或按 Enter 就存,不用進編輯頁。
 * 缺貨(0)紅底提醒;存檔中/已存/失敗用小字回報,不彈窗。
 */
import { useState, useTransition } from 'react';
import { setVariantStock } from '../../actions';

type Row = { id: string; label: string; stock: number };

export function StockCell({ tenantSlug, variants }: { tenantSlug: string; variants: Row[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {variants.map((v) => (
        <StockInput key={v.id} tenantSlug={tenantSlug} row={v} showLabel={variants.length > 1} />
      ))}
    </div>
  );
}

function StockInput({ tenantSlug, row, showLabel }: { tenantSlug: string; row: Row; showLabel: boolean }) {
  const [value, setValue] = useState(String(row.stock));
  const [saved, setSaved] = useState(row.stock);
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  function commit() {
    const n = Math.max(0, Math.floor(Number(value)));
    if (!Number.isFinite(n)) {
      setValue(String(saved));
      return;
    }
    if (n === saved) return;
    setValue(String(n));
    startTransition(async () => {
      const res = await setVariantStock(tenantSlug, row.id, n);
      if (res.ok) {
        setSaved(n);
        setState('saved');
        setTimeout(() => setState('idle'), 1500);
      } else {
        setValue(String(saved));
        setState('error');
      }
    });
  }

  const n = Number(value);
  const out = Number.isFinite(n) && n <= 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {showLabel && (
        <span style={{ fontSize: 12, color: '#52525b', minWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.label}
        </span>
      )}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${row.label} 庫存`}
        disabled={pending}
        style={{
          width: 64,
          padding: '4px 8px',
          border: `1px solid ${out ? '#fecaca' : '#e4e4e7'}`,
          borderRadius: 6,
          fontSize: 13,
          textAlign: 'right',
          background: out ? '#fef2f2' : '#fff',
          color: out ? '#b91c1c' : '#18181b',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'inherit',
        }}
      />
      <span style={{ fontSize: 10.5, color: state === 'error' ? '#dc2626' : '#16a34a', minWidth: 30 }}>
        {pending ? '…' : state === 'saved' ? '已存' : state === 'error' ? '失敗' : ''}
      </span>
    </div>
  );
}
