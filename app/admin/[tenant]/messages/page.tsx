import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type MessageRow = {
  id: string;
  user_id: string | null;
  message_type: string | null;
  content: { text?: string; type?: string } | null;
  is_support: boolean;
  created_at: string;
  users: { id: string; display_name: string | null; full_name: string | null } | null;
};

type Filters = {
  q?: string;
  user?: string; // user id
  scope?: string; // 'support' (default) | 'all'
};

async function getMessages(tenantId: string, f: Filters): Promise<MessageRow[]> {
  let query = supabaseAdmin
    .from('messages')
    .select(
      'id, user_id, message_type, content, is_support, created_at, users(id, display_name, full_name)',
    )
    .eq('tenant_id', tenantId)
    .eq('direction', 'inbound')
    .eq('event_type', 'message');

  // 預設只看 support 訊息(用戶按客服後的問題)
  if (f.scope !== 'all') {
    query = query.eq('is_support', true);
  }

  if (f.user) query = query.eq('user_id', f.user);

  query = query.order('created_at', { ascending: false }).limit(200);

  const { data } = await query;
  let rows = ((data as unknown) as MessageRow[] | null) ?? [];

  // 後端再 filter q(client search 內文)
  if (f.q) {
    const needle = f.q.toLowerCase();
    rows = rows.filter((m) => {
      const text = m.content?.text ?? '';
      const name = m.users?.full_name ?? m.users?.display_name ?? '';
      return text.toLowerCase().includes(needle) || name.toLowerCase().includes(needle);
    });
  }

  return rows;
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

function typeColor(t: string | null): string {
  return (
    {
      text: '#1f2937',
      image: '#0070f3',
      sticker: '#f59e0b',
      video: '#7c3aed',
      audio: '#16a34a',
      location: '#dc2626',
      file: '#71717a',
    } as Record<string, string>
  )[t ?? ''] ?? '#71717a';
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

  // 統計近 24 小時 / 7 天
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const stats = {
    last24h: messages.filter((m) => now - new Date(m.created_at).getTime() < day).length,
    last7d: messages.filter((m) => now - new Date(m.created_at).getTime() < 7 * day).length,
  };

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>
        {tenant.name} · 客戶訊息{' '}
        <span style={{ color: '#71717a', fontSize: 14, fontWeight: 400 }}>
          ({messages.length}
          {messages.length >= 200 ? '+,只顯示最近 200' : ''})
        </span>
      </h1>
      <p style={{ fontSize: 13, color: '#71717a', marginBottom: 12 }}>
        近 24 小時 <strong style={{ color: '#18181b' }}>{stats.last24h}</strong> 則 · 近 7 天{' '}
        <strong style={{ color: '#18181b' }}>{stats.last7d}</strong> 則 ·
        {scope === 'support'
          ? '只顯示按「客服」/「真人」後 30 分鐘內的訊息(看到就上 LINE@ Manager 回覆)'
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

      {messages.length === 0 && (
        <p style={{ color: '#71717a', padding: 32, textAlign: 'center', fontSize: 14 }}>
          {hasAnyFilter ? '(條件下無訊息)' : '(尚無客戶訊息)'}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m) => {
          const text = m.content?.text;
          const userName = m.users?.full_name ?? m.users?.display_name ?? '(未知)';
          return (
            <li
              key={m.id}
              style={{
                padding: '12px 16px',
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: 8,
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  {m.users ? (
                    <Link
                      href={`/admin/${tenant.slug}/customers/${m.users.id}`}
                      style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 500, fontSize: 14 }}
                    >
                      {userName}
                    </Link>
                  ) : (
                    <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>(未綁定 user)</span>
                  )}
                  <span
                    style={{
                      padding: '1px 6px',
                      background: typeColor(m.message_type) + '22',
                      color: typeColor(m.message_type),
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {typeLabel(m.message_type)}
                  </span>
                  <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 'auto' }}>
                    {formatTw(m.created_at)}
                  </span>
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
                    {typeLabel(m.message_type)}(非文字訊息,LINE@ Manager 直接看)
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p style={{ marginTop: 24, fontSize: 12, color: '#a1a1aa', textAlign: 'center', lineHeight: 1.6 }}>
        系統只記錄學員 inbound 訊息(他們主動打字 / 傳圖等),不顯示 bot 的回覆。
        <br />
        要回覆學員請直接在 LINE@ Manager 對話。
      </p>
    </main>
  );
}
