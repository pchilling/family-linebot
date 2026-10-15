import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsForm } from './settings-form';
import { LogoUploader } from './logo-uploader';
import { BannerUploader } from './banner-uploader';
import { BannerManager } from './banner-manager';
import { SubmitButton } from '../../_components/submit-button';
import { addGiftRule, deleteGiftRule, setGiftMode } from './actions';
import { GiftProductPicker, type PickerProduct } from './gift-product-picker';

type BannerItem = { type: 'image' | 'video'; url: string };
type GiftRule = {
  threshold_twd: number;
  product_id: string;
  qty: number;
  repeat?: boolean; // Phase 18:每滿 N 元送一份
  fallback_product_id?: string | null; // Phase 18:主贈品缺貨時改送
};

type TenantFull = {
  id: string;
  name: string;
  description: string | null;
  brand_color: string | null;
  shop_bg_color: string | null;
  header_bg_color: string | null;
  og_image_url: string | null;
  logo_url: string | null;
  banners: BannerItem[] | null;
  contact_info: string | null;
  payment_info: string | null;
  gift_rules: { mode?: string; rules?: GiftRule[] } | null; // Phase 16(#12) / Phase 18
  plan: string;
  slug: string;
  order_prefix: string;
  features: Record<string, unknown> | null;
  status: string;
};

async function getTenantFull(slug: string): Promise<TenantFull | null> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, name, description, brand_color, shop_bg_color, header_bg_color, og_image_url, logo_url, banners, contact_info, payment_info, gift_rules, plan, slug, order_prefix, features, status',
    )
    .eq('slug', slug)
    .maybeSingle();
  return (data ?? null) as TenantFull | null;
}

const section: React.CSSProperties = {
  marginBottom: 28,
  padding: 20,
  border: '1px solid #ddd',
  borderRadius: 6,
  background: '#fff',
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 16, color: '#222' };

const giftInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid #d4d4d8',
  borderRadius: 5,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: '#fff',
};

const meta: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7rem 1fr',
  gap: '8px 16px',
  fontSize: 14,
};
const metaKey: React.CSSProperties = { color: '#888' };

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantFull(slug);
  if (!tenant) notFound();

  // Phase 16(#12):滿額贈 — 規則列表 + 贈品下拉用的商品清單
  const giftRules: GiftRule[] = Array.isArray(tenant.gift_rules?.rules) ? tenant.gift_rules.rules : [];
  // Phase 18:送法模式(沒設過一律當累積式,行為同改版前)
  const giftMode = tenant.gift_rules?.mode === 'highest' ? 'highest' : 'stack';
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

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>{tenant.name} · 攤位設定</h1>

      {/* 2026-09-05 版面重整:文字/顏色設定最上,圖片素材集中一區,系統資訊最後 */}
      <section style={section}>
        <h2 style={h2}>品牌設定</h2>
        <SettingsForm
          tenantSlug={tenant.slug}
          defaults={{
            name: tenant.name,
            description: tenant.description ?? '',
            brand_color: tenant.brand_color ?? '',
            shop_bg_color: tenant.shop_bg_color ?? '',
            header_bg_color: tenant.header_bg_color ?? '',
            contact_info: tenant.contact_info ?? '',
            payment_info: tenant.payment_info ?? '',
          }}
        />
      </section>

      {/* Phase 16(2026-09-11 回饋 #12):滿額贈 */}
      <section style={section}>
        <h2 style={h2}>滿額贈</h2>
        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
          以<strong>商品小計(折扣後)</strong>判斷。送出的贈品會變成訂單裡一行 0 元明細,
          自動扣庫存、印在出貨單上,所以贈品必須是攤位現有商品。
          <br />
          贈品庫存不足時會改送你設定的備用贈品;備用也沒貨就不送(不會擋下單、也不會扣成負庫存)。
        </p>

        {/* Phase 18:多條門檻的送法 */}
        <form action={setGiftMode} style={{ marginBottom: 16, padding: '12px 14px', background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: 8 }}>
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>多條門檻怎麼送</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'stack', title: '累積式', desc: '達到的每條門檻都送(滿 4000 → 2000 和 4000 的贈品都拿)' },
              { key: 'highest', title: '擇高式', desc: '只送達到的最高那條(滿 4000 → 只拿 4000 的贈品)' },
            ].map((m) => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="mode" value={m.key} defaultChecked={giftMode === m.key} style={{ marginTop: 3 }} />
                <span>
                  <strong>{m.title}</strong>
                  <span style={{ display: 'block', fontSize: 11.5, color: '#71717a', marginTop: 2 }}>{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <SubmitButton size="sm" pendingText="儲存中…">儲存送法</SubmitButton>
          </div>
        </form>

        {giftRules.length === 0 ? (
          <p style={{ fontSize: 13, color: '#a1a1aa', margin: '0 0 14px' }}>(尚未設定滿額贈)</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {giftRules.map((r, idx) => (
              <div
                key={`${r.threshold_twd}-${r.product_id}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <span style={{ flex: 1 }}>
                  {r.repeat ? '每滿' : '滿'} <strong>NT$ {r.threshold_twd.toLocaleString()}</strong> 送{' '}
                  <strong>{productName(r.product_id)}</strong>
                  {(r.qty ?? 1) > 1 ? ` ×${r.qty}` : ''}
                  {r.repeat && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, fontSize: 11, fontWeight: 700 }}>
                      可重複
                    </span>
                  )}
                  {r.fallback_product_id && (
                    <span style={{ display: 'block', fontSize: 11.5, color: '#92400e', marginTop: 3 }}>
                      缺貨時改送:{productName(r.fallback_product_id)}
                    </span>
                  )}
                </span>
                <form action={deleteGiftRule}>
                  <input type="hidden" name="tenant_slug" value={tenant.slug} />
                  <input type="hidden" name="idx" value={idx} />
                  <SubmitButton variant="danger" size="sm" pendingText="刪除中…" confirmText="確定刪除這條滿額贈規則?">
                    刪除
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={addGiftRule} style={{ padding: '12px 14px', border: '1px dashed #d4d4d8', borderRadius: 8 }}>
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>新增一條規則</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label style={{ fontSize: 12, color: '#52525b', minWidth: 0 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>
                滿額門檻(NT$) <span style={{ color: '#dc2626' }}>*</span>
              </span>
              <input name="threshold_twd" type="number" min="1" required placeholder="2000" style={giftInput} />
            </label>
            <GiftProductPicker
              name="product_id"
              products={products}
              label="贈品"
              placeholder="點選擇商品"
              required
            />
            <GiftProductPicker
              name="fallback_product_id"
              products={products}
              label="備用贈品(選填)"
              placeholder="主贈品缺貨時改送"
            />
            <label style={{ fontSize: 12, color: '#52525b', minWidth: 0 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>每次送幾個</span>
              <input name="qty" type="number" min="1" defaultValue={1} style={giftInput} />
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '12px 0 0', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" name="repeat" style={{ marginTop: 3 }} />
            <span>
              可重複
              <span style={{ display: 'block', fontSize: 11.5, color: '#71717a', marginTop: 2 }}>
                勾了就是「每滿這個金額送一份」— 門檻 2000 時,買 4000 送 2 份、6000 送 3 份。
                不勾就只送一份。
              </span>
            </span>
          </label>
          <div style={{ marginTop: 12 }}>
            <SubmitButton size="sm" pendingText="新增中…">新增規則</SubmitButton>
          </div>
        </form>
      </section>

      <section style={section}>
        <h2 style={h2}>🖼 圖片素材</h2>

        <h3 style={{ fontSize: 13, margin: '0 0 10px', color: '#444' }}>Logo</h3>
        <LogoUploader tenantSlug={tenant.slug} currentLogoUrl={tenant.logo_url} />

        <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '20px 0' }} />

        <h3 style={{ fontSize: 13, margin: '0 0 6px', color: '#444' }}>
          公開頁 Banner(多圖 / 影片 / YouTube 輪播)
        </h3>
        <p style={{ fontSize: 11, color: '#71717a', margin: '0 0 10px', lineHeight: 1.5 }}>
          建議尺寸 <strong>1200 × 900</strong>(寬:高 4:3)。影片同比例。
          首格 = 公開頁 hero 開頭。↑↓ 排序、上傳圖 / 影片、貼 YouTube URL。
        </p>
        <BannerManager
          tenantSlug={tenant.slug}
          banners={tenant.banners ?? []}
          legacyOgImageUrl={tenant.og_image_url}
        />

        <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '20px 0' }} />

        <h3 style={{ fontSize: 13, margin: '0 0 6px', color: '#444' }}>連結分享預覽圖</h3>
        <p style={{ fontSize: 11, color: '#71717a', margin: '0 0 10px', lineHeight: 1.5 }}>
          把攤位網址貼到 WhatsApp / LINE / FB / IG 訊息時,對方看到的那張小縮圖。
          建議 <strong>1200 × 630</strong>。社交平台只接 1 張圖(不能影片或輪播)。
        </p>
        <BannerUploader
          tenantSlug={tenant.slug}
          currentBannerUrl={tenant.og_image_url}
        />
      </section>

      <section style={section}>
        <h2 style={h2}>系統資訊(不可改)</h2>
        <dl style={meta}>
          <dt style={metaKey}>Slug</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{tenant.slug}</dd>
          <dt style={metaKey}>方案</dt>
          <dd style={{ margin: 0 }}>{tenant.plan}</dd>
          <dt style={metaKey}>訂單編號 prefix</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace' }}>{tenant.order_prefix}-YYYYMM-NNNN</dd>
          <dt style={metaKey}>狀態</dt>
          <dd style={{ margin: 0 }}>{tenant.status}</dd>
          <dt style={metaKey}>Features</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>
            {tenant.features && Object.keys(tenant.features).length > 0
              ? JSON.stringify(tenant.features)
              : '(空)'}
          </dd>
        </dl>
        <p style={{ fontSize: 12, color: '#999', marginTop: 16, marginBottom: 0 }}>
          升級方案 / 啟用 LINE Bot / LIFF / 改 slug 等請聯繫 NEO。
        </p>
      </section>
    </main>
  );
}
