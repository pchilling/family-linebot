'use client';

import { useState } from 'react';
import { updateShareFocus } from '../../actions';
import { SubmitButton } from '../../_components/submit-button';

type Props = {
  productId: string;
  tenantSlug: string;
  imageUrl: string;
  initialFocus: number;
};

/**
 * 分享卡橫向焦點 live preview editor。
 *
 * 邏輯:
 *   - 原 3:4 圖在 9:16 OG 卡上會 cover crop 兩側,共失 ~25% 寬度
 *   - 顯示原圖,疊一個 9:16 框(框內 = 會出現在分享卡;框外暗色 = 被裁)
 *   - slider 0-100 對應框的橫向位置(0=最左、50=置中、100=最右)
 *
 * 數學:
 *   3:4 寬 / 9:16 寬 = (1/0.75) / (1/0.5625) → 9:16 取 0.75 of 3:4 寬,高完全用
 *   ∴ cropWidth = displayWidth × 0.75;scrollRange = displayWidth × 0.25
 */
export function ShareFocusEditor({
  productId,
  tenantSlug,
  imageUrl,
  initialFocus,
}: Props) {
  const [focus, setFocus] = useState(initialFocus);

  const displayWidth = 280;
  const displayHeight = (displayWidth * 4) / 3; // 3:4 圖
  const cropWidth = displayWidth * 0.75; // 9:16 框寬度
  const scrollRange = displayWidth - cropWidth;
  const cropLeft = (focus / 100) * scrollRange;

  return (
    <form
      action={updateShareFocus}
      style={{
        marginTop: 14,
        padding: '14px 16px',
        background: '#fafafa',
        border: '1px solid #f4f4f5',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="tenant_slug" value={tenantSlug} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: '#18181b' }}>
          分享卡裁切焦點(IG Story 9:16)
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#71717a',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          }}
        >
          {focus}
        </span>
      </div>

      {/* Live preview:原 3:4 圖 + 9:16 框 + 兩側暗部分(會被裁) */}
      <div
        style={{
          position: 'relative',
          width: displayWidth,
          height: displayHeight,
          margin: '0 auto',
          background: '#000',
          overflow: 'hidden',
          borderRadius: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          style={{
            width: displayWidth,
            height: displayHeight,
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* 左側 mask(框左邊被裁的範圍)*/}
        {cropLeft > 0.5 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: cropLeft,
              height: displayHeight,
              background: 'rgba(0, 0, 0, 0.6)',
            }}
          />
        )}
        {/* 右側 mask */}
        {scrollRange - cropLeft > 0.5 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: scrollRange - cropLeft,
              height: displayHeight,
              background: 'rgba(0, 0, 0, 0.6)',
            }}
          />
        )}
        {/* 9:16 框邊(白邊讓 user 看清楚) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: cropLeft,
            width: cropWidth,
            height: displayHeight,
            border: '2px solid #ffffff',
            boxSizing: 'border-box',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
          }}
        />
        {/* 框內角落小標籤 */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: cropLeft + 6,
            padding: '2px 6px',
            background: 'rgba(255, 255, 255, 0.9)',
            color: '#18181b',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.05em',
            borderRadius: 3,
            pointerEvents: 'none',
          }}
        >
          9:16
        </div>
      </div>

      <input
        type="range"
        name="share_focus_x"
        min={0}
        max={100}
        step={5}
        value={focus}
        onChange={(e) => setFocus(Number(e.target.value))}
        style={{ width: '100%' }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#71717a',
        }}
      >
        <span>← 左</span>
        <span>中(50)</span>
        <span>右 →</span>
      </div>

      <SubmitButton size="sm" pendingText="儲存中…">
        儲存焦點
      </SubmitButton>
    </form>
  );
}
