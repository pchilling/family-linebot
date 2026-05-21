import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { MarkReadOnMount } from './mark-read-client';

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
    const userName = m.users?.full_name ?? m.users?.display_name ?? '(未綁定 user)';
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

const filterInput: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  background: '#fff',
  color: '#18181b',
  fontFamily: 'inherit',
  outline: 'none',
};

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
    <main style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <MarkReadOnMount tenantSlug={slug} />

      <style
        dangerouslySetInnerHTML={{
          __html: `
details summary { cursor: pointer; list-style: none; }
details summary::-webkit-details-marker { display: none; }
details summary::marker { content: ''; }
details[open] .chevron { transform: rotate(90deg); }
.chevron { display: inline-block; transition: transform 150ms ease; }
          `,
        }}
      />

      <h1 style={{ fontSize: 22, marginBottom: 6 }}>
        {tenant.name} · 客戶訊息{' '}
        <span style={{ color: '#71717a', fontSize: 14, fontWeight: 400 }}>
          ({groups.length} 位用戶, {messages.length} 則
          {messages.length >= 200 ? '+,只顯示最近 200' : ''})
        </span>
      </h1>
      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 12 }}>
        {totalUnread > 0 && (
          <strong style={{ color: '#dc2626' }}>
            {totalUnread} 則未讀 ·{' '}
          </strong>
        )}
        {scope === 'support'
          ? '只顯示按「客服」/「我要詢問」後 30 分鐘內的訊息(看到就上 LINE@ Manager 回覆)'
          : '顯示所有 inbound 訊息'}
      </p>

      {/* Scope toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Link
          href={`/admin/${tenant.slug}/messages`}
          style={{
            padding: '6px 12px',
            background: scope === 'support' ? '#18181b' : '#fff',
            color: scope === 'support' ? '#fff' : '#52525b',
            border: `1px solid ${scope === 'support' ? '#18181b' : '#e4e4e7'}`,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          客服問題
        </Link>
        <Link
          href={`/admin/${tenant.slug}/messages?scope=all`}
          style={{
            padding: '6px 12px',
            background: scope === 'all' ? '#18181b' : '#fff',
            color: scope === 'all' ? '#fff' : '#52525b',
            border: `1px solid ${scope === 'all' ? '#18181b' : '#e4e4e7'}`,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          所有訊息
        </Link>
      </div>

      {/* Filter bar */}
      <form
        method="GET"
        action={`/admin/${tenant.slug}/messages`}
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: 12,
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <input
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="搜尋訊息內容 / 姓名"
          style={{ ...filterInput, flex: '1 1 200px', minWidth: 200 }}
        />
        <button
          type="submit"
          style={{
            padding: '6px 14px',
            background: '#18181b',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          查詢
        </button>
        {hasAnyFilter && (
          <Link
            href={`/admin/${tenant.slug}/messages`}
            style={{
              padding: '6px 12px',
              color: '#52525b',
              textDecoration: 'none',
              fontSize: 13,
              border: '1px solid #e4e4e7',
              borderRadius: 6,
              background: '#fff',
            }}
          >
            清除
          </Link>
        )}
      </form>

      {groups.length === 0 && (
        <p style={{ color: '#71717a', padding: 32, textAlign: 'center', fontSize: 14 }}>
          {hasAnyFilter ? '(條件下無訊息)' : '(尚無客戶訊息)'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g) => {
          const hasUnread = g.unreadCount > 0;
          return (
            <details
              key={g.userId ?? '__noUser__'}
              open={hasUnread}
              style={{
                background: hasUnread ? '#fefce8' : '#fff',
                border: `1px solid ${hasUnread ? '#fde047' : '#e4e4e7'}`,
                borderLeft: hasUnread ? '3px solid #dc2626' : '1px solid #e4e4e7',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  className="chevron"
                  aria-hidden
                  style={{
                    color: '#71717a',
                    fontSize: 11,
                    width: 12,
                    flexShrink: 0,
                  }}
                >
                  ▶
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 2,
                    }}
                  >
                    {g.userId ? (
                      <Link
                        href={`/admin/${tenant.slug}/customers/${g.userId}`}
                        style={{
                          color: '#0070f3',
                          textDecoration: 'none',
                          fontWeight: hasUnread ? 700 : 500,
                          fontSize: 14,
                        }}
                      >
                        {g.userName}
                      </Link>
                    ) : (
                      <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>
                        {g.userName}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#71717a' }}>
                      ({g.messages.length} 則)
                    </span>
                    {hasUnread && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '1px 7px',
                          background: '#dc2626',
                          color: '#fff',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {g.unreadCount} 未讀
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto' }}>
                      {formatTw(g.latest.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: hasUnread ? '#18181b' : '#71717a',
                      fontWeight: hasUnread ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {previewText(g.latest)}
                  </div>
                </div>
              </summary>

              {/* Expanded thread */}
              <div
                style={{
                  borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                  background: '#fafafa',
                  padding: '8px 16px 12px',
                }}
              >
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.messages.map((m) => {
                    const text = m.content?.text;
                    const unread = !m.read_at;
                    return (
                      <li
                        key={m.id}
                        style={{
                          padding: '8px 12px',
                          background: unread ? '#fff' : 'transparent',
                          border: unread ? '1px solid #fde047' : '1px solid transparent',
                          borderRadius: 6,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            marginBottom: 4,
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: unread ? '#18181b' : '#a1a1aa',
                              fontWeight: unread ? 600 : 400,
                            }}
                          >
                            {formatTw(m.created_at)}
                          </span>
                          {unread && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#dc2626',
                                letterSpacing: '0.05em',
                              }}
                            >
                              未讀
                            </span>
                          )}
                        </div>
                        {text ? (
                          <div
                            style={{
                              fontSize: 14,
                              color: '#374151',
                              lineHeight: 1.55,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {text}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                            {typeLabel(m.message_type)}(非文字,LINE@ Manager 直接看)
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#a1a1aa', textAlign: 'center', lineHeight: 1.6 }}>
        進這頁 2 秒後系統會自動把未讀標為已讀。要回覆學員請直接在 LINE@ Manager 對話。
      </p>
    </main>
  );
}
