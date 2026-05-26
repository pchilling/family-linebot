'use client';

import { useState, useEffect } from 'react';

/**
 * 分享 button + Strava 風格 modal(Phase 9.3,2026-05-27):
 *
 * 流程:點分享 → 拿 PNG + 公開 URL → modal 顯示大圖預覽 + 各 app 分立 button。
 *
 * 各 button 行為:
 * - IG Stories:嘗試 clipboard + instagram-stories:// deep link(best effort)
 * - WhatsApp / 訊息 / Telegram / LINE:用 URL deep link(對方 app 抓 OG meta 預覽)
 * - 儲存圖片:download PNG
 * - 複製連結:clipboard URL
 * - 更多:navigator.share(image,iOS / Android only)
 *
 * 限制:電腦版 detect 不到 → 整顆 button 不 render(可以 user 喜好)
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
  const [modalOpen, setModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const hasShare = 'share' in navigator;
    setSupported(hasShare);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!supported) return null;

  function closeModal() {
    setModalOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setImageBlob(null);
  }

  async function openPreview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/og/product/${productId}`);
      if (!res.ok) throw new Error('產分享圖失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImageBlob(blob);
      setPreviewUrl(url);
      setShareUrl(`${window.location.origin}/share/p/${productId}`);
      setModalOpen(true);
    } catch (e) {
      if (e instanceof Error) alert('產生失敗:' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ===== Platform handlers =====

  async function shareToInstagramStories() {
    if (!imageBlob) return;
    // 嘗試 clipboard copy → 開 IG Stories deep link
    // iOS Safari 支援 navigator.clipboard.write,Android Chrome 也支援
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': imageBlob }),
        ]);
        setToast('已複製圖,Instagram 開啟後請貼上');
      }
    } catch (e) {
      console.warn('[clipboard]', e);
    }
    // 短暫延遲讓 toast 出現
    setTimeout(() => {
      window.location.href = 'instagram-stories://share';
    }, 600);
  }

  function shareToWhatsApp() {
    const text = `${productName}\n${shareUrl}`;
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  function shareToSms() {
    const text = `${productName}\n${shareUrl}`;
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  }

  function shareToLine() {
    window.location.href = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`;
  }

  function shareToTelegram() {
    window.location.href = `https://t.me/share/url?url=${encodeURIComponent(
      shareUrl,
    )}&text=${encodeURIComponent(productName)}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast('連結已複製');
    } catch {
      setToast('複製失敗');
    }
  }

  function saveImage() {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `${productName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setToast('已下載圖片');
  }

  async function shareMore() {
    if (!imageBlob) return;
    try {
      const file = new File([imageBlob], `${productName}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: productName });
      } else {
        await navigator.share({ title: productName, url: shareUrl });
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        alert('分享失敗:' + e.message);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
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
            <Spinner />
            產生中…
          </>
        ) : (
          <>
            <ShareIcon />
            分享
          </>
        )}
      </button>

      {modalOpen && previewUrl && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'inherit',
            color: '#fff',
            overflow: 'auto',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'calc(env(safe-area-inset-top) + 8px) 16px 8px',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={closeModal}
              style={{
                background: 'none',
                border: 0,
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                padding: '8px 4px',
                fontFamily: 'inherit',
              }}
            >
              關閉
            </button>
            <div style={{ fontSize: 16, fontWeight: 600 }}>分享商品</div>
            <div style={{ width: 36 }} />
          </div>

          {/* Preview image */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 16px',
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="分享預覽"
              style={{
                maxWidth: '60%',
                maxHeight: '50vh',
                width: 'auto',
                height: 'auto',
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                objectFit: 'contain',
              }}
            />
          </div>

          {/* Share grid */}
          <div
            style={{
              flex: 1,
              padding: '16px 16px calc(env(safe-area-inset-bottom) + 24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.6)',
                  marginBottom: 12,
                  fontWeight: 500,
                }}
              >
                分享至
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 12,
                }}
              >
                <PlatformButton label="IG Story" onClick={shareToInstagramStories}>
                  <IGIcon />
                </PlatformButton>
                <PlatformButton label="WhatsApp" onClick={shareToWhatsApp}>
                  <WhatsAppIcon />
                </PlatformButton>
                <PlatformButton label="LINE" onClick={shareToLine}>
                  <LineIcon />
                </PlatformButton>
                <PlatformButton label="Telegram" onClick={shareToTelegram}>
                  <TelegramIcon />
                </PlatformButton>
                <PlatformButton label="訊息" onClick={shareToSms}>
                  <SmsIcon />
                </PlatformButton>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.6)',
                  marginBottom: 12,
                  fontWeight: 500,
                }}
              >
                其他
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                }}
              >
                <PlatformButton label="複製連結" onClick={copyLink} dim>
                  <LinkIcon />
                </PlatformButton>
                <PlatformButton label="儲存圖" onClick={saveImage} dim>
                  <DownloadIcon />
                </PlatformButton>
                <PlatformButton label="更多" onClick={shareMore} dim>
                  <MoreIcon />
                </PlatformButton>
                <div />
              </div>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.85)',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                zIndex: 10000,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {toast}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes share-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function PlatformButton({
  label,
  onClick,
  children,
  dim,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'inherit',
        color: '#fff',
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: dim ? 'rgba(255,255,255,0.12)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {children}
      </span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </span>
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'share-spin 0.7s linear infinite',
        display: 'inline-block',
      }}
    />
  );
}

function ShareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// Platform icons(Instagram-style gradient / WhatsApp green / 等)
function IGIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden>
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#feda75" />
          <stop offset="33%" stopColor="#fa7e1e" />
          <stop offset="66%" stopColor="#d62976" />
          <stop offset="100%" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect width="52" height="52" rx="12" fill="url(#ig-grad)" />
      <rect x="13" y="13" width="26" height="26" rx="7" fill="none" stroke="#fff" strokeWidth="2.5" />
      <circle cx="26" cy="26" r="6" fill="none" stroke="#fff" strokeWidth="2.5" />
      <circle cx="34.5" cy="17.5" r="1.8" fill="#fff" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden>
      <rect width="52" height="52" rx="26" fill="#25D366" />
      <path
        fill="#fff"
        d="M26 13c-7.18 0-13 5.82-13 13 0 2.3.6 4.55 1.74 6.53L13 39l6.66-1.74A12.97 12.97 0 0 0 26 39c7.18 0 13-5.82 13-13s-5.82-13-13-13zm7.62 18.4c-.32.9-1.6 1.7-2.6 1.84-.7.1-1.55.14-2.5-.16-.58-.18-1.32-.42-2.27-.83-4-1.72-6.6-5.74-6.8-6-.2-.27-1.6-2.14-1.6-4.08 0-1.94 1.02-2.9 1.38-3.3.36-.4.78-.5 1.04-.5.26 0 .52 0 .74.02.24.02.55-.09.86.66.32.76 1.08 2.62 1.18 2.82.1.2.17.42.04.7-.13.27-.2.43-.4.66-.2.23-.43.5-.6.68-.2.2-.4.42-.18.8.23.4 1 1.65 2.13 2.66 1.46 1.3 2.7 1.7 3.1 1.9.4.2.62.16.85-.1.23-.27.97-1.13 1.23-1.52.26-.4.52-.33.88-.2.36.13 2.32 1.1 2.72 1.3.4.2.66.3.76.47.1.18.1 1.04-.22 2.05z"
      />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden>
      <rect width="52" height="52" rx="12" fill="#06C755" />
      <path
        fill="#fff"
        d="M26 14c-7.7 0-14 5-14 11.2 0 5.6 5 10.3 11.7 11.2.46.1 1.1.3 1.25.7.14.4.1.96.05 1.36l-.2 1.2c-.06.36-.28 1.4 1.22.76 1.5-.64 8.12-4.8 11.08-8.2 2.04-2.24 3-4.5 3-7.04C40 19 33.7 14 26 14zm-5.4 14.7h-2.8c-.4 0-.74-.34-.74-.74v-5.6c0-.4.34-.74.74-.74.4 0 .74.34.74.74v4.86h2.06c.4 0 .74.34.74.74 0 .4-.34.74-.74.74zm2.3-.74c0 .4-.34.74-.74.74-.4 0-.74-.34-.74-.74v-5.6c0-.4.34-.74.74-.74.4 0 .74.34.74.74v5.6zm6.6 0c0 .32-.2.6-.5.7-.07.02-.16.04-.24.04-.22 0-.44-.1-.58-.3l-2.85-3.87v3.43c0 .4-.34.74-.74.74-.4 0-.74-.34-.74-.74v-5.6c0-.32.2-.6.5-.7.08-.02.16-.04.24-.04.22 0 .44.1.58.3l2.85 3.87V22.36c0-.4.34-.74.74-.74.4 0 .74.34.74.74v5.6zm4.6-3.54c.4 0 .74.34.74.74 0 .4-.34.74-.74.74h-2.05v1.32h2.06c.4 0 .74.34.74.74 0 .4-.34.74-.74.74h-2.8c-.4 0-.74-.34-.74-.74v-5.6c0-.4.34-.74.74-.74h2.8c.4 0 .74.34.74.74 0 .4-.34.74-.74.74H32v1.32h2.05z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden>
      <rect width="52" height="52" rx="26" fill="#229ED9" />
      <path
        fill="#fff"
        d="M37.5 16.2l-3.4 16.06c-.26 1.13-.93 1.4-1.88.87l-5.2-3.83-2.5 2.42c-.28.28-.52.52-1.05.52l.37-5.34 9.7-8.76c.42-.37-.1-.58-.65-.2l-12 7.55-5.18-1.62c-1.13-.35-1.15-1.13.23-1.67l20.27-7.82c.95-.34 1.77.22 1.4 1.84z"
      />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden>
      <rect width="52" height="52" rx="26" fill="#34C759" />
      <path
        fill="#fff"
        d="M26 14c-7.18 0-13 5-13 11.2 0 3.7 2.1 7 5.4 9v4.4c0 .4.46.62.78.38l4.34-3.16c.78.12 1.6.18 2.48.18 7.18 0 13-5 13-11.2C39 19 33.18 14 26 14z"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="1.5" fill="#fff" />
      <circle cx="5" cy="12" r="1.5" fill="#fff" />
      <circle cx="19" cy="12" r="1.5" fill="#fff" />
    </svg>
  );
}
