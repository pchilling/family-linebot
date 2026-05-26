'use client';

import { useState, useEffect } from 'react';

/**
 * 分享 button(Phase 9.1,2026-05-26):
 * 用 Web Share API 把 /api/og/product/{id} 生成的 PNG 推進系統 share sheet。
 *
 * 限制:
 * - 只手機(iOS Safari / Android Chrome 支援 canShare with files)
 * - 電腦版 detect 不到 → 整個 button 不 render(user 說桌機不開放)
 */
export function ShareButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('canShare' in navigator) || !('share' in navigator)) {
      setSupported(false);
      return;
    }
    try {
      const test = new File([new Blob()], 'test.png', { type: 'image/png' });
      setSupported(navigator.canShare({ files: [test] }));
    } catch {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  async function handleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/og/product/${productId}`);
      if (!res.ok) throw new Error('產分享圖失敗');
      const blob = await res.blob();
      const file = new File([blob], `${productName}.png`, { type: 'image/png' });

      if (!navigator.canShare({ files: [file] })) {
        throw new Error('裝置不支援檔案分享');
      }

      await navigator.share({
        files: [file],
        title: productName,
      });
    } catch (e) {
      // AbortError = user 取消,不 alert
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('[ShareButton]', e);
        alert('分享失敗:' + e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: loading ? '#9ca3af' : '#05C878',
        color: '#fff',
        border: 0,
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: loading ? 0.85 : 1,
      }}
    >
      {loading ? (
        <>
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'share-spin 0.7s linear infinite',
              display: 'inline-block',
            }}
          />
          產生中…
        </>
      ) : (
        <>
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          分享到 IG / WhatsApp / 訊息
        </>
      )}
      <style>{`@keyframes share-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
