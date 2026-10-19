'use client';

/**
 * 商品上架開關(2026-10-20 商品頁改版)
 * 列表與編輯頁共用。點了立刻切換,存檔在背景跑;失敗就彈回去並提示。
 */
import { useState, useTransition } from 'react';
import { setProductStatus } from '../../actions';

export function ProductStatusToggle({
  tenantSlug,
  productId,
  initialActive,
  showLabel = true,
}: {
  tenantSlug: string;
  productId: string;
  initialActive: boolean;
  showLabel?: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function toggle() {
    const next = !active;
    setActive(next);
    setFailed(false);
    startTransition(async () => {
      const res = await setProductStatus(tenantSlug, productId, next);
      if (!res.ok) {
        setActive(!next);
        setFailed(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? '目前上架中,點擊改為下架' : '目前下架中,點擊改為上架'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: showLabel ? '6px 10px 6px 6px' : 2,
        border: showLabel ? '1px solid #e4e4e7' : 0,
        borderRadius: 8,
        background: showLabel ? '#fff' : 'none',
        cursor: pending ? 'wait' : 'pointer',
        fontSize: 12.5,
        fontWeight: 600,
        color: '#18181b',
        fontFamily: 'inherit',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: active ? '#16a34a' : '#d4d4d8',
          position: 'relative',
          display: 'inline-block',
          transition: 'background .15s ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: active ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,.25)',
            transition: 'left .15s ease',
          }}
        />
      </span>
      {showLabel && (failed ? <span style={{ color: '#dc2626' }}>儲存失敗</span> : active ? '上架中' : '已下架')}
    </button>
  );
}
