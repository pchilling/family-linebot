import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Badge, Input, Switch } from '@/lib/ui';
import { Field, GroupHead, PanelTitle, SwitchRow } from '../settings-ui';
import { DeleteIconButton, DiscountCodeForm, DiscountEnabledSwitch, GiftModeControl, SaveButton } from '../settings-client';
import { GiftProductPicker, type PickerProduct } from '../gift-product-picker';
import { IconTrash } from '@/lib/icons';
import { addGiftRule, deleteDiscountCode, deleteGiftRule } from '../actions';

type GiftRule = {
  threshold_twd: number;
  product_id: string;
  qty: number;
  repeat?: boolean; // Phase 18:每滿 N 元送一份
  fallback_product_id?: string | null; // Phase 18:主贈品缺貨時改送
};

// Phase 33(2026-11-06):折扣碼
type DiscountCodeRow = {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  min_subtotal: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  per_customer_once: boolean;
  enabled: boolean;
  created_at: string;
};
type DcStatus = 'active' | 'upcoming' | 'exhausted' | 'ended' | 'off';
const DC_STATUS_ORDER: Record<DcStatus, number> = { active: 0, upcoming: 1, exhausted: 2, ended: 3, off: 4 };
const DC_STATUS_LABEL: Record<DcStatus, { text: string; cls: string }> = {
  active: { text: '進行中', cls: 'sx-badge-ok' },
  upcoming: { text: '未開始', cls: 'sx-badge-info' },
  exhausted: { text: '已用完', cls: 'sx-badge-off' },
  ended: { text: '已結束', cls: 'sx-badge-off' },
  off: { text: '停用', cls: 'sx-badge-off' },
};
function dcStatusOf(r: DiscountCodeRow, nowMs: number): DcStatus {
  if (!r.enabled) return 'off';
  if (r.ends_at && nowMs > new Date(r.ends_at).getTime()) return 'ended';
  if (r.max_uses !== null && r.used_count >= r.max_uses) return 'exhausted';
  if (r.starts_at && nowMs < new Date(r.starts_at).getTime()) return 'upcoming';
  return 'active';
}
const twMD = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
function dcPeriod(r: DiscountCodeRow): string {
  if (r.starts_at && r.ends_at) return `${twMD(r.starts_at)} – ${twMD(r.ends_at)}`;
  if (r.starts_at) return `${twMD(r.starts_at)} 起`;
  if (r.ends_at) return `至 ${twMD(r.ends_at)}`;
  return '不限';
}

/**
 * 設定 → 行銷(2026-11-01 改版):滿額贈(Phase 16 / 18)、折扣碼(Phase 33)。
 * 送法切換點了直接存;規則新增 / 刪除也各自立即生效,所以這頁沒有底部儲存列。
 */
export default async function PromoSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin.from('tenants').select('id, gift_rules').eq('slug', slug).maybeSingle();
  if (!data) notFound();
  const tenant = data as { id: string; gift_rules: { mode?: string; rules?: GiftRule[] } | null };

  // Phase 33:折扣碼清單,server 端算狀態、排序(進行中 → 未開始 → 已用完 → 已結束 → 停用)
  const { data: dcRows } = await supabaseAdmin
    .from('discount_codes')
    .select('id, code, type, value, min_subtotal, starts_at, ends_at, max_uses, used_count, per_customer_once, enabled, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });
  const nowMs = Date.now();
  const discountCodes = (((dcRows ?? []) as unknown) as DiscountCodeRow[])
    .map((r) => ({ ...r, st: dcStatusOf(r, nowMs) }))
    .sort((a, b) => DC_STATUS_ORDER[a.st] - DC_STATUS_ORDER[b.st]);

  const giftRules: GiftRule[] = Array.isArray(tenant.gift_rules?.rules) ? tenant.gift_rules.rules : [];
  // 沒設過一律當累積式,行為同改版前
  const giftMode: 'stack' | 'highest' = tenant.gift_rules?.mode === 'highest' ? 'highest' : 'stack';

  const { data: productRows } = await supabaseAdmin
    .from('products')
    .select('id, name, category, image_url, product_variants(stock, status)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .order('name');
  type ProductRow = {
    id: string;
    name: string;
    category: string | null;
    image_url: string | null;
    product_variants: { stock: number; status: string }[] | null;
  };
  const products: PickerProduct[] = ((productRows ?? []) as unknown as ProductRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    image_url: p.image_url,
    // 真實庫存在變體,這裡用 active 變體加總(跟商品頁的顯示一致)
    stock: (p.product_variants ?? [])
      .filter((v) => v.status === 'active')
      .reduce((s, v) => s + v.stock, 0),
  }));
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '(已下架商品)';
  const money = (n: number) => `NT$ ${n.toLocaleString()}`;

  return (
    <div className="sx-body">
      <PanelTitle title="行銷" desc="滿額贈與折扣碼。" />

      <div className="sx-group">
        <GroupHead
          title="滿額贈"
          desc="以商品小計(特價 / 量購價後、折扣碼折抵前)判斷。贈品是訂單裡一行 0 元明細,會自動扣庫存、印在出貨單上,所以必須是攤位現有商品。主贈品缺貨時改送備用贈品,備用也沒貨就不送。"
        />

        <SwitchRow
          title="多條門檻怎麼送"
          desc="累積式:達到的每一條都送(滿 4000 → 2000 和 4000 的都拿)。擇高式:只送達到的最高那條。點了立即生效。"
          control={<GiftModeControl slug={slug} mode={giftMode} />}
        />

        {giftRules.length === 0 ? (
          <div className="sx-callout">還沒有滿額贈規則,用下面的表單新增。</div>
        ) : (
          <div className="sx-list">
            {giftRules.map((r, idx) => (
              <div key={`${r.threshold_twd}-${r.product_id}-${idx}`} className="sx-li">
                <div className="main">
                  <div className="t">
                    {r.repeat ? '每滿' : '滿'} <span className="sx-mono">{money(r.threshold_twd)}</span> 送 {productName(r.product_id)}
                    {(r.qty ?? 1) > 1 ? ` ×${r.qty}` : ''}
                    {r.repeat && <Badge className="sx-badge-info">可重複</Badge>}
                  </div>
                  {r.fallback_product_id && <div className="d">缺貨時改送:{productName(r.fallback_product_id)}</div>}
                </div>
                <form action={deleteGiftRule} className="sx-ops">
                  <input type="hidden" name="tenant_slug" value={slug} />
                  <input type="hidden" name="idx" value={idx} />
                  <DeleteIconButton confirmText="確定刪除這條滿額贈規則?" />
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={addGiftRule} className="sx-dash">
          <input type="hidden" name="tenant_slug" value={slug} />
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>新增一條規則</div>
          <div className="sx-grid4">
            <Field label="滿額門檻" htmlFor="gift-threshold">
              <Input id="gift-threshold" name="threshold_twd" type="number" min={1} required placeholder="2000" />
            </Field>
            <GiftProductPicker name="product_id" products={products} label="贈品" placeholder="點選擇商品" required />
            <GiftProductPicker name="fallback_product_id" products={products} label="備用贈品(選填)" placeholder="主贈品缺貨時改送" />
            <Field label="每次送幾個" htmlFor="gift-qty">
              <Input id="gift-qty" name="qty" type="number" min={1} defaultValue={1} />
            </Field>
          </div>
          <SwitchRow
            title="可重複"
            desc="每滿這個金額就送一份:門檻 2,000 時,買 4,000 送 2 份、6,000 送 3 份。不開只送一份。"
            control={<Switch name="repeat" aria-label="可重複" />}
          />
          <div>
            <SaveButton pendingText="新增中…">新增規則</SaveButton>
          </div>
        </form>
      </div>

      <hr className="sx-sep" />

      {/* Phase 33(2026-11-06):折扣碼 */}
      <div className="sx-group">
        <GroupHead
          title="折扣碼"
          desc="客人在結帳頁右邊商品明細輸入才生效,商店頁不會公開列出。只折商品小計、不折運費;免運門檻和滿額贈都照折扣前的小計算。停用後客人馬上不能用,已成立的訂單不受影響;用過的碼只能停用不能刪。"
        />

        {discountCodes.length === 0 ? (
          <div className="sx-callout">還沒有折扣碼,用下面的表單新增。</div>
        ) : (
          <div className="sx-list">
            <div className="sx-dc sx-dc-head" aria-hidden>
              <span>折扣碼</span>
              <span>內容</span>
              <span>期間</span>
              <span style={{ textAlign: 'right' }}>已用</span>
              <span />
            </div>
            {discountCodes.map((r) => {
              const st = DC_STATUS_LABEL[r.st];
              const main =
                r.type === 'percent'
                  ? `便宜 ${r.value}%${r.value % 10 === 0 ? `(${(100 - r.value) / 10} 折)` : ''}`
                  : `折 ${money(r.value)}`;
              const conds = [
                r.min_subtotal !== null ? `滿 ${money(r.min_subtotal)} 可用` : null,
                r.per_customer_once ? '每人限一次' : null,
              ].filter((x): x is string => !!x);
              const isFull = r.max_uses !== null && r.used_count >= r.max_uses;
              return (
                <div key={r.id} className="sx-dc" data-off={r.st === 'off' ? 'true' : undefined}>
                  <div className="code">
                    <span className="sx-mono">{r.code}</span>
                    <Badge className={st.cls}>{st.text}</Badge>
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{main}</div>
                    <div className="d">{conds.length > 0 ? conds.join(' · ') : '不限金額'}</div>
                  </div>
                  <div className="per">{dcPeriod(r)}</div>
                  <div className={`use ui-num${isFull ? ' full' : ''}`}>
                    {r.max_uses !== null ? `${r.used_count} / ${r.max_uses}` : `${r.used_count} 次`}
                  </div>
                  <div className="ops">
                    <DiscountEnabledSwitch slug={slug} id={r.id} enabled={r.enabled} />
                    {r.used_count > 0 ? (
                      <button type="button" className="sx-ib" disabled title="已有訂單用過,只能停用" aria-label="已有訂單用過,只能停用">
                        <IconTrash size={15} />
                      </button>
                    ) : (
                      <form action={deleteDiscountCode}>
                        <input type="hidden" name="tenant_slug" value={slug} />
                        <input type="hidden" name="id" value={r.id} />
                        <DeleteIconButton confirmText={`刪除折扣碼 ${r.code}?只是暫時不想給人用,建議按停用就好。`} />
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DiscountCodeForm slug={slug} />
      </div>
    </div>
  );
}
