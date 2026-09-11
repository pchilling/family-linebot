'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { IconCalendar, IconCheck, IconChevronLeft, IconClock } from '@/lib/icons';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { FlashToast } from '../../_components/toast';
import {
  cancelReservation,
  loadEvents,
  reserveSpot,
  type EventListItem,
  type EventsTenant,
} from './actions';

// 2026-09-08:活動報名專屬 LIFF(endpoint /m/events)寫死當預設值,不再 fallback 會員中心
const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID_EVENTS || '2010125926-xN0zYRAJ').trim();

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

/**
 * 讀 URL 上的 ?event=<id>。
 * LIFF 轉址有兩種情況:init 後直接留在 search,或包在 liff.state 裡,兩邊都查。
 */
function getDeepLinkEventId(): string | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const direct = sp.get('event');
    if (direct) return direct;
    const ls = sp.get('liff.state');
    if (ls) {
      const inner = new URLSearchParams(ls.startsWith('?') ? ls.slice(1) : ls);
      return inner.get('event');
    }
  } catch {
    /* noop */
  }
  return null;
}

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
  // 2026-09-11:取消報名的自製確認框(取代 window.confirm)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  // 2026-09-08 v2:單場活動改開專屬詳情頁(同商品專區 list ↔ detail);深連結 ?event= 直接落在詳情
  const [detailId, setDetailId] = useState<string | null>(null);

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
        setDetailId(getDeepLinkEventId());
        setStatus('ready');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
  }, []);

  // 進出詳情頁時捲到頂
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [detailId]);

  // 2026-09-11:內容欄有 maxWidth,iPad 等寬螢幕左右會露出 body 白邊 — 底色塗到 body
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = c.bg;
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

  // 2026-09-11:window.confirm 換自製確認框 — 按「取消報名」先開框,確定才真的取消
  function handleCancel(classId: string) {
    setCancelTarget(classId);
  }

  async function doCancel(classId: string) {
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

  /** 容量進度條 — 列表卡與詳情頁共用 */
  function renderCapacity(e: EventListItem) {
    const cap = e.capacity ?? null;
    if (cap === null) return null;
    const remaining = Math.max(0, cap - e.confirmed_count);
    const isFull = remaining === 0;
    const fillPct = cap > 0 ? Math.min(100, (e.confirmed_count / cap) * 100) : 0;
    return (
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
          <span style={{ color: isFull ? c.danger : c.textMuted, fontWeight: isFull ? 700 : 400 }}>
            {isFull ? '已滿' : `剩 ${remaining}`}
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
    );
  }

  /** 報名/取消/免費課按鈕 — 列表卡與詳情頁共用;stopPropagation 避免同時觸發卡片點擊 */
  function renderEventActions(e: EventListItem) {
    const cap = e.capacity ?? null;
    const remaining = cap !== null ? Math.max(0, cap - e.confirmed_count) : null;
    const isFull = cap !== null && remaining === 0;
    const isPending = pendingId === e.id;
    const isConfirmed = e.my_status === 'confirmed';
    const isWaitlist = e.my_status === 'waitlist';
    const isMine = isConfirmed || isWaitlist;

    if (!e.is_paid) {
      return (
        <div
          style={{
            ...btnBase,
            background: c.successBg,
            color: c.success,
            textAlign: 'center',
            cursor: 'default',
            border: `1px solid ${c.successBorder}`,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <IconCheck size={14} /> 免費課程 · 無須報名,直接到場
        </div>
      );
    }
    return (
      <>
        {isConfirmed && (
          <button
            type="button"
            disabled={isPending}
            onClick={(ev) => { ev.stopPropagation(); handleCancel(e.id); }}
            style={{
              ...btnBase,
              background: c.card,
              color: c.success,
              border: `1px solid ${c.successBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              ...(isPending ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {isPending ? '處理中…' : (<><IconCheck size={14} /> 已報名 · 點此取消</>)}
          </button>
        )}
        {isWaitlist && (
          <button
            type="button"
            disabled={isPending}
            onClick={(ev) => { ev.stopPropagation(); handleCancel(e.id); }}
            style={{
              ...btnBase,
              background: c.card,
              color: c.warning,
              border: `1px solid ${c.warningBg}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              ...(isPending ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {isPending ? '處理中…' : (<><IconClock size={14} /> 候補 #{e.my_position} · 點此取消</>)}
          </button>
        )}
        {!isMine && (
          <button
            type="button"
            disabled={isPending}
            onClick={(ev) => { ev.stopPropagation(); handleReserve(e.id); }}
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
    );
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
          <p style={{ color: c.danger, fontSize: 14, fontWeight: 600 }}>發生錯誤:{error}</p>
        </div>
      </main>
    );
  }

  // ── 單場專屬詳情頁(列表點卡片或 bot 深連結 ?event= 進來)──
  const detailEvent = detailId ? events.find((x) => x.id === detailId) : undefined;
  if (detailEvent) {
    const e = detailEvent;
    const isConfirmed = e.my_status === 'confirmed';
    const isWaitlist = e.my_status === 'waitlist';
    const isMine = isConfirmed || isWaitlist;
    return (
      <main style={page}>
        <style
          dangerouslySetInnerHTML={{
            __html: `@keyframes flashfade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } } ${spinKeyframes}`,
          }}
        />
        <div style={{ marginBottom: 14 }}>
          <button type="button" onClick={() => setDetailId(null)} style={backPill}>
            <IconChevronLeft size={16} /> 所有活動
          </button>
        </div>

        {/* 2026-09-11:改頂部滑入通知(shadcn Sonner 風格) */}
        {flash && (
          <FlashToast key={`${flash.type}-${flash.msg}`} message={flash.msg} tone={flash.type === 'ok' ? 'success' : 'error'} />
        )}
        {cancelTarget && (
          <ConfirmDialog
            text="確定取消報名?"
            danger
            confirmLabel="取消報名"
            onCancel={() => setCancelTarget(null)}
            onConfirm={() => {
              const id = cancelTarget;
              setCancelTarget(null);
              doCancel(id);
            }}
          />
        )}

        <article
          style={{
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          {/* 詳情頁顯示完整原圖(不裁切),列表才限高 */}
          {e.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.image_url} alt={e.name} style={{ width: '100%', display: 'block' }} />
          )}
          <div style={{ padding: '18px 16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>{e.name}</h1>
              {isMine && (
                <span
                  style={{
                    padding: '2px 8px',
                    background: isConfirmed ? c.successBg : c.warningBg,
                    color: isConfirmed ? c.success : c.warning,
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {isConfirmed ? '已報名' : `候補 #${e.my_position}`}
                </span>
              )}
            </div>

            <div
              style={{
                margin: '12px 0 4px',
                padding: '12px 14px',
                background: '#fafafa',
                border: `1px solid ${c.borderSubtle}`,
                borderRadius: 10,
                display: 'grid',
                gridTemplateColumns: '52px 1fr',
                rowGap: 8,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: c.textMuted }}>時間</span>
              <span style={{ fontWeight: 600 }}>{formatDate(e.scheduled_at)} {formatTime(e.scheduled_at)}</span>
              {e.region_name && (
                <>
                  <span style={{ color: c.textMuted }}>地點</span>
                  <span>{e.region_name}</span>
                </>
              )}
              {e.instructor && (
                <>
                  <span style={{ color: c.textMuted }}>講師</span>
                  <span>{e.instructor}</span>
                </>
              )}
              <span style={{ color: c.textMuted }}>費用</span>
              <span style={{ fontWeight: 600, color: e.is_paid ? '#b45309' : c.success }}>
                {e.is_paid ? `NT$ ${e.price_twd ?? '-'}` : '免費'}
              </span>
            </div>

            {renderCapacity(e)}

            {e.description && (
              <p style={{ margin: '12px 0 16px', fontSize: 14, color: c.textSec, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {e.description}
              </p>
            )}

            {renderEventActions(e)}
          </div>
        </article>
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

      {/* 2026-09-11:改頂部滑入通知(shadcn Sonner 風格) */}
      {flash && (
        <FlashToast key={`${flash.type}-${flash.msg}`} message={flash.msg} tone={flash.type === 'ok' ? 'success' : 'error'} />
      )}
      {cancelTarget && (
        <ConfirmDialog
          text="確定取消報名?"
          danger
          confirmLabel="取消報名"
          onCancel={() => setCancelTarget(null)}
          onConfirm={() => {
            const id = cancelTarget;
            setCancelTarget(null);
            doCancel(id);
          }}
        />
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
          <div style={{ marginBottom: 10, color: '#d4d4d8' }}>
            <IconCalendar size={44} />
          </div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>近期沒有活動</p>
          <p style={{ margin: 0, fontSize: 12, color: c.textMuted }}>
            老師建立活動後會出現在這裡
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((e) => {
            const isConfirmed = e.my_status === 'confirmed';
            const isWaitlist = e.my_status === 'waitlist';
            const isMine = isConfirmed || isWaitlist;

            return (
              <article
                key={e.id}
                className="event-card"
                onClick={() => setDetailId(e.id)}
                style={{
                  background: c.card,
                  border: `1px solid ${c.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                {/* Cover 圖:列表限高 220px 置中裁切,避免直式海報把版面撐爆 */}
                {e.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.image_url}
                    alt={e.name}
                    style={{
                      width: '100%',
                      height: 220,
                      objectFit: 'cover',
                      objectPosition: 'center 30%',
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
                      {e.region_name && <> · {e.region_name}</>}
                      {e.instructor && <> · {e.instructor}</>}
                      {e.is_paid && (
                        <> · <strong style={{ color: '#b45309' }}>NT$ {e.price_twd ?? '-'}</strong></>
                      )}
                    </div>

                    {e.description && <ExpandableText text={e.description} />}

                    {renderCapacity(e)}

                    {renderEventActions(e)}
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

/** 課程說明摺疊顯示:超過 60 字先收起,點「顯示更多」展開(詳情頁直接全文,不經過這裡)。 */
function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 60;
  const shown = open || !isLong ? text : text.slice(0, 60) + '…';
  return (
    <div style={{ marginBottom: 8 }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: c.textSec,
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
        }}
      >
        {shown}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); setOpen((o) => !o); }}
          style={{
            marginTop: 4,
            padding: 0,
            background: 'none',
            border: 0,
            color: c.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textDecoration: 'underline',
          }}
        >
          {open ? '收合' : '顯示更多'}
        </button>
      )}
    </div>
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
const backPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '9px 16px 9px 12px',
  minHeight: 40,
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  color: '#374151',
  fontFamily: 'inherit',
  touchAction: 'manipulation',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
};
const btnBase: React.CSSProperties = {
  width: '100%',
  // 2026-09-08:div 版標籤(免費課程)預設 content-box,100% + padding 會超寬被裁右邊
  boxSizing: 'border-box',
  padding: '10px 14px',
  borderRadius: 7,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
