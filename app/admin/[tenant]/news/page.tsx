import { notFound, redirect } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import { createNews, deleteNews, pushNews, updateNews } from './actions';
import { NewsImageField } from './image-field';
import { ZoneFields } from './zone-fields';
import { SubmitButton } from '../../_components/submit-button';
import { FlashToast } from '../../../_components/toast';
import { IconChevronDown } from '@/lib/icons';

/**
 * 最新消息(2026-11-01 換成後台新設計系統:新增表單與每則消息改卡片,欄位用 ui-input)。
 * 查詢、建立、更新、推播、刪除的 action 不變。
 */

type NewsRow = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  image_url: string | null;
  image_ratio: string | null;
  // Phase 16(#11):按鈕陣列 或 海報熱區 { mode:'zones', urls }
  links: { label: string; url: string }[] | { mode: 'zones'; urls: string[] } | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

async function getAllNews(tenantId: string): Promise<NewsRow[]> {
  const { data } = await supabaseAdmin
    .from('news')
    .select('id, title, body, link_url, image_url, image_ratio, links, status, published_at, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as NewsRow[];
}

const STATUS_LABEL: Record<string, string> = { draft: '草稿', published: '已發佈', archived: '已下架' };

function formatTw(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const CSS = `
.nw-head{margin-bottom:16px}
.nw-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.nw-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.nw-info{padding:12px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;font-size:13px;color:#78350f;line-height:1.65;margin-bottom:16px}
.nw-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:18px;margin-bottom:12px}
.nw-card[data-saved="true"]{border-color:#16a34a;box-shadow:0 0 0 2px #bbf7d0}
.nw-card h2{margin:0 0 14px;font-size:14px;font-weight:600}
.nw-form{display:flex;flex-direction:column;gap:12px}
.nw-f .ui-label{margin-bottom:4px}
.nw-f .h{font-size:11.5px;color:#71717a;margin-top:4px;line-height:1.5}
.nw-check{display:flex;align-items:center;gap:8px;font-size:13px}
.nw-top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.nw-top .t{font-size:11.5px;color:#a1a1aa;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.nw-sec{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;margin:28px 0 12px}
.nw-sec .n{font-weight:400;color:#71717a;font-size:13px}
.nw-fold{margin-top:8px}
.nw-fold > summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;padding:8px 0;color:#52525b}
.nw-fold > summary::-webkit-details-marker{display:none}
.nw-fold > summary .chev{color:#a1a1aa;transition:transform .15s}
.nw-fold[open] > summary .chev{transform:rotate(180deg)}
.nw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #f4f4f5}
.nw-actions form{margin:0}
.nw-status-draft{background:#f4f4f5;color:#52525b;border-color:transparent}
.nw-status-published{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.nw-status-archived{background:#f4f4f5;color:#a1a1aa;border-color:transparent}
.nw-empty{font-size:13px;color:#71717a;margin:0 0 16px}
@media (max-width:767px){.nw-card{padding:14px;border-radius:10px}}
`;

export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // 最新消息 enterprise gate(2026-06-02):
  // - enterprise 自動有
  // - 其他 plan 需 features.news 白名單
  const hasNews = tenant.plan === 'enterprise' || hasFeature(tenant, 'news');
  if (!hasNews) {
    redirect(`/admin/${slug}`);
  }

  const news = await getAllNews(tenant.id);
  const savedId = sp.saved;
  const published = news.filter((n) => n.status === 'published');
  const draft = news.filter((n) => n.status === 'draft');
  const archived = news.filter((n) => n.status === 'archived');

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 860 }}>
        {savedId && <FlashToast key={savedId} message="已儲存" />}

        <header className="nw-head">
          <h1>最新消息</h1>
          <p>公告板,可選擇同步推播。已發佈 {published.length} 則 · 草稿 {draft.length} · 已下架 {archived.length}</p>
        </header>

        <div className="nw-info">
          <strong>運作方式:公告板 + 可選推播。</strong>
          <br />
          已發佈的消息會在客人點選單「最新消息」時顯示(最近 5 則)。
          勾「同步推播」或按消息上的「推播」才會主動發給所有好友——
          <strong>每次推播吃 LINE 免費額度(好友數 × 1 則,每月 500 則)</strong>,請斟酌使用。
          <br />
          <strong>公告一律建議做成圖卡:直式 3:4(如 1080×1440),詳細內容放連結。</strong>
          輪播卡片強制等高,比例統一才不會有卡片下方補白;沒圖的會退回文字卡。
        </div>

        {/* 新增 form */}
        <div className="nw-card">
          <h2>新增消息</h2>
          <form action={createNews} className="nw-form">
            <input type="hidden" name="tenant_slug" value={tenant.slug} />
            <div className="nw-f">
              <label className="ui-label" htmlFor="new-title">標題<i>*</i></label>
              <input id="new-title" name="title" required className="ui-input" placeholder="例:6 月開課訊息" />
            </div>
            <div className="nw-f">
              <label className="ui-label" htmlFor="new-body">內容</label>
              <textarea id="new-body" name="body" rows={4} className="ui-input" placeholder="可多行。回覆時會原樣顯示在 LINE 對話框。" />
            </div>
            <div className="nw-f">
              <label className="ui-label" htmlFor="new-link">連結<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></label>
              <input id="new-link" name="link_url" type="url" className="ui-input" placeholder="https://youtu.be/... 或 https://shop.com/..." />
              <div className="h">有圖時點圖開這個連結;沒圖時卡片會多一顆「開啟連結」按鈕。</div>
            </div>
            {/* Phase 16 v3(2026-09-12):按鈕功能收掉,只留海報熱區(即時分區示意圖) */}
            <div className="nw-f">
              <div className="ui-label">海報熱區<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></div>
              <div className="h" style={{ marginTop: 0, marginBottom: 6 }}>海報上不同商品各給一條連結,客人點圖上那一區就直接開那條連結,卡片是乾淨海報。</div>
              <ZoneFields />
            </div>
            <div className="nw-f">
              <div className="ui-label">圖片<span style={{ color: '#71717a', fontWeight: 400 }}>(選填,有圖就是整張圖卡,像海報)</span></div>
              <NewsImageField tenantSlug={tenant.slug} />
            </div>
            <label className="nw-check">
              <input name="publish" type="checkbox" className="ui-cb" />
              建立後上線公開(客人在 LINE 選單「最新消息」看得到)
            </label>
            <label className="nw-check" style={{ color: '#b45309' }}>
              <input name="push" type="checkbox" className="ui-cb" />
              發布後同步推播給所有好友(吃 LINE 免費額度,要同時勾上面的公開)
            </label>
            <div>
              <SubmitButton pendingText="新增中…">新增</SubmitButton>
            </div>
          </form>
        </div>

        {/* 已發佈 — 全展開 */}
        <div className="nw-sec">
          已發佈
          <span className="n">{published.length} 則</span>
        </div>
        {published.length === 0 && <p className="nw-empty">還沒有已發佈的消息。</p>}
        {published.map((n) => renderNewsCard(n, tenant.slug, savedId))}

        {/* 草稿 — 折疊 */}
        {draft.length > 0 && (
          <details className="nw-fold">
            <summary>
              <span className="chev" style={{ display: 'inline-flex' }}><IconChevronDown size={14} /></span>
              草稿({draft.length})
            </summary>
            <div style={{ marginTop: 8 }}>
              {draft.map((n) => renderNewsCard(n, tenant.slug, savedId))}
            </div>
          </details>
        )}

        {/* 已下架 — 折疊 */}
        {archived.length > 0 && (
          <details className="nw-fold">
            <summary>
              <span className="chev" style={{ display: 'inline-flex' }}><IconChevronDown size={14} /></span>
              已下架({archived.length})
            </summary>
            <div style={{ marginTop: 8 }}>
              {archived.map((n) => renderNewsCard(n, tenant.slug, savedId))}
            </div>
          </details>
        )}

        {news.length === 0 && <p className="nw-empty">還沒有消息。</p>}
      </div>
    </main>
  );
}

function renderNewsCard(n: NewsRow, slug: string, savedId: string | undefined) {
  // Phase 16 v3:links 只剩熱區物件(舊資料的按鈕陣列仍會在 LINE 端正常顯示,但後台不再編輯)
  const zoneUrls = !Array.isArray(n.links) && n.links?.mode === 'zones' ? n.links.urls : [];
  const id = n.id.slice(0, 8);
  return (
    <article key={n.id} className="nw-card" data-saved={savedId === n.id ? 'true' : 'false'}>
      <form action={updateNews} className="nw-form">
        <input type="hidden" name="id" value={n.id} />
        <input type="hidden" name="tenant_slug" value={slug} />

        <div className="nw-top">
          <span className={`ui-badge nw-status-${n.status}`}>{STATUS_LABEL[n.status] ?? n.status}</span>
          <span className="t">
            {n.status === 'published' && n.published_at ? `發佈 ${formatTw(n.published_at)}` : `建立 ${formatTw(n.created_at)}`}
          </span>
        </div>

        <div className="nw-f">
          <label className="ui-label" htmlFor={`t-${id}`}>標題</label>
          <input id={`t-${id}`} name="title" defaultValue={n.title} required className="ui-input" />
        </div>
        <div className="nw-f">
          <label className="ui-label" htmlFor={`b-${id}`}>內容</label>
          <textarea id={`b-${id}`} name="body" defaultValue={n.body ?? ''} rows={4} className="ui-input" />
        </div>
        <div className="nw-f">
          <label className="ui-label" htmlFor={`l-${id}`}>連結<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></label>
          <input id={`l-${id}`} name="link_url" type="url" defaultValue={n.link_url ?? ''} className="ui-input" placeholder="https://..." />
        </div>
        {/* Phase 16 v3(2026-09-12):按鈕功能收掉,只留海報熱區 */}
        <div className="nw-f">
          <div className="ui-label">海報熱區<span style={{ color: '#71717a', fontWeight: 400 }}>(選填,點圖上那一區直接開那條連結)</span></div>
          <ZoneFields defaults={zoneUrls} />
        </div>
        <div className="nw-f">
          <div className="ui-label">圖片<span style={{ color: '#71717a', fontWeight: 400 }}>(選填,有圖就是整張圖卡,照原始比例顯示)</span></div>
          <NewsImageField tenantSlug={slug} defaultUrl={n.image_url} defaultRatio={n.image_ratio} />
        </div>
        <div className="nw-f">
          <label className="ui-label" htmlFor={`s-${id}`}>狀態</label>
          <select id={`s-${id}`} name="status" defaultValue={n.status} className="ui-input">
            <option value="draft">草稿(不公開)</option>
            <option value="published">已發佈</option>
            <option value="archived">下架(已發佈但不再顯示)</option>
          </select>
        </div>
        <div>
          <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
        </div>
      </form>

      <div className="nw-actions">
        {/* D#3:單則推播(只有已發佈能推) */}
        {n.status === 'published' && (
          <form action={pushNews}>
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="tenant_slug" value={slug} />
            <SubmitButton
              size="sm"
              variant="secondary"
              pendingText="推播中…"
              confirmText="確定把這則消息推播給「所有」LINE 好友?會吃免費額度(好友數 × 1 則)。"
            >
              推播這則給所有好友
            </SubmitButton>
          </form>
        )}
        <form action={deleteNews}>
          <input type="hidden" name="id" value={n.id} />
          <input type="hidden" name="tenant_slug" value={slug} />
          <SubmitButton variant="danger" size="sm" pendingText="刪除中…" confirmText={`確定刪除「${n.title}」?無法復原。`}>刪除這則消息</SubmitButton>
        </form>
      </div>
    </article>
  );
}
