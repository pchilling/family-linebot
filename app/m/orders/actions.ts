'use server';

import { supabaseAdmin } from '@/lib/supabase';

const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID!;
const TENANT_ID = process.env.DEFAULT_TENANT_ID!;

async function verifyIdToken(idToken: string): Promise<string> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: LIFF_CHANNEL_ID,
  });
  const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LIFF token 驗證失敗: ${text}`);
  }
  const data = (await resp.json()) as { sub?: string };
  if (!data.sub) throw new Error('LIFF token 缺 sub');
  return data.sub;
}

export type OrderListItem = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_twd: number;
  created_at: string;
  items_summary: string; // 「商品A x2, 商品B x1」or「商品A x2 + 2 件」
};

export type MyOrdersData = {
  tenantSlug: string;
  orders: OrderListItem[];
};

/**
 * 列出該 LINE 用戶在此 tenant 的所有訂單(近 50 筆)
 */
export async function loadMyOrders(idToken: string): Promise<MyOrdersData> {
  const lineUserId = await verifyIdToken(idToken);

  // 找 user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  // tenant slug 給連結用
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants')
    .select('slug')
    .eq('id', TENANT_ID)
    .maybeSingle();
  const tenantSlug = (tenantRow as { slug: string } | null)?.slug ?? 'oilswa';

  if (!user) {
    return { tenantSlug, orders: [] };
  }

  // 訂單 + 簡要 items
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_no, status, payment_status, total_twd, created_at, order_items(product_name, qty)')
    .eq('tenant_id', TENANT_ID)
    .eq('user_id', (user as { id: string }).id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[loadMyOrders]', error);
    throw new Error('讀取訂單失敗');
  }

  type Row = {
    id: string;
    order_no: string;
    status: string;
    payment_status: string;
    total_twd: number;
    created_at: string;
    order_items: { product_name: string; qty: number }[] | null;
  };

  const rows = ((orders as unknown) as Row[] | null) ?? [];

  return {
    tenantSlug,
    orders: rows.map((r) => {
      const items = r.order_items ?? [];
      let summary = '';
      if (items.length === 0) summary = '(無明細)';
      else if (items.length === 1) summary = `${items[0].product_name} × ${items[0].qty}`;
      else {
        const first = items[0];
        const restCount = items.slice(1).reduce((sum, i) => sum + i.qty, 0);
        summary = `${first.product_name} × ${first.qty} + ${restCount} 件`;
      }
      return {
        id: r.id,
        order_no: r.order_no,
        status: r.status,
        payment_status: r.payment_status,
        total_twd: r.total_twd,
        created_at: r.created_at,
        items_summary: summary,
      };
    }),
  };
}
