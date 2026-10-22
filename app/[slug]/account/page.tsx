import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/member-auth';
import { SIGNOUT_URL, loginHref } from '@/lib/return-to';
import { getTenantPublic, supabaseAdmin } from '@/lib/supabase';
import { Badge, ButtonLink } from '@/lib/ui';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  return { title: tenant ? `我的訂單 - ${tenant.name}` : '我的訂單', robots: { index: false } };
}

type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_twd: number;
  shipping_fee_twd: number;
  created_at: string;
  access_key: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: '處理中',
  paid: '已付款',
  shipped: '已出貨',
  delivered: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const ORDER_SELECT = 'id, order_no, status, payment_status, payment_method, total_twd, shipping_fee_twd, created_at, access_key';

/**
 * 我的訂單(Phase 26):這個攤位裡屬於目前登入會員的訂單。三種對法合併:
 * 1. 登入後下的單(orders.platform_user_id)
 * 2. 以前用訪客身分、留同一個信箱下的單(guest_email)
 * 3. LINE 好友在 LIFF 下的單(orders.user_id → users.line_user_id 跟會員的 LINE 相同)
 * 連結都帶訂單存取碼,點進去就是完整訂單頁。
 */
export default async function AccountPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const member = await getCurrentMember();
  if (!member) redirect(loginHref(slug, `/${slug}/account`));

  const base = () =>
    supabaseAdmin.from('orders').select(ORDER_SELECT).eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50);

  const [byUid, byEmail, lineUsers] = await Promise.all([
    base().eq('platform_user_id', member.id),
    member.email ? base().ilike('guest_email', member.email.replace(/[\\%_]/g, (c) => `\\${c}`)) : Promise.resolve({ data: null }),
    member.line_user_id
      ? supabaseAdmin.from('users').select('id').eq('tenant_id', tenant.id).eq('line_user_id', member.line_user_id)
      : Promise.resolve({ data: null }),
  ]);
  const lineIds = ((lineUsers.data as { id: string }[] | null) ?? []).map((u) => u.id);
  const byLine = lineIds.length > 0 ? await base().in('user_id', lineIds) : { data: null };

  const seen = new Set<string>();
  const orders: OrderRow[] = [];
  for (const res of [byUid, byEmail, byLine]) {
    for (const o of ((res.data as OrderRow[] | null) ?? [])) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      orders.push(o);
    }
  }
  orders.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const label = member.display_name || (member.email ? member.email.split('@')[0] : '會員');
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' });
  const statusOf = (o: OrderRow) => (o.status === 'open' && o.payment_status === 'pending' ? '待付款' : (STATUS_LABEL[o.status] ?? o.status));

  return (
    <div className="ui-enter" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>我的訂單</h1>
          <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {label}
            {member.email ? ` · ${member.email}` : ''}
          </p>
        </div>
        <form action={SIGNOUT_URL} method="post">
          <input type="hidden" name="return_to" value={`/${slug}`} />
          <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">登出</button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="ui-card" style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>還沒有訂單</p>
            <p className="ui-muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>
              用這個帳號下的單會出現在這裡。以前用訪客身分買的,留同一個信箱也會對得起來。
            </p>
          </div>
          <ButtonLink href={`/${slug}`} variant="primary" size="md">去逛逛</ButtonLink>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((o) => (
            <li key={o.id}>
              <a
                href={`/${slug}/order/${o.order_no}${o.access_key ? `?k=${o.access_key}` : ''}`}
                className="ui-card"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="ui-num" style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{o.order_no}</span>
                  <span className="ui-muted ui-num" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{fmtDate(o.created_at)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <Badge>{statusOf(o)}</Badge>
                  <span className="ui-num" style={{ fontSize: 14, fontWeight: 600 }}>NT$ {(o.total_twd + (o.shipping_fee_twd ?? 0)).toLocaleString('en-US')}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
