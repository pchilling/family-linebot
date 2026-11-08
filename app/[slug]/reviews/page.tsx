import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { ButtonLink, Stars } from '@/lib/ui';

/**
 * 店家評價公開頁(2026-11-08):/{slug}/reviews
 * 列出這家店所有顯示中的店家評價(Phase 30 的 tenant_reviews):平均星等、星等分布、每則的暱稱 / 星等 / 日期 / 留言。
 * 只有出貨後的訂單才評得了,所以每一則都是實際買過的客人;顯示名稱是客人自己選的暱稱,不給匿名(11/1 定案)。
 * 入口:商店頁首店名旁的星等、頁尾「顧客評價」。
 */

type Props = { params: Promise<{ slug: string }> };

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  created_at: string;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) return { title: '攤位不存在' };
  return { title: `顧客評價 - ${tenant.name}`, description: `${tenant.name} 的顧客評價` };
}

const CSS = `
.rv{max-width:720px;margin:0 auto}
.rv-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:4px 0 20px}
.rv-head h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.rv-head p{margin:4px 0 0;font-size:13px;color:var(--ui-muted)}
.rv-sum{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;padding:20px 22px;margin-bottom:20px}
.rv-avg{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:96px}
.rv-avg b{font-size:40px;font-weight:600;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.rv-avg small{font-size:12px;color:var(--ui-muted)}
.rv-dist{display:flex;flex-direction:column;gap:6px;min-width:0}
.rv-bar{display:grid;grid-template-columns:34px 1fr 32px;align-items:center;gap:10px;font-size:12.5px;color:var(--ui-muted);font-variant-numeric:tabular-nums}
.rv-bar i{display:block;height:8px;border-radius:999px;background:var(--ui-line-soft);overflow:hidden}
.rv-bar i span{display:block;height:100%;background:#f59e0b;border-radius:999px}
.rv-bar em{font-style:normal;text-align:right}
.rv-list{display:flex;flex-direction:column}
.rv-item{padding:16px 0;border-top:1px solid var(--ui-line)}
.rv-item:first-child{border-top:0;padding-top:4px}
.rv-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rv-top b{font-size:14px;font-weight:600}
.rv-top time{font-size:12px;color:var(--ui-muted);margin-left:auto;font-variant-numeric:tabular-nums}
.rv-item p{margin:8px 0 0;font-size:14.5px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
.rv-empty{padding:40px 24px;text-align:center;color:var(--ui-muted);font-size:14px;line-height:1.7}
.rv-note{margin:20px 0 0;font-size:12px;color:var(--ui-faint);line-height:1.6}
@media (max-width:560px){.rv-sum{grid-template-columns:1fr;gap:16px}.rv-avg{flex-direction:row;justify-content:center;gap:12px}.rv-avg b{font-size:32px}}
`;

export default async function StoreReviewsPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const { data, error } = await supabaseAdmin
    .from('tenant_reviews')
    .select('id, rating, comment, display_name, created_at')
    .eq('tenant_id', tenant.id)
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) console.error('[reviews page]', error);
  const rows = ((data ?? []) as ReviewRow[]);
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: rows.filter((r) => r.rating === n).length }));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <div className="rv ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rv-head">
        <div>
          <h1>顧客評價</h1>
          <p>{tenant.name} · 出貨後由實際購買的顧客留下</p>
        </div>
        <ButtonLink href={`/${slug}`} variant="outline" size="sm">回到商店</ButtonLink>
      </div>

      {count === 0 ? (
        <div className="ui-card rv-empty">
          還沒有顧客評價這家店。
          <br />
          訂單出貨後,系統會邀請顧客留下評價,第一則出現後就會顯示在這裡。
        </div>
      ) : (
        <>
          <div className="ui-card rv-sum">
            <div className="rv-avg">
              <b>{avg.toFixed(1)}</b>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <Stars value={avg} size={15} />
                <small>{count} 則評價</small>
              </div>
            </div>
            <div className="rv-dist" aria-label="星等分布">
              {dist.map((d) => (
                <div key={d.n} className="rv-bar">
                  <span>{d.n} 星</span>
                  <i><span style={{ width: `${count ? (d.c / count) * 100 : 0}%` }} /></i>
                  <em>{d.c}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="ui-card" style={{ padding: '12px 22px 6px' }}>
            <div className="rv-list">
              {rows.map((r) => (
                <article key={r.id} className="rv-item">
                  <div className="rv-top">
                    <b>{r.display_name?.trim() || '顧客'}</b>
                    <Stars value={r.rating} size={13} />
                    <time dateTime={r.created_at}>{fmt(r.created_at)}</time>
                  </div>
                  {r.comment?.trim() && <p>{r.comment.trim()}</p>}
                </article>
              ))}
            </div>
          </div>
          <p className="rv-note">評價只開放給已出貨的訂單,每筆訂單一則;顯示名稱是顧客自己設定的暱稱。</p>
        </>
      )}
    </div>
  );
}
