'use client';

/**
 * 新增商品 modal(2026-10-20)
 * 原本是列表最底下的摺疊區,要往下捲再展開。改成右上角按鈕 → 彈窗。
 * 建立成功會直接進該商品的編輯頁(規格分頁),接著補規格與圖片。
 */
import { useEffect, useRef, useState } from 'react';
import { createProduct } from '../../actions';
import { SubmitButton } from '../../_components/submit-button';
import { ProductImageUploader } from './image-uploader';

const input: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
  border: '1px solid #e4e4e7', borderRadius: 7, fontFamily: 'inherit', background: '#fff', color: '#18181b',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: '#52525b', marginBottom: 4 };

export function NewProductModal({
  tenantId,
  tenantSlug,
  categories,
  badgeColors,
}: {
  tenantId: string;
  tenantSlug: string;
  categories: string[];
  badgeColors: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  // 2026-10-20:圖片在 modal 裡就先上傳好(草稿模式),建立商品時一起帶進去
  const [images, setImages] = useState<string[]>([]);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 0, borderRadius: 8,
          background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>+</span> 新增商品
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-product-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 720, background: '#fff', borderRadius: 12,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 id="new-product-title" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>新增商品</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                style={{ width: 30, height: 30, border: 0, background: 'none', fontSize: 20, color: '#71717a', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <form action={createProduct} style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 14px' }}>
              <input type="hidden" name="tenant_id" value={tenantId} />
              <input type="hidden" name="tenant_slug" value={tenantSlug} />
              <input type="hidden" name="return_to" value="edit" />
              <label style={{ gridColumn: '1 / -1' }}>
                <span style={label}>商品名稱 <span style={{ color: '#dc2626' }}>*</span></span>
                <input ref={firstRef} name="name" required style={input} placeholder="例:精油瓶水氧機" />
              </label>
              <label>
                <span style={label}>分類</span>
                <input name="category" list="new-product-cats" style={input} placeholder="輸入或從清單選" />
                <datalist id="new-product-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label>
                <span style={label}>售價 <span style={{ color: '#dc2626' }}>*</span></span>
                <input name="price_twd" type="number" min={0} required style={input} placeholder="例:1800" />
              </label>
              <label>
                <span style={label}>成本(選填)</span>
                <input name="cost_twd" type="number" min={0} style={input} placeholder="—" />
              </label>
              <label>
                <span style={label}>初始庫存</span>
                <input name="stock" type="number" min={0} defaultValue={0} style={input} />
              </label>
              <label>
                <span style={label}>角標(選填,如 HOT、新品)</span>
                <input name="badge" maxLength={8} style={input} placeholder="HOT" />
              </label>
              <label>
                <span style={label}>角標顏色</span>
                <select name="badge_color" defaultValue="" style={input}>
                  {badgeColors.map((bc) => <option key={bc.value || 'default'} value={bc.value}>{bc.label}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span style={label}>商品說明(選填)</span>
                <textarea name="description" rows={3} style={{ ...input, resize: 'vertical' }} />
              </label>

              {/* 商品圖:在這裡就上傳完,不用建立後再去編輯頁補 */}
              <div style={{ gridColumn: '1 / -1', padding: '12px 14px', border: '1px solid #e4e4e7', borderRadius: 10, background: '#fafafa' }}>
                <span style={{ ...label, fontWeight: 600, color: '#18181b' }}>商品圖(可多張,第一張是封面)</span>
                {images.map((url) => <input key={url} type="hidden" name="media_url" value={url} />)}
                {images.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {images.map((url, i) => (
                      <div key={url} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={{ width: 60, height: 80, objectFit: 'cover', borderRadius: 6, border: `2px solid ${i === 0 ? '#18181b' : '#e4e4e7'}`, display: 'block' }} />
                        {i === 0 && <span style={{ position: 'absolute', left: 4, top: 4, padding: '1px 5px', borderRadius: 3, background: '#18181b', color: '#fff', fontSize: 9.5, fontWeight: 700 }}>封面</span>}
                        <button
                          type="button"
                          onClick={() => setImages((xs) => xs.filter((x) => x !== url))}
                          aria-label="移除這張圖"
                          style={{ position: 'absolute', right: -6, top: -6, width: 20, height: 20, borderRadius: '50%', border: '1px solid #e4e4e7', background: '#fff', color: '#52525b', fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 0 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ProductImageUploader
                  entity="draft"
                  entityId=""
                  tenantSlug={tenantSlug}
                  currentImageUrl={null}
                  productName="新商品"
                  compact
                  uploadLabel={images.length === 0 ? '上傳商品圖' : '再加一張'}
                  onUploaded={(url) => setImages((xs) => [...xs, url])}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#71717a' }}>建立後會直接進編輯頁,接著補規格與圖片。</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setOpen(false)} style={{ padding: '9px 14px', border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    取消
                  </button>
                  <SubmitButton pendingText="建立中…">建立商品</SubmitButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
