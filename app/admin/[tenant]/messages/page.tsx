import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { MarkReadOnMount } from './mark-read-client';
import { IconChevronDown, IconSearch } from '@/lib/icons';

/**
 * 訊息(2026-11-01 換成後台新設計系統:範圍切換改分段按鈕、篩選列常駐、對話改卡片)。
 * 查詢、分組、自動已讀的邏輯不變。
 */

type MessageRow = {
  id: string;
  user_id: string | null;
  message_type: string | null;
  content: { text?: string; type?: string } | null;
  is_support: boolean;
  read_at: string | null;
  created_at: string;
  users: { id: string; display_name: string | null; full_name: string | null } | null;
};

type Filters = {
  q?: string;
  user?: string;
  scope?: string; // 'support' (default) | 'all'
};

async function getMessages(tenantId: string, f: Filters): Promise<MessageRow[]> {
  try {
    let query = supabaseAdmin
      .from('messages')
      .select(
        'id, user_id, message_type, content, is_support, read_at, created_at, users(id, display_name, full_name)',
      )
      .eq('tenant_id', tenantId)
      .eq('direction', 'inbound')
      .eq('event_type', 'message');

    if (f.scope !== 'all') {
      query = query.eq('is_support', true);
    }

    if (f.user) query = query.eq('user_id', f.user);

    query = query.order('created_at', { ascending: false }).limit(200);

    const { data, error } = await query;
    if (error) {
      console.error('[messages getMessages]', error);
      return [];
    }
    let rows = ((data as unknown) as MessageRow[] | null) ?? [];

    if (f.q) {
      const needle = f.q.toLowerCase();
      rows = rows.filter((m) => {
        const text = m.content?.text ?? '';
        const name = m.users?.full_name ?? m.users?.display_name ?? '';
        return text.toLowerCase().includes(needle) || name.toLowerCase().includes(needle);
      });
    }

    return rows;
  } catch (e) {
    console.error('[messages getMessages exception]', e);
    return [];
  }
}

type UserGroup = {
  userId: string | null;
  userName: string;
  messages: MessageRow[]; // desc by created_at
  latest: MessageRow;
  unreadCount: number;
};

function groupByUser(rows: MessageRow[]): UserGroup[] {
  const map = new Map<string, UserGroup>();
  for (const m of rows) {
    const key = m.user_id ?? '__noUser__';
    const userName = m.users?.full_name ?? m.users?.display_name ?? '(沒有對應的客戶)';
    if (!map.has(key)) {
      map.set(key, {
        userId: m.user_id,
        userName,
        messages: [],
        latest: m,
        unreadCount: 0,
      });
    }
    const g = map.get(key)!;
    g.messages.push(m);
    if (!m.read_at) g.unreadCount += 1;
    // rows already desc by created_at, first per user is latest
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
  );
}

function formatTw(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function typeLabel(t: string | null): string {
  return (
    {
      text: '文字',
      image: '圖片',
      sticker: '貼圖',
      video: '影片',
      audio: '錄音',
      location: '位置',
      file: '檔案',
    } as Record<string, string>
  )[t ?? ''] ?? t ?? '?';
}

function previewText(m: MessageRow): string {
  if (m.content?.text) {
    const text = m.content.text.replace(/\n/g, ' ');
    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  }
  return `[${typeLabel(m.message_type)}]`;
}

const CSS = `
.ms-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.ms-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.ms-head p{margin:4px 0 0;font-size:13px;color:#71717a;line-height:1.5}
.ms-seg{display:inline-flex;padding:3px;border-radius:8px;background:#f4f4f5;gap:2px}
.ms-seg a{height:30px;padding:0 14px;border-radius:6px;font-size:13px;color:#52525b;display:inline-flex;align-items:center;text-decoration:none}
.ms-seg a[aria-current="page"]{background:#fff;color:#18181b;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ms-filter{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:14px}
.ms-filter .q{flex:1 1 220px;min-width:160px;position:relative}
.ms-filter .q svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#a1a1aa;pointer-events:none}
.ms-filter .q input{padding-left:32px}
.ms-list{display:flex;flex-direction:column;gap:10px}
.ms-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.ms-card[data-unread="true"]{border-color:#fcd34d;box-shadow:0 0 0 1px #fde68a}
.ms-card summary{list-style:none;cursor:pointer;padding:12px 16px;display:flex;align-items:center;gap:12px}
.ms-card summary::-webkit-details-marker{display:none}
.ms-card .chev{color:#a1a1aa;transition:transform .15s;flex:none}
.ms-card[open] .chev{transform:rotate(180deg)}
.ms-card .who{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.ms-card .who a{color:#18181b;text-decoration:none;font-weight:600;font-size:14px}
.ms-card .who a:hover{text-decoration:underline}
.ms-card .who .n{font-size:12px;color:#71717a}
.ms-card .who .t{font-size:11.5px;color:#a1a1aa;margin-left:auto}
.ms-unread{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:700}
.ms-card .preview{font-size:13px;color:#71717a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-card[data-unread="true"] .preview{color:#18181b;font-weight:500}
.ms-thread{border-top:1px solid #f4f4f5;background:#fafafa;padding:10px 16px 12px;display:flex;flex-direction:column;gap:8px;margin:0;list-style:none}
.ms-msg{padding:8px 12px;border-radius:8px;border:1px solid transparent}
.ms-msg[data-unread="true"]{background:#fff;border-color:#fde68a}
.ms-msg .meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;font-size:11.5px;color:#a1a1aa}
.ms-msg[data-unread="true"] .meta{color:#18181b;font-weight:600}
.ms-msg .meta b{color:#dc2626;font-size:10.5px;letter-spacing:.05em}
.ms-msg .body{font-size:14px;color:#374151;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.ms-msg .other{font-size:13px;color:#a1a1aa}
.ms-empty{padding:48px 16px;text-align:center;color:#71717a;font-size:14px;background:#fff;border:1px solid #e4e4e7;border-radius:12px}
@media (max-width:767px){
  .ms-head{align-items:flex-start;flex-direction:column}
  .ms-card{border-radius:10px}
  .ms-card summary{padding:12px 14px}
}
`;

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Filters>;
}) {
  const { tenant: slug } = await params;
  const filters = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const messages = await getMessages(tenant.id, filters);
  const scope = filters.scope ?? 'support';
  const hasAnyFilter = !!(filters.q || filters.user);
  const groups = groupByUser(messages);

  const totalUnread = groups.reduce((sum, g) => sum + g.unreadCount, 0);

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <MarkReadOnMount tenantSlug={slug} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ maxWidth: 920 }}>
        <header className="ms-head">
          <div>
            <h1>訊息</h1>
            <p>
              {totalUnread > 0 && <strong style={{ color: '#dc2626' }}>{totalUnread} 則未讀 · </strong>}
              {groups.length} 位客人、{messages.length} 則
              {messages.length >= 200 ? '+,只顯示最近 200 則' : ''}
              {' · '}
              {scope === 'support'
                ? '只列客人按「客服」或「我要詢問」後 30 分鐘內傳的訊息'
                : '所有客人傳進來的訊息'}
            </p>
          </div>
          <nav className="ms-seg" aria-label="訊息範圍">
            <Link href={`/admin/${tenant.slug}/messages`} aria-current={scope === 'support' ? 'page' : undefined}>
              客服問題
            </Link>
            <Link href={`/admin/${tenant.slug}/messages?scope=all`} aria-current={scope === 'all' ? 'page' : undefined}>
              所有訊息
            </Link>
          </nav>
        </header>

        <form method="GET" action={`/admin/${tenant.slug}/messages`} className="ms-filter">
          {scope === 'all' && <input type="hidden" name="scope" value="all" />}
          <label className="q">
            <IconSearch size={15} />
            <input
              name="q"
              className="ui-input ui-input-sm"
              defaultValue={filters.q ?? ''}
              placeholder="搜尋訊息內容、客人名稱"
              aria-label="搜尋"
            />
          </label>
          <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">查詢</button>
          {hasAnyFilter && (
            <Link href={`/admin/${tenant.slug}/messages${scope === 'all' ? '?scope=all' : ''}`} className="ui-btn ui-btn-ghost ui-btn-sm">
              清除
            </Link>
          )}
        </form>

        {groups.length === 0 ? (
          <div className="ms-empty">{hasAnyFilter ? '沒有符合條件的訊息。' : '還沒有訊息。'}</div>
        ) : (
          <div className="ms-list">
            {groups.map((g) => {
              const hasUnread = g.unreadCount > 0;
              return (
                <details key={g.userId ?? '__noUser__'} open={hasUnread} className="ms-card" data-unread={hasUnread ? 'true' : 'false'}>
                  <summary>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="who">
                        {g.userId ? (
                          <Link href={`/admin/${tenant.slug}/customers/${g.userId}`}>{g.userName}</Link>
                        ) : (
                          <span style={{ color: '#a1a1aa', fontSize: 14 }}>{g.userName}</span>
                        )}
                        <span className="n">{g.messages.length} 則</span>
                        {hasUnread && <span className="ms-unread">{g.unreadCount} 未讀</span>}
                        <span className="t">{formatTw(g.latest.created_at)}</span>
                      </div>
                      <div className="preview">{previewText(g.latest)}</div>
                    </div>
                    <IconChevronDown size={16} style={{ color: '#a1a1aa' }} />
                  </summary>

                  <ul className="ms-thread">
                    {g.messages.map((m) => {
                      const text = m.content?.text;
                      const unread = !m.read_at;
                      return (
                        <li key={m.id} className="ms-msg" data-unread={unread ? 'true' : 'false'}>
                          <div className="meta">
                            <span>{formatTw(m.created_at)}</span>
                            {unread && <b>未讀</b>}
                          </div>
                          {text ? (
                            <div className="body">{text}</div>
                          ) : (
                            <div className="other">{typeLabel(m.message_type)},不是文字,請到 LINE 官方帳號看。</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </div>
        )}

        <p style={{ marginTop: 24, fontSize: 12, color: '#a1a1aa', textAlign: 'center', lineHeight: 1.6 }}>
          進這頁 2 秒後會自動把未讀標成已讀。要回覆客人請直接到 LINE 官方帳號管理後台對話。
        </p>
      </div>
    </main>
  );
}
