import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { effectiveStatus, getCurrentGroupBuy } from '@/lib/groupbuy';
import { countPushRecipients } from '@/lib/groupbuy-notify';
import { IconBell, IconChevronLeft } from '@/lib/icons';
import { SubmitButton } from '../../../_components/submit-button';
import { createGroupBuy } from '../actions';

/**
 * 開團表單(Phase 35,2026-11-07)。規格:docs/GROUPBUY.md 第四、六節。
 * 團名 / 說明 / 截止時間(留空 = 手動截止)/ 預計到貨日 / 推 LINE 通知給全部好友(顯示會推給幾人、提醒額度)。
 * 下方「這團賣什麼」列 channel=groupbuy 的商品;0 件提醒先去商品編輯頁改。
 */

type GbProduct = {
  id: string;
  name: string;
  status: string;
  image_url: string | null;
  media: { type: 'image' | 'video'; url: string }[] | null;
  product_variants: { id: string; status: string }[] | null;
};

const CSS = `
.gbn-back{display:inline-flex;align-items:center;gap:2px;font-size:13px;color:#71717a;text-decoration:none;margin-bottom:10px}
.gbn-back:hover{color:#18181b}
.gbn-head h1{margin:0 0 18px;font-size:22px;font-weight:600;letter-spacing:-.02em}
.gbn-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.gbn-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:20px}
.gbn-card h2{margin:0 0 4px;font-size:14px;font-weight:600}
.gbn-card .d{margin:0 0 14px;font-size:12.5px;color:#71717a;line-height:1.55}
.gbn-form{display:grid;gap:14px}
.gbn-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gbn-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid #e4e4e7;border-radius:8px;background:#fafafa}
.gbn-row .t{font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:6px}
.gbn-row .s{font-size:12.5px;color:#71717a;margin-top:3px;line-height:1.5}
.gbn-list{display:flex;flex-direction:column;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}
.gbn-li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #f4f4f5;font-size:13.5px;color:#18181b;text-decoration:none}
.gbn-li:first-child{border-top:0}
.gbn-li:hover{background:#fafafa}
.gbn-li img,.gbn-li .ph{width:32px;height:42px;border-radius:5px;object-fit:cover;background:#f4f4f5;flex:none;border:1px solid #f4f4f5}
.gbn-li .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.gbn-li .m{font-size:12px;color:#71717a;white-space:nowrap}
.gbn-warn{padding:12px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#78350f;font-size:13px;line-height:1.6}
.gbn-warn a{color:#78350f;font-weight:600}
@media (max-width:1023px){.gbn-grid{grid-template-columns:1fr}}
@media (max-width:767px){.gbn-card{padding:14px;border-radius:10px}.gbn-two{grid-template-columns:1fr}}
`;

export default async function NewGroupBuyPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // 已經有一團收單中就不給開,直接回列表
  const current = await getCurrentGroupBuy(tenant.id);
  if (current && effectiveStatus(current) === 'open') redirect(`/admin/${tenant.slug}/groupbuy`);

  const [recipients, { data: prows }] = await Promise.all([
    countPushRecipients(tenant.id),
    supabaseAdmin
      .from('products')
      .select('id, name, status, image_url, media, product_variants(id, status)')
      .eq('tenant_id', tenant.id)
      .eq('channel', 'groupbuy')
      .order('created_at', { ascending: false }),
  ]);
  const products = ((prows ?? []) as unknown as GbProduct[]);
  const activeProducts = products.filter((p) => p.status === 'active');

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Link href={`/admin/${tenant.slug}/groupbuy`} className="gbn-back">
        <IconChevronLeft size={14} /> 團購
      </Link>
      <header className="gbn-head">
        <h1>開團</h1>
      </header>

      <div className="gbn-grid">
        <form action={createGroupBuy} className="gbn-card gbn-form">
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <div>
            <h2>這一團</h2>
            <p className="d">送出就開始收單。截止時間到了會自動變成已截止,留空就要自己按「提前截止」。</p>
          </div>
          <div>
            <label className="ui-label" htmlFor="gb-name">團名<i>*</i></label>
            <input id="gb-name" name="name" required maxLength={60} className="ui-input" placeholder="例:11 月韓國零食團" autoComplete="off" />
          </div>
          <div>
            <label className="ui-label" htmlFor="gb-desc">說明<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></label>
            <textarea id="gb-desc" name="description" rows={4} maxLength={1000} className="ui-input" placeholder="怎麼訂、什麼時候出貨、注意事項。客人在團購分頁看得到。" />
          </div>
          <div className="gbn-two">
            <div>
              <label className="ui-label" htmlFor="gb-ends">截止時間<span style={{ color: '#71717a', fontWeight: 400 }}>(留空 = 手動截止)</span></label>
              <input id="gb-ends" name="ends_at" type="datetime-local" className="ui-input" style={{ display: 'block', WebkitAppearance: 'none', appearance: 'none' }} />
            </div>
            <div>
              <label className="ui-label" htmlFor="gb-arr">預計到貨日<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></label>
              <input id="gb-arr" name="expected_arrival_on" type="date" className="ui-input" style={{ display: 'block', WebkitAppearance: 'none', appearance: 'none' }} />
            </div>
          </div>
          <div className="gbn-row">
            <div>
              <div className="t"><IconBell size={14} /> 推 LINE 通知給全部好友</div>
              <div className="s">
                會推給 <b style={{ color: '#18181b' }}>{recipients}</b> 位好友,每人一則,會用掉 LINE 推播額度。沒勾就只在團購分頁顯示。
              </div>
            </div>
            <span className="ui-switch" style={{ marginTop: 2 }}>
              <input type="checkbox" name="notify_on_open" aria-label="推 LINE 通知給全部好友" disabled={recipients === 0} />
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SubmitButton pendingText="開團中…">開團</SubmitButton>
          </div>
        </form>

        <aside className="gbn-card">
          <h2>這團賣什麼</h2>
          <p className="d">所有「賣在團購」的商品都會在這一團上架,{activeProducts.length} 件上架中{products.length > activeProducts.length ? `、${products.length - activeProducts.length} 件已下架` : ''}。</p>
          {products.length === 0 ? (
            <div className="gbn-warn">
              還沒有團購商品。先到<Link href={`/admin/${tenant.slug}/products`}>商品</Link>的編輯頁,把「賣在哪裡」改成團購,再回來開團。
            </div>
          ) : (
            <div className="gbn-list">
              {products.map((p) => {
                const cover = (p.media ?? []).find((m) => m.type === 'image')?.url ?? p.image_url;
                const vCount = (p.product_variants ?? []).filter((v) => v.status === 'active').length;
                return (
                  <Link key={p.id} href={`/admin/${tenant.slug}/products/${p.id}`} className="gbn-li">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" />
                    ) : (
                      <span className="ph" />
                    )}
                    <span className="n">{p.name}</span>
                    <span className="m">
                      {p.status !== 'active' ? '已下架 · ' : ''}{vCount} 規格
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
