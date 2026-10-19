'use client';

/**
 * 規格與庫存分頁(2026-10-20 商品頁改版)
 *
 * 原本每個規格一張卡、每張卡一顆儲存,改成一張表格、整個分頁一顆儲存。
 * 所有編輯先留在畫面上(含順序、新增、刪除),按「儲存規格與庫存」才一次送出。
 * 分階定價也在同一張表單裡一起存。
 */
import { useMemo, useState } from 'react';
import { saveVariantsBulk } from '../../../actions';
import { SubmitButton } from '../../../_components/submit-button';
import { ProductImageUploader } from '../image-uploader';

export type VariantRowData = {
  id: string;
  sku: string;
  variant_name: string;
  price_twd: number;
  cost_twd: number | null;
  stock: number;
  status: string;
  is_bundle: boolean;
  image_url: string | null;
  sort_order: number | null;
};
export type TierRowData = { id: string; min_qty: number; price_twd: number };

type VRow = {
  key: string;
  id: string | null;
  sku: string;
  name: string;
  price: string;
  cost: string;
  stock: string;
  status: string;
  bundle: boolean;
  image_url: string | null;
};
type TRow = { key: string; id: string | null; min: string; price: string };

let seq = 0;
const nextKey = () => `new-${Date.now().toString(36)}-${seq++}`;

function toVRow(v: VariantRowData): VRow {
  return {
    key: v.id,
    id: v.id,
    sku: v.sku,
    name: v.variant_name,
    price: String(v.price_twd),
    cost: v.cost_twd === null ? '' : String(v.cost_twd),
    stock: String(v.stock),
    status: v.status,
    bundle: v.is_bundle,
    image_url: v.image_url,
  };
}
function toTRow(t: TierRowData): TRow {
  return { key: t.id, id: t.id, min: String(t.min_qty), price: String(t.price_twd) };
}

const cell: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f4f4f5', verticalAlign: 'middle' };
const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 10px', fontSize: 12, fontWeight: 600, color: '#71717a',
  background: '#fafafa', borderBottom: '1px solid #e4e4e7', whiteSpace: 'nowrap',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid #e4e4e7',
  borderRadius: 7, background: '#fff', fontSize: 13, color: '#18181b', fontFamily: 'inherit', minWidth: 0,
};
const numInput: React.CSSProperties = { ...input, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const iconBtn = (disabled: boolean): React.CSSProperties => ({
  width: 26, height: 24, border: '1px solid #e4e4e7', borderRadius: 5, background: '#fff',
  color: disabled ? '#d4d4d8' : '#52525b', cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 11, lineHeight: 1, fontFamily: 'inherit',
});
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: '1px solid #e4e4e7',
  borderRadius: 8, background: '#fff', color: '#18181b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

export function VariantsTable({
  tenantSlug,
  tenantId,
  productId,
  productName,
  defaultPrice,
  variants,
  tiers,
}: {
  tenantSlug: string;
  tenantId: string;
  productId: string;
  productName: string;
  defaultPrice: number;
  variants: VariantRowData[];
  tiers: TierRowData[];
}) {
  const initialRows = useMemo(() => variants.map(toVRow), [variants]);
  const initialTiers = useMemo(() => tiers.map(toTRow), [tiers]);
  const [rows, setRows] = useState<VRow[]>(initialRows);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [trows, setTrows] = useState<TRow[]>(initialTiers);
  const [tdeleted, setTdeleted] = useState<string[]>([]);
  const [imgOpen, setImgOpen] = useState<string | null>(null);

  const dirty =
    JSON.stringify(rows) !== JSON.stringify(initialRows) ||
    JSON.stringify(trows) !== JSON.stringify(initialTiers) ||
    deleted.length > 0 ||
    tdeleted.length > 0;

  function patch(key: string, p: Partial<VRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }
  function removeRow(r: VRow) {
    if (rows.length <= 1) return; // 至少留一個規格
    setRows((rs) => rs.filter((x) => x.key !== r.key));
    if (r.id) setDeleted((d) => [...d, r.id!]);
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      { key: nextKey(), id: null, sku: '', name: '', price: String(defaultPrice), cost: '', stock: '0', status: 'active', bundle: false, image_url: null },
    ]);
  }
  function patchTier(key: string, p: Partial<TRow>) {
    setTrows((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)));
  }
  function removeTier(t: TRow) {
    setTrows((ts) => ts.filter((x) => x.key !== t.key));
    if (t.id) setTdeleted((d) => [...d, t.id!]);
  }
  function addTier() {
    setTrows((ts) => [...ts, { key: nextKey(), id: null, min: '', price: '' }]);
  }
  function reset() {
    setRows(initialRows);
    setTrows(initialTiers);
    setDeleted([]);
    setTdeleted([]);
  }

  return (
    <form action={saveVariantsBulk} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="product_id" value={productId} />
      {deleted.map((id) => <input key={id} type="hidden" name="v_deleted" value={id} />)}
      {tdeleted.map((id) => <input key={id} type="hidden" name="t_deleted" value={id} />)}

      {/* 規格 */}
      <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>規格</h2>
            <div style={{ fontSize: 12, color: '#71717a', marginTop: 3 }}>第一列是客人進商品頁預設看到的規格;用箭頭調整順序。</div>
          </div>
          <button type="button" onClick={addRow} style={ghostBtn}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span> 新增規格
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, width: 66 }}>順序</th>
                <th scope="col" style={th}>規格名稱</th>
                <th scope="col" style={{ ...th, width: 104 }}>售價</th>
                <th scope="col" style={{ ...th, width: 96 }}>成本</th>
                <th scope="col" style={{ ...th, width: 88 }}>庫存</th>
                <th scope="col" style={{ ...th, width: 96 }}>狀態</th>
                <th scope="col" style={{ ...th, width: 70, textAlign: 'center' }}>組合品</th>
                <th scope="col" style={{ ...th, width: 96 }}>圖片</th>
                <th scope="col" style={{ ...th, width: 40 }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>刪除</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <RowGroup key={r.key}>
                  <tr style={{ background: r.id ? undefined : '#f0fdf4' }}>
                    <td style={cell}>
                      <input type="hidden" name="v_id" value={r.id ?? ''} />
                      <input type="hidden" name="v_bundle" value={r.bundle ? '1' : '0'} />
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="往上移" style={iconBtn(i === 0)}>↑</button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="往下移" style={iconBtn(i === rows.length - 1)}>↓</button>
                      </div>
                    </td>
                    <td style={cell}>
                      <input name="v_name" value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} required placeholder="例:1台、紅色、15ML" aria-label="規格名稱" style={input} />
                      {r.sku && <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 3, fontFamily: 'var(--font-geist-mono), monospace' }}>{r.sku}</div>}
                      {!r.id && <div style={{ fontSize: 10.5, color: '#16a34a', marginTop: 3 }}>新規格,儲存後產生 SKU</div>}
                    </td>
                    <td style={cell}><input name="v_price" type="number" min={0} value={r.price} onChange={(e) => patch(r.key, { price: e.target.value })} required aria-label="售價" style={numInput} /></td>
                    <td style={cell}><input name="v_cost" type="number" min={0} value={r.cost} onChange={(e) => patch(r.key, { cost: e.target.value })} aria-label="成本" placeholder="—" style={numInput} /></td>
                    <td style={cell}><input name="v_stock" type="number" min={0} value={r.stock} onChange={(e) => patch(r.key, { stock: e.target.value })} aria-label="庫存" style={{ ...numInput, ...(Number(r.stock) <= 0 ? { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' } : {}) }} /></td>
                    <td style={cell}>
                      <select name="v_status" value={r.status} onChange={(e) => patch(r.key, { status: e.target.value })} aria-label="狀態" style={input}>
                        <option value="active">上架</option>
                        <option value="inactive">暫停</option>
                        <option value="discontinued">下架</option>
                      </select>
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <input type="checkbox" checked={r.bundle} onChange={(e) => patch(r.key, { bundle: e.target.checked })} aria-label="組合品(固定價,不參與分階)" title="組合品:固定價,數量與價格都不參與分階" />
                    </td>
                    <td style={cell}>
                      {r.id ? (
                        <button type="button" onClick={() => setImgOpen(imgOpen === r.key ? null : r.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 3, border: '1px solid #e4e4e7', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }} aria-expanded={imgOpen === r.key}>
                          {r.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image_url} alt="" style={{ width: 28, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                          ) : (
                            <span style={{ width: 28, height: 36, borderRadius: 4, background: '#f4f4f5', display: 'inline-block' }} />
                          )}
                          <span style={{ fontSize: 11.5, color: '#52525b', paddingRight: 4 }}>{r.image_url ? '更換' : '上傳'}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#a1a1aa' }}>儲存後可上傳</span>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <button type="button" onClick={() => removeRow(r)} disabled={rows.length <= 1} aria-label="刪除此規格" title={rows.length <= 1 ? '至少要留一個規格' : '刪除此規格'} style={{ width: 26, height: 26, border: 0, borderRadius: 6, background: 'none', color: rows.length <= 1 ? '#e4e4e7' : '#a1a1aa', cursor: rows.length <= 1 ? 'not-allowed' : 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                  {imgOpen === r.key && r.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '6px 10px 14px 76px', background: '#fafafa', borderBottom: '1px solid #f4f4f5' }}>
                        <ProductImageUploader entity="variant" entityId={r.id} tenantSlug={tenantSlug} currentImageUrl={r.image_url} productName={`${productName} ${r.name}`} />
                      </td>
                    </tr>
                  )}
                </RowGroup>
              ))}
            </tbody>
          </table>
        </div>
        {deleted.length > 0 && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#b45309', background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
            已標記刪除 {deleted.length} 個規格,按下方儲存才會真的刪除。
          </div>
        )}
      </section>

      {/* 分階定價 */}
      <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>量購價(分階定價)</h2>
            <div style={{ fontSize: 12, color: '#71717a', marginTop: 3 }}>買滿 N 件就用該階單價;同商品不同規格的數量合併計算,組合品不參與。限時優惠生效時暫停。</div>
          </div>
          <button type="button" onClick={addTier} style={ghostBtn}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span> 新增一階
          </button>
        </div>
        {trows.length === 0 ? (
          <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, color: '#a1a1aa' }}>尚未設定,所有數量都用規格售價。</p>
        ) : (
          <table style={{ width: '100%', maxWidth: 560, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, width: 180 }}>買滿(件)</th>
                <th scope="col" style={{ ...th, width: 180 }}>每件單價</th>
                <th scope="col" style={th}></th>
              </tr>
            </thead>
            <tbody>
              {trows.map((t) => (
                <tr key={t.key} style={{ background: t.id ? undefined : '#f0fdf4' }}>
                  <td style={cell}>
                    <input type="hidden" name="t_id" value={t.id ?? ''} />
                    <input name="t_min" type="number" min={2} value={t.min} onChange={(e) => patchTier(t.key, { min: e.target.value })} required placeholder="例:2" aria-label="買滿件數" style={numInput} />
                  </td>
                  <td style={cell}><input name="t_price" type="number" min={0} value={t.price} onChange={(e) => patchTier(t.key, { price: e.target.value })} required placeholder="例:1700" aria-label="每件單價" style={numInput} /></td>
                  <td style={cell}>
                    <button type="button" onClick={() => removeTier(t)} aria-label="刪除此階" style={{ width: 26, height: 26, border: 0, borderRadius: 6, background: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 儲存列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', border: `1px solid ${dirty ? '#18181b' : '#e4e4e7'}`, borderRadius: 10, position: 'sticky', bottom: 12, boxShadow: '0 -4px 16px rgba(0,0,0,.04)' }}>
        <span style={{ fontSize: 12.5, color: dirty ? '#18181b' : '#a1a1aa', marginRight: 'auto', fontWeight: dirty ? 600 : 400 }}>
          {dirty ? '有尚未儲存的變更' : '沒有變更'}
        </span>
        <button type="button" onClick={reset} disabled={!dirty} style={{ ...ghostBtn, opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'default' }}>還原</button>
        <SubmitButton pendingText="儲存中…">儲存規格與庫存</SubmitButton>
      </div>
    </form>
  );
}

/** 讓一列(含展開的圖片列)在 map 裡共用同一個 key,不多包 DOM */
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
