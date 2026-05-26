'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import {
  cancelReservation,
  loadEvents,
  reserveSpot,
  type EventListItem,
  type EventsTenant,
} from './actions';

const LIFF_ID =
  process.env.NEXT_PUBLIC_LIFF_ID_EVENTS ?? process.env.NEXT_PUBLIC_LIFF_ID!;

const c = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e4e4e7',
  borderSubtle: '#f4f4f5',
  text: '#18181b',
  textSec: '#52525b',
  textMuted: '#71717a',
  textDisabled: '#a1a1aa',
  accent: '#18181b',
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function EventsPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [lineName, setLineName] = useState('');
  const [linePic, setLinePic] = useState('');
  const [idToken, setIdToken] = useState('');
  const [tenant, setTenant] = useState<EventsTenant>({ name: '活動報名', logo_url: null });
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const p = await liff.getProfile();
        const tok = liff.getIDToken();
        if (!tok) throw new Error('沒拿到 LIFF ID token');
        setLineName(p.displayName);
        setLinePic(p.pictureUrl ?? '');
        setIdToken(tok);
        const data = await loadEvents(tok);
        setTenant(data.tenant);
        setEvents(data.events);
        setStatus('ready');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  async function refresh(tok: string) {
    const data = await loadEvents(tok);
    setEvents(data.events);
  }

  async function handleReserve(classId: string) {
    setPendingId(classId);
    setFlash(null);
    try {
      const r = await reserveSpot(idToken, classId);
      if (r.ok) {
        setFlash({
          type: 'ok',
          msg: r.status === 'confirmed' ? '✓ 報名成功' : `已加入候補 #${r.position}`,
        });
        await refresh(idToken);
      } else {
        setFlash({ type: 'err', msg: r.error });
      }
    } catch (e: unknown) {
      setFlash({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setPendingId(null);
      window.setTimeout(() => setFlash(null), 3000);
    }
  }

  async function handleCancel(classId: string) {
    if (!confirm('確定取消報名?')) return;
    setPendingId(classId);
    setFlash(null);
    try {
      const r = await cancelReservation(idToken, classId);
      if (r.ok) {
        setFlash({ type: 'ok', msg: '已取消報名' });
        await refresh(idToken);
      } else {
        setFlash({ type: 'err', msg: r.error ?? '取消失敗' });
      }
    } catch (e: unknown) {
      setFlash({ type: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setPendingId(null);
      window.setTimeout(() => setFlash(null), 3000);
    }
  }

  if (status === 'loading') {
    return (
      <main style={page}>
        <div style={centered}>
          <div style={spinner} />
          <p style={{ color: c.textMuted, fontSize: 14 }}>載入中…</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: spinKeyframes }} />
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main style={page}>
        <div style={centered}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ color: c.danger, fontSize: 14 }}>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes flashfade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.event-card:active { transform: scale(0.99); }
${spinKeyframes}
          `,
        }}
      />

      {/* Hero */}
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              style={{
                width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                border: `1.5px solid ${c.border}`, flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: c.border, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.textMuted, fontSize: 22, fontWeight: 700,
              }}
            >
              {tenant.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: c.textMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {tenant.name} · 活動報名
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {linePic && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={linePic}
                  alt=""
                  style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${c.border}`, flexShrink: 0 }}
                />
              )}
              <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
                {lineName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {flash && (
        <div
          style={{
            padding: '10px 14px',
            background: flash.type === 'ok' ? c.successBg : c.dangerBg,
            border: `1px solid ${flash.type === 'ok' ? c.successBorder : c.dangerBorder}`,
            color: flash.type === 'ok' ? c.success : c.danger,
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 14,
            fontWeight: 500,
            animation: 'flashfade 0.25s ease',
          }}
        >
          {flash.msg}
        </div>
      )}

      {/* Section title */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>近期活動</h2>
        <span style={{ fontSize: 12, color: c.textMuted }}>
          {events.length > 0 ? `${events.length} 場` : ''}
        </span>
      </div>

      {events.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>近期沒有活動</p>
          <p style={{ margin: 0, fontSize: 12, color: c.textMuted }}>
            老師建立活動後會出現在這裡
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((e) => {
            const cap = e.capacity ?? null;
            const remaining = cap !== null ? Math.max(0, cap - e.confirmed_count) : null;
            const isFull = cap !== null && remaining === 0;
            const fillPct = cap !== null && cap > 0 ? Math.min(100, (e.confirmed_count / cap) * 100) : 0;
            const isPending = pendingId === e.id;
            const isConfirmed = e.my_status === 'confirmed';
            const isWaitlist = e.my_status === 'waitlist';
            const isMine = isConfirmed || isWaitlist;

            return (
              <article
                key={e.id}
                className="event-card"
                style={{
                  background: c.card,
                  border: `1px solid ${isMine ? c.successBorder : c.border}`,
                  borderLeft: isMine ? `3px solid ${c.success}` : `1px solid ${c.border}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'transform 0.15s, border-color 0.2s',
                }}
              >
                {/* Cover 圖(有設才顯示)— 4:5 直式 */}
                {e.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.image_url}
                    alt={e.name}
                    style={{
                      width: '100%',
                      aspectRatio: '3 / 4',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                )}
                <div style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* 日期區塊 — 左 */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: 56,
                      padding: '8px 0',
                      background: '#fafafa',
                      border: `1px solid ${c.borderSubtle}`,
                      borderRadius: 8,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>
                      {new Date(e.scheduled_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.text, fontFamily: 'ui-monospace, monospace', lineHeight: 1.1, marginTop: 2 }}>
                      {new Date(e.scheduled_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>
                      {formatDate(e.scheduled_at).match(/\(([^)]+)\)|（([^）]+)）|週./)?.[0] ?? ''}
                    </div>
                  </div>

                  {/* 主資訊 — 右 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.text, lineHeight: 1.3 }}>
                        {e.name}
                      </h3>
                      {isMine && (
                        <span
                          style={{
                            padding: '1px 7px',
                            background: isConfirmed ? c.successBg : c.warningBg,
                            color: isConfirmed ? c.success : c.warning,
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {isConfirmed ? '已報名' : `候補 #${e.my_position}`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>
                      {formatTime(e.scheduled_at)}
                      {e.region_name && <> · 📍 {e.region_name}</>}
                      {e.instructor && <> · 👤 {e.instructor}</>}
                      {e.is_paid && (
                        <> · 💰 <strong style={{ color: c.text }}>NT$ {e.price_twd ?? '-'}</strong></>
                      )}
                    </div>

                    {/* 容量 progress */}
                    {cap !== null && (
                      <div style={{ marginTop: 8, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.textSec, marginBottom: 4 }}>
                          <span>
                            已報 <strong style={{ color: isFull ? c.danger : c.text }}>{e.confirmed_count}</strong>
                            {' / '}
                            {cap}
                            {e.waitlist_count > 0 && (
                              <span style={{ color: c.warning }}> · 候補 {e.waitlist_count}</span>
                            )}
                          </span>
                          <span style={{ color: c.textMuted }}>
                            {isFull ? '🔴 已滿' : `剩 ${remaining}`}
                          </span>
                        </div>
                        <div style={{ height: 4, background: c.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${fillPct}%`,
                              height: '100%',
                              background: isFull ? c.danger : c.success,
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Button — 只有付費課需要報名,免費課顯示「無須報名 · 直接參加」 */}
                    {!e.is_paid ? (
                      <div
                        style={{
                          ...btnBase,
                          background: '#f4f4f5',
                          color: c.textSec,
                          textAlign: 'center',
                          cursor: 'default',
                          border: `1px dashed ${c.border}`,
                          fontWeight: 500,
                        }}
                      >
                        🆓 免費課程 · 無須報名,直接到場
                      </div>
                    ) : (
                      <>
                        {isConfirmed && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleCancel(e.id)}
                            style={{
                              ...btnBase,
                              background: c.card,
                              color: c.success,
                              border: `1px solid ${c.successBorder}`,
                              ...(isPending ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                            }}
                          >
                            {isPending ? '處理中…' : '✓ 已報名 · 點此取消'}
                          </button>
                        )}
                        {isWaitlist && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleCancel(e.id)}
                            style={{
                              ...btnBase,
                              background: c.card,
                              color: c.warning,
                              border: `1px solid ${c.warningBg}`,
                              ...(isPending ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                            }}
                          >
                            {isPending ? '處理中…' : `⏳ 候補 #${e.my_position} · 點此取消`}
                          </button>
                        )}
                        {!isMine && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleReserve(e.id)}
                            style={{
                              ...btnBase,
                              background: isFull ? c.warning : c.accent,
                              color: '#fff',
                              ...(isPending ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                            }}
                          >
                            {isPending ? '處理中…' : isFull ? `候補(已 ${e.waitlist_count} 人)` : '我要報名'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: c.textMuted, lineHeight: 1.6 }}>
        報名後想取消請點上方按鈕。<br />
        若課程已滿,你會被加到候補名單,前面取消時自動候補上。
      </p>
    </main>
  );
}

const page: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
  maxWidth: 520,
  margin: '0 auto',
  padding: '16px 14px 40px',
  background: c.bg,
  minHeight: '100vh',
  color: c.text,
};
const centered: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  minHeight: '70vh',
};
const spinner: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '3px solid #e4e4e7',
  borderTopColor: '#18181b',
  animation: 'spin 0.8s linear infinite',
};
const spinKeyframes = '@keyframes spin { to { transform: rotate(360deg); } }';
const btnBase: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 7,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
