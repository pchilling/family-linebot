import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { Stars } from '@/lib/ui';
import { setReviewStatus } from './actions';
import { FlashToast } from '../../../_components/toast';

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string; show?: string; kind?: string }>;
};

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
  products?: { name: string; slug: string | null } | null; // 店家評價沒有這欄
  orders: { order_no: string } | null;
};

/**
 * 後台評價列表(Phase 25):看客人給的星星與留言,不當內容可隱藏(不會刪、不能改分)。
 * Phase 30(2026-11-01):多「店家」分頁(tenant_reviews),規則一樣。
 */
export default async function ReviewsAdminPage({ params, searchParams }: Props) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const isStore = sp.kind === 'store';
  const table = isStore ? 'tenant_reviews' : 'product_reviews';
  const showHidden = sp.show === 'hidden';
  let q = supabaseAdmin
    .from(table)
    .select(isStore
      ? 'id, rating, comment, display_name, status, created_at, orders(order_no)'
      : 'id, rating, comment, display_name, status, created_at, products(name, slug), orders(order_no)')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (showHidden) q = q.eq('status', 'hidden');
  else q = q.eq('status', 'visible');
  const { data } = await q;
  const rows = ((data as unknown) as Row[] | null) ?? [];

  const { count: hiddenCount } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('status', 'hidden');
  const { count: visibleCount } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('status', 'visible');
  const avg = rows.length && !showHidden ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : null;

  const saved = sp.saved === 'hidden' ? (isStore ? '已隱藏,商店頁首不再計入這則' : '已隱藏,商品頁不再顯示這則') : sp.saved === 'visible' ? '已恢復顯示' : null;
  const base = `/admin/${tenant.slug}/reviews`;
  const href = (kind: 'product' | 'store', show: 'visible' | 'hidden') => {
    const qs = new URLSearchParams();
    if (kind === 'store') qs.set('kind', 'store');
    if (show === 'hidden') qs.set('show', 'hidden');
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };
  const tab = (on: boolean): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: on ? 700 : 500, textDecoration: 'none',
    background: on ? '#fff' : 'transparent', color: on ? '#18181b' : '#52525b', boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
  });

  return (
    <main style={{ padding: '28px 32px 48px', color: '#18181b' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.rv-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.rv-table th{text-align:left;font-size:12px;color:#71717a;font-weight:500;padding:10px 14px;border-bottom:1px solid #e4e4e7;background:#fafafa}
.rv-table td{padding:12px 14px;border-bottom:1px solid #f4f4f5;vertical-align:top}
.rv-table tr:last-child td{border-bottom:0}
@media (max-width:768px){.rv-table thead{display:none}.rv-table,.rv-table tbody,.rv-table tr,.rv-table td{display:block;width:100%}.rv-table tr{border-bottom:8px solid transparent}.rv-table td{padding:6px 14px}.rv-table td[data-label]::before{content:attr(data-label);display:block;font-size:11px;color:#a1a1aa;margin-bottom:2px}}
          `,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>評價</h1>
          <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
            顯示中 {visibleCount ?? 0} 則 · 隱藏 {hiddenCount ?? 0} 則{avg !== null && <> · 平均 {avg.toFixed(1)} 星</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, padding: 3, background: '#f4f4f5', borderRadius: 9 }}>
            <a href={href('product', showHidden ? 'hidden' : 'visible')} style={tab(!isStore)}>商品</a>
            <a href={href('store', showHidden ? 'hidden' : 'visible')} style={tab(isStore)}>店家</a>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 3, background: '#f4f4f5', borderRadius: 9 }}>
            <a href={href(isStore ? 'store' : 'product', 'visible')} style={tab(!showHidden)}>顯示中</a>
            <a href={href(isStore ? 'store' : 'product', 'hidden')} style={tab(showHidden)}>已隱藏</a>
          </div>
        </div>
      </div>

      {saved && <FlashToast message={saved} />}

      {rows.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, color: '#71717a', fontSize: 14, lineHeight: 1.7 }}>
          {showHidden
            ? '沒有隱藏的評價。'
            : isStore
              ? '還沒有店家評價。客人在評價頁給商品評分時,可以順手給這家店打一個整體的分數。'
              : '還沒有評價。出貨或取貨 3 天後,系統會自動用 LINE 邀請客人評價。'}
        </div>
      ) : (
        <table className="rv-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>日期</th>
              {!isStore && <th style={{ width: 200 }}>商品</th>}
              <th style={{ width: 120 }}>星等</th>
              <th>留言</th>
              <th style={{ width: 110 }}>暱稱</th>
              <th style={{ width: 130 }}>訂單</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="日期" style={{ color: '#71717a', fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(r.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })}
                </td>
                {!isStore && (
                  <td data-label="商品">
                    {r.products?.slug ? (
                      <a href={`/${tenant.slug}/p/${r.products.slug}#reviews`} target="_blank" rel="noreferrer" style={{ color: '#18181b', fontWeight: 500 }}>{r.products.name}</a>
                    ) : (
                      r.products?.name ?? '(已刪除商品)'
                    )}
                  </td>
                )}
                <td data-label="星等"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Stars value={r.rating} size={13} /><span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.rating}</span></span></td>
                <td data-label="留言" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{r.comment ?? <span style={{ color: '#a1a1aa' }}>—</span>}</td>
                <td data-label="暱稱">{r.display_name ?? <span style={{ color: '#a1a1aa' }}>匿名</span>}</td>
                <td data-label="訂單" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.orders?.order_no ?? '—'}</td>
                <td>
                  <form action={setReviewStatus}>
                    <input type="hidden" name="tenant_slug" value={tenant.slug} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="kind" value={isStore ? 'store' : 'product'} />
                    <input type="hidden" name="status" value={r.status === 'visible' ? 'hidden' : 'visible'} />
                    <button type="submit" className="ui-btn ui-btn-outline ui-btn-xs" style={{ color: r.status === 'visible' ? '#b91c1c' : '#15803d' }}>
                      {r.status === 'visible' ? '隱藏' : '恢復顯示'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: '#71717a', lineHeight: 1.6 }}>
        評價的星數與留言是客人給的,後台只能隱藏不當內容,不能修改。隱藏後{isStore ? '商店頁首的星數' : '商品卡與商品頁'}都不會計入。
      </p>
    </main>
  );
}
