import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { Badge, Input, Switch } from '@/lib/ui';
import { Field, GroupHead, PanelTitle, SwitchRow } from '../settings-ui';
import { DeleteIconButton, GiftModeControl, SaveButton } from '../settings-client';
import { GiftProductPicker, type PickerProduct } from '../gift-product-picker';
import { addGiftRule, deleteGiftRule } from '../actions';

type GiftRule = {
  threshold_twd: number;
  product_id: string;
  qty: number;
  repeat?: boolean; // Phase 18:每滿 N 元送一份
  fallback_product_id?: string | null; // Phase 18:主贈品缺貨時改送
};

/**
 * 設定 → 行銷(2026-11-01 改版):滿額贈(Phase 16 / 18)。
 * 送法切換點了直接存;規則新增 / 刪除也各自立即生效,所以這頁沒有底部儲存列。
 */
export default async function PromoSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin.from('tenants').select('id, gift_rules').eq('slug', slug).maybeSingle();
  if (!data) notFound();
  const tenant = data as { id: string; gift_rules: { mode?: string; rules?: GiftRule[] } | null };

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
      <PanelTitle title="行銷" desc="滿額贈。以後折扣碼、會員優惠也放這裡。" />

      <div className="sx-group">
        <GroupHead
          title="滿額贈"
          desc="以商品小計(折扣後)判斷。贈品是訂單裡一行 0 元明細,會自動扣庫存、印在出貨單上,所以必須是攤位現有商品。主贈品缺貨時改送備用贈品,備用也沒貨就不送。"
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
    </div>
  );
}
