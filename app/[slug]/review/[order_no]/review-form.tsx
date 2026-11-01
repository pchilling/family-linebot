'use client';

import { useState } from 'react';
import { Button, Input, Textarea } from '@/lib/ui';
import { submitReviews } from './actions';

export type ReviewItem = {
  productId: string;
  name: string;
  image: string | null;
  rating: number | null; // 已評過的話帶進來
  comment: string | null;
};

const STAR_PATH = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8z';
const LABELS = ['', '不滿意', '普通', '還可以', '滿意', '非常滿意'];

function StarPicker({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} role="radiogroup" aria-label="星等">
      <input type="hidden" name={name} value={value || ''} />
      <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} 顆星`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            style={{ width: 40, height: 40, border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill={n <= shown ? '#f59e0b' : '#e4e4e7'} aria-hidden style={{ transition: 'fill .1s, transform .1s', transform: n <= shown ? 'scale(1.05)' : 'none' }}>
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
      <span style={{ fontSize: 13, color: shown ? 'var(--ui-ink)' : 'var(--ui-muted)', minWidth: 56 }}>{LABELS[shown] || '點星星'}</span>
    </div>
  );
}

export function ReviewForm({
  slug,
  tenantName,
  orderNo,
  accessKey,
  defaultName,
  items,
  store,
}: {
  slug: string;
  tenantName: string;
  orderNo: string;
  accessKey: string;
  defaultName: string;
  items: ReviewItem[];
  store: { rating: number | null; comment: string | null }; // Phase 30:這筆訂單給店家的評價(評過的話帶進來)
}) {
  const [ratings, setRatings] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.productId, i.rating ?? 0])),
  );
  const [storeRating, setStoreRating] = useState(store.rating ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ saved: number; store: boolean } | null>(null);
  const alreadyReviewed = items.some((i) => i.rating) || !!store.rating;
  // 2026-11-01 Peter:不給匿名 — 用自己的名字(預設帶暱稱 / LINE 名稱),或另外打一個暱稱
  const [useDefault, setUseDefault] = useState(!!defaultName);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await submitReviews(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone({ saved: result.saved, store: result.store });
  }

  if (done !== null) {
    const what = [done.saved > 0 ? `${done.saved} 個商品` : '', done.store ? '這家店' : ''].filter(Boolean).join('和');
    return (
      <div className="ui-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'grid', placeItems: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>謝謝您的評價</h2>
        <p className="ui-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>已收到{what}的評價,會顯示在商店裡讓其他客人參考。</p>
        <a href={`/${slug}`} className="ui-btn ui-btn-outline ui-btn-md" style={{ marginTop: 8 }}>回商店逛逛</a>
      </div>
    );
  }

  return (
    <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="tenant_slug" value={slug} />
      <input type="hidden" name="order_no" value={orderNo} />
      <input type="hidden" name="k" value={accessKey} />

      {alreadyReviewed && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--ui-wash)', border: '1px solid var(--ui-wash-line)', fontSize: 13, color: 'var(--ui-accent-ink)' }}>
          這筆訂單您已經評價過了,可以修改後再送出一次。
        </div>
      )}

      {/* Phase 30:這家店整體(出貨速度、包裝、服務)— 一筆訂單一顆星 */}
      <div className="ui-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'var(--ui-accent)' }}>
        <div>
          <span className="ui-label" style={{ marginBottom: 2 }}>這家店整體</span>
          <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>給 <b style={{ color: 'var(--ui-ink)', fontWeight: 500 }}>{tenantName}</b> 打個分數:出貨速度、包裝、服務的整體感覺。</p>
        </div>
        <StarPicker name="rating_store" value={storeRating} onChange={setStoreRating} />
        <Textarea name="comment_store" defaultValue={store.comment ?? ''} rows={2} maxLength={300} placeholder="對這家店想說的話(選填)" style={{ minHeight: 64 }} />
      </div>

      {items.map((it) => (
        <div key={it.productId} className="ui-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 56, height: 70, borderRadius: 6, border: '1px solid var(--ui-line)', background: 'var(--ui-line-soft)', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
              {it.image && <img src={it.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            </span>
            <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{it.name}</span>
          </div>
          <StarPicker name={`rating_${it.productId}`} value={ratings[it.productId] ?? 0} onChange={(v) => setRatings((r) => ({ ...r, [it.productId]: v }))} />
          <Textarea name={`comment_${it.productId}`} defaultValue={it.comment ?? ''} rows={2} maxLength={300} placeholder="想多說一點嗎?(選填)例如:味道、質感、使用上的感想" style={{ minHeight: 64 }} />
        </div>
      ))}

      <div className="ui-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="ui-label" style={{ marginBottom: 0 }}>評價用什麼名字顯示</span>
        {defaultName ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" className="ui-radio" name="name_mode" checked={useDefault} onChange={() => setUseDefault(true)} />
              用 <b>{defaultName}</b>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" className="ui-radio" name="name_mode" checked={!useDefault} onChange={() => setUseDefault(false)} />
              另外打一個暱稱
            </label>
          </>
        ) : (
          <span className="ui-muted" style={{ fontSize: 13 }}>打一個暱稱,會跟評價一起顯示在商品頁。</span>
        )}
        {useDefault ? (
          <input type="hidden" name="display_name" value={defaultName} />
        ) : (
          <Input name="display_name" required maxLength={30} placeholder="例:小美" autoFocus={!!defaultName} style={defaultName ? { marginLeft: 26, width: 'calc(100% - 26px)' } : undefined} />
        )}
        <p className="ui-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
          想換預設的名字,到<a href={`/${slug}/account`} style={{ color: 'var(--ui-accent-ink)', fontWeight: 500 }}>我的訂單</a>改暱稱。
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 14 }}>{error}</div>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={pending} style={{ width: '100%' }}>
        {pending ? <span className="ui-spin" style={{ borderTopColor: '#fff' }} /> : null}
        {pending ? '送出中…' : alreadyReviewed ? '更新評價' : '送出評價'}
      </Button>
      <p className="ui-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>沒打星的不會送出。評價內容由您提供,店家不會修改分數。</p>
    </form>
  );
}
