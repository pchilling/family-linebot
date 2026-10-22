'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SIGNOUT_URL } from '@/lib/return-to';

type Me = { id: string; name: string | null; avatarUrl: string | null; email: string | null; phone: string | null };

const CSS = `
.am{position:relative;display:inline-flex}
.am-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--ui-line);background:var(--ui-surface);padding:0;cursor:pointer;display:grid;place-items:center;overflow:hidden}
.am-btn img{width:100%;height:100%;object-fit:cover;display:block}
.am-ini{width:100%;height:100%;display:grid;place-items:center;background:var(--ui-accent);color:var(--ui-on-accent);font-size:13px;font-weight:600}
.am-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:60;width:min(260px,calc(100vw - 32px));background:#fff;border:1px solid var(--ui-line);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.14);padding:8px;text-align:left;animation:ui-swap .18s ease both}
.am-head{display:flex;align-items:center;gap:10px;padding:8px 10px 12px;border-bottom:1px solid var(--ui-line);margin-bottom:6px}
.am-head .am-btn{width:40px;height:40px;cursor:default}
.am-head b{display:block;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-head small{display:block;font-size:12px;color:var(--ui-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-item{display:flex;align-items:center;gap:10px;width:100%;min-height:38px;padding:8px 10px;border:0;border-radius:8px;background:none;font:inherit;font-size:14px;color:var(--ui-ink);text-decoration:none;cursor:pointer;text-align:left;box-sizing:border-box}
.am-item:hover{background:var(--ui-line-soft)}
.am-item svg{width:17px;height:17px;flex-shrink:0;color:var(--ui-muted)}
.am-sep{border-top:1px solid var(--ui-line);margin:6px 0}
`;

/**
 * 頁首右上角的帳號區(Phase 26):未登入顯示「登入」,登入後顯示頭像,點開下拉(我的訂單、我的收藏、登出)。
 * 會員資料用 /api/auth/me 在瀏覽器端問,頁面本身不讀 cookie(商品頁才能維持快取)。
 * Esc、點外面、換頁都會關。登出走固定網址的一般表單(app/api/auth/signout),部署前開著的舊分頁也能登出。
 */
export function AccountMenu({ slug }: { slug: string }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = 還在問
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { member: Me | null }) => {
        if (alive) setMe(d.member ?? null);
      })
      .catch(() => {
        if (alive) setMe(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 換頁就把選單收起來
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  if (me === undefined) return <span aria-hidden style={{ width: 36, height: 36, display: 'inline-block' }} />;

  if (!me) {
    return (
      <a href={`/${slug}/login?return_to=${encodeURIComponent(pathname || `/${slug}`)}`} className="ui-btn ui-btn-ghost ui-btn-sm">
        登入
      </a>
    );
  }

  const label = me.name || (me.email ? me.email.split('@')[0] : '會員');
  const initial = label.slice(0, 1).toUpperCase();
  const avatar = (
    me.avatarUrl && !imgFailed ? (
      // 頭像來自 LINE / Google 外部主機,用原生 img
      // eslint-disable-next-line @next/next/no-img-element
      <img src={me.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
    ) : (
      <span className="am-ini" aria-hidden>{initial}</span>
    )
  );

  return (
    <div ref={rootRef} className="am">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" className="am-btn" aria-label="我的帳號" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {avatar}
      </button>
      {open && (
        <div role="menu" aria-label="我的帳號" className="am-menu">
          <div className="am-head">
            <span className="am-btn" aria-hidden>{avatar}</span>
            <span style={{ minWidth: 0 }}>
              <b>{label}</b>
              {me.email && <small>{me.email}</small>}
            </span>
          </div>
          <a role="menuitem" href={`/${slug}/account`} className="am-item" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
            我的訂單
          </a>
          <a role="menuitem" href={`/${slug}?fav=1`} className="am-item" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
            我的收藏
          </a>
          <div className="am-sep" />
          <form action={SIGNOUT_URL} method="post">
            <input type="hidden" name="return_to" value={`/${slug}`} />
            <button type="submit" role="menuitem" className="am-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
              登出
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
