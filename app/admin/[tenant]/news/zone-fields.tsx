'use client';

import { useState } from 'react';

const input: React.CSSProperties = {
  width: '100%',
  padding: 8,
  fontSize: 14,
  border: '1px solid #d4d4d8',
  borderRadius: 4,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

/**
 * 海報熱區輸入(2026-09-12):4 條連結欄 + 即時分區示意圖。
 * 填幾條連結,示意圖就顯示海報會被由上到下切成幾等分 —
 * 填 2 條 = 上下對半、3 條 = 三等分、4 條 = 四等分。
 * 輸入框自帶 name=zone1_url~zone4_url,隨外層 form 送出。
 */
export function ZoneFields({ defaults = [] }: { defaults?: string[] }) {
  const [urls, setUrls] = useState<string[]>([
    defaults[0] ?? '',
    defaults[1] ?? '',
    defaults[2] ?? '',
    defaults[3] ?? '',
  ]);
  const filledCount = urls.filter((u) => u.trim().length > 0).length;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 6 }}>
      {/* 左:連結欄 */}
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ flex: '0 0 56px', fontSize: 12, color: '#71717a' }}>連結 {i + 1}</span>
            <input
              name={`zone${i + 1}_url`}
              type="url"
              value={urls[i]}
              onChange={(e) => {
                const next = [...urls];
                next[i] = e.target.value;
                setUrls(next);
              }}
              style={{ ...input, flex: 1 }}
              placeholder={i === 0 ? 'https://stall.neop.tw/oilswa/p/...' : 'https://...'}
            />
          </div>
        ))}
        <span style={{ fontSize: 11, color: '#a1a1aa', lineHeight: 1.6 }}>
          填幾條就切幾等分(由上到下):2 條 = 上下對半、3 條 = 三等分、4 條 = 四等分。
          右邊示意圖會跟著變,海報設計時把商品照這個順序排。
        </span>
      </div>

      {/* 右:分區示意圖(3:4 直式,跟著填寫數量即時變化) */}
      <div style={{ flex: '0 0 100px' }}>
        <div
          style={{
            width: 100,
            aspectRatio: '3 / 4',
            border: '1.5px solid #d4d4d8',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#fafafa',
          }}
        >
          {filledCount === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#a1a1aa' }}>
              未設熱區
            </div>
          ) : (
            Array.from({ length: filledCount }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderTop: i > 0 ? '1.5px dashed #f59e0b' : 0,
                  background: i % 2 === 0 ? '#fef3c7' : '#fffbeb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: '#92400e',
                  fontWeight: 700,
                }}
              >
                點這區 → 連結 {i + 1}
              </div>
            ))
          )}
        </div>
        <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 4, textAlign: 'center' }}>海報分區示意</div>
      </div>
    </div>
  );
}
