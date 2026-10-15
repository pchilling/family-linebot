'use client';

/**
 * 贈品選擇器(2026-10-16)
 *
 * 原本是一支把全部商品照名稱排的下拉,商品一多就難找。
 * 改成點開彈窗、左邊分類右邊商品格,選完把 id 寫回隱藏欄位送出。
 * 主贈品與備用贈品共用這個元件。
 */
import { useMemo, useState } from 'react';

export type PickerProduct = {
  id: string;
  name: string;
  category: string | null;
  image_url: string | null;
  stock: number;
};

const ALL = '__all__';

export function GiftProductPicker({
  name,
  products,
  label,
  placeholder,
  required,
  excludeId,
}: {
  name: string;
  products: PickerProduct[];
  label: string;
  placeholder: string;
  required?: boolean;
  /** 主贈品已選的 id — 備用贈品不讓選同一個 */
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickerProduct | null>(null);
  const [cat, setCat] = useState<string>(ALL);
  const [q, setQ] = useState('');

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const p of products) if (p.category) seen.add(p.category);
    return [...seen].sort();
  }, [products]);

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return products.filter((p) => {
      if (p.id === excludeId) return false;
      if (cat !== ALL && p.category !== cat) return false;
      if (kw && !p.name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [products, cat, q, excludeId]);

  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#52525b', marginBottom: 4 }}>
        {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
      </span>
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          minHeight: 36,
          background: '#fff',
          border: '1px solid #d4d4d8',
          borderRadius: 5,
          fontSize: 13,
          fontFamily: 'inherit',
          color: picked ? '#18181b' : '#a1a1aa',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {picked?.image_url && (
          <img src={picked.image_url} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {picked?.name ?? placeholder}
        </span>
        <span style={{ color: '#a1a1aa', fontSize: 11, flexShrink: 0 }}>選擇</span>
      </button>
      {picked && (
        <button
          type="button"
          onClick={() => setPicked(null)}
          style={{ marginTop: 4, border: 0, background: 'none', color: '#a1a1aa', fontSize: 11, cursor: 'pointer', padding: 0 }}
        >
          清除
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 720,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: 14, flexShrink: 0 }}>{label}</strong>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋商品名稱"
                style={{ flex: 1, minWidth: 0, padding: '6px 9px', fontSize: 13, border: '1px solid #d4d4d8', borderRadius: 5, fontFamily: 'inherit' }}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                style={{ border: 0, background: 'none', fontSize: 18, color: '#71717a', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
              {/* 分類 */}
              <div style={{ width: 132, flexShrink: 0, borderRight: '1px solid #f4f4f5', overflowY: 'auto', padding: 8 }}>
                {[{ key: ALL, label: '全部' }, ...categories.map((c) => ({ key: c, label: c }))].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCat(c.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 9px',
                      marginBottom: 2,
                      border: 0,
                      borderRadius: 6,
                      background: cat === c.key ? '#18181b' : 'transparent',
                      color: cat === c.key ? '#fff' : '#52525b',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* 商品格 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {visible.length === 0 ? (
                  <p style={{ color: '#a1a1aa', fontSize: 13, margin: 8 }}>沒有符合的商品。</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 10 }}>
                    {visible.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPicked(p);
                          setOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 8,
                          border: '1px solid #e4e4e7',
                          borderRadius: 9,
                          background: '#fff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        {p.image_url ? (
                          <img src={p.image_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, background: '#f4f4f5' }} />
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 6, background: '#f4f4f5' }} />
                        )}
                        <span style={{ fontSize: 12, color: '#18181b', lineHeight: 1.35 }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: p.stock > 0 ? '#71717a' : '#dc2626' }}>
                          {p.stock > 0 ? `庫存 ${p.stock}` : '無庫存'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
