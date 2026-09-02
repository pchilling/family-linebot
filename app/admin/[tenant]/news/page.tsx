import { notFound, redirect } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import { createNews, deleteNews, pushNews, updateNews } from './actions';
import { NewsImageField } from './image-field';
import { SubmitButton } from '../../_components/submit-button';

type NewsRow = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  image_url: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

async function getAllNews(tenantId: string): Promise<NewsRow[]> {
  const { data } = await supabaseAdmin
    .from('news')
    .select('id, title, body, link_url, image_url, status, published_at, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as NewsRow[];
}

function statusLabel(s: string): string {
  return ({ draft: '草稿', published: '已發佈', archived: '已下架' }[s]) ?? s;
}
function statusColor(s: string): string {
  return ({ draft: '#9ca3af', published: '#16a34a', archived: '#71717a' }[s]) ?? '#71717a';
}
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

const section: React.CSSProperties = { marginBottom: 24, padding: 16, border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff' };
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12, color: '#18181b' };
const formGrid: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const label: React.CSSProperties = { fontSize: 12, color: '#52525b' };
const input: React.CSSProperties = { width: '100%', padding: 8, fontSize: 14, border: '1px solid #d4d4d8', borderRadius: 4, boxSizing: 'border-box', fontFamily: 'inherit' };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', background: '#18181b', color: '#fff', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const btnGhost: React.CSSProperties = { padding: '6px 12px', background: '#fff', color: '#52525b', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
const btnDanger: React.CSSProperties = { padding: '6px 12px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };

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

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>{tenant.name} · 最新消息</h1>
      {savedId && (
        <div
          style={{
            padding: '10px 14px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#16a34a',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          ✓ 已儲存
        </div>
      )}
      <div
        style={{
          padding: '10px 14px',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 6,
          fontSize: 13,
          color: '#78350f',
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        <strong>運作方式:公告板 + 可選推播。</strong>
        <br />
        已發佈的消息會在用戶點選單「📰 最新消息」時顯示(最近 5 則)。
        勾「同步推播」或按消息上的「📣 推播」才會主動發給所有好友——
        <strong>每次推播吃 LINE 免費額度(好友數 × 1 則,每月 500 則)</strong>,請斟酌使用。
        <br />
        有上傳圖片的消息會以<strong>整張圖卡</strong>顯示(點圖開連結),沒圖則是文字卡。
      </div>

      {/* 新增 form */}
      <section style={section}>
        <h2 style={h2}>新增消息</h2>
        <form action={createNews} style={formGrid}>
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <label style={label}>
            標題 *
            <input name="title" required style={input} placeholder="例:6 月開課訊息" />
          </label>
          <label style={label}>
            內容
            <textarea
              name="body"
              rows={4}
              style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
              placeholder="可多行。回覆時會原樣顯示在 LINE 對話框。"
            />
          </label>
          <label style={label}>
            🔗 連結 URL(選填;有圖時點圖開此連結,沒圖時 Flex 多一顆「開啟連結」button)
            <input
              name="link_url"
              type="url"
              style={input}
              placeholder="https://youtu.be/... 或 https://shop.com/..."
            />
          </label>
          <div style={label}>
            🖼 圖片(選填;有圖 → 整張圖卡,像海報)
            <NewsImageField tenantSlug={tenant.slug} />
          </div>
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, color: '#18181b', fontSize: 13 }}>
            <input name="publish" type="checkbox" />
            建立後上線公開(可在 Rich Menu「最新消息」被讀到)
          </label>
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontSize: 13 }}>
            <input name="push" type="checkbox" />
            📣 發布後同步推播給所有好友(吃 LINE 免費額度,需同時勾上面的公開)
          </label>
          <div>
            <SubmitButton size="sm" pendingText="新增中…">新增</SubmitButton>
          </div>
        </form>
      </section>

      {(() => {
        const published = news.filter((n) => n.status === 'published');
        const draft = news.filter((n) => n.status === 'draft');
        const archived = news.filter((n) => n.status === 'archived');

        return (
          <>
            {/* 已發佈 — 全展開 */}
            <h2 style={{ fontSize: 16, marginBottom: 12, marginTop: 32, color: '#16a34a' }}>
              ✓ 已發佈 ({published.length})
            </h2>
            {published.length === 0 && (
              <p style={{ color: '#71717a', fontSize: 13, marginBottom: 16 }}>(尚無已發佈消息)</p>
            )}
            {published.map((n) => renderNewsCard(n, tenant.slug, savedId))}

            {/* 草稿 — 折疊 */}
            {draft.length > 0 && (
              <details style={{ marginTop: 24, marginBottom: 8 }}>
                <summary style={{ fontSize: 14, color: '#52525b', cursor: 'pointer', padding: '8px 0', fontWeight: 500 }}>
                  📝 草稿 ({draft.length}) — 點開展開
                </summary>
                <div style={{ marginTop: 12 }}>
                  {draft.map((n) => renderNewsCard(n, tenant.slug, savedId))}
                </div>
              </details>
            )}

            {/* 已下架 — 折疊 */}
            {archived.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 14, color: '#71717a', cursor: 'pointer', padding: '8px 0', fontWeight: 500 }}>
                  🗄 已下架 ({archived.length}) — 點開展開
                </summary>
                <div style={{ marginTop: 12 }}>
                  {archived.map((n) => renderNewsCard(n, tenant.slug, savedId))}
                </div>
              </details>
            )}

            {news.length === 0 && (
              <p style={{ color: '#71717a', fontSize: 13, marginTop: 24 }}>(尚無消息)</p>
            )}
          </>
        );
      })()}
    </main>
  );
}

function renderNewsCard(n: NewsRow, slug: string, savedId: string | undefined) {
  return (
    <article key={n.id} style={{ ...section, ...(savedId === n.id ? { borderColor: '#16a34a', boxShadow: '0 0 0 2px #bbf7d0' } : {}) }}>
          <form action={updateNews} style={formGrid}>
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="tenant_slug" value={slug} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  background: statusColor(n.status) + '22',
                  color: statusColor(n.status),
                  borderRadius: 3,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {statusLabel(n.status)}
              </span>
              <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'var(--font-geist-mono), monospace' }}>
                {n.status === 'published' && n.published_at
                  ? `發佈 ${formatTw(n.published_at)}`
                  : `草稿 ${formatTw(n.created_at)}`}
              </span>
            </div>

            <label style={label}>
              標題
              <input name="title" defaultValue={n.title} required style={input} />
            </label>
            <label style={label}>
              內容
              <textarea
                name="body"
                defaultValue={n.body ?? ''}
                rows={4}
                style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </label>
            <label style={label}>
              🔗 連結 URL(選填)
              <input
                name="link_url"
                type="url"
                defaultValue={n.link_url ?? ''}
                style={input}
                placeholder="https://..."
              />
            </label>
            <div style={label}>
              🖼 圖片(選填;有圖 → 整張圖卡)
              <NewsImageField tenantSlug={slug} defaultUrl={n.image_url} />
            </div>
            <label style={label}>
              狀態
              <select name="status" defaultValue={n.status} style={input}>
                <option value="draft">草稿(不公開)</option>
                <option value="published">已發佈</option>
                <option value="archived">下架(已發佈但不再顯示)</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
            </div>
          </form>

          {/* D#3:單則推播(只有已發佈能推) */}
          {n.status === 'published' && (
            <form action={pushNews} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="tenant_slug" value={slug} />
              <SubmitButton
                size="sm"
                variant="secondary"
                pendingText="推播中…"
                confirmText="確定把這則消息推播給「所有」LINE 好友?會吃免費額度(好友數 × 1 則)。"
              >
                📣 推播這則給所有好友
              </SubmitButton>
            </form>
          )}

          <form action={deleteNews} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="tenant_slug" value={slug} />
            <SubmitButton variant="danger" size="sm" pendingText="刪除中…">刪除這則消息</SubmitButton>
          </form>
    </article>
  );
}
