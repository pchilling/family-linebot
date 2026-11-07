/**
 * 團購 LINE 推播(Phase 35,2026-11-07)。
 * 開團通知(推給攤位全部 active LINE 好友)與到貨通知(推給本團每張單有 line_user_id 的客人)。
 * 失敗一律 catch 計入 failed、絕不 throw 回 action。
 * 開團通知所有人同一則 → 用 multicast 每 500 人一批(LINE 上限),API 呼叫數從 N 降到 ceil(N/500),好友多也不會撐爆 server action 時限;
 * 到貨通知每人單號不同 → 逐一 push(本團訂單數通常不多)。推播額度兩種做法都一樣每人算一則。
 * 不用 broadcast:共用全站 channel 時會推到別攤位的好友。
 *
 * client:tenants.line_channel_access_token 有值就用攤位自己的 MessagingApiClient,沒有退回 lib/line.ts 的 lineClient。
 * Flex 卡照 buildPaymentFlexMessage 的樣式:標題最多 1 顆 emoji、按鈕不放 emoji。
 */
import { messagingApi } from '@line/bot-sdk';
import { lineClient } from './line';
import { siteOrigin } from './return-to';
import { supabaseAdmin } from './supabase';
import { fmtArrival, fmtEndsAt, getGroupBuyById, type GroupBuyRow } from './groupbuy';

export type PushResult = { sent: number; failed: number };

/** 攤位全部 active 的 LINE 好友人數(users.status='active'),開團表單「會推給 N 人」用 */
export async function countPushRecipients(tenantId: string): Promise<number> {
  if (!tenantId) return 0;
  const { count, error } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (error) {
    console.error('[countPushRecipients]', error);
    return 0;
  }
  return count ?? 0;
}

// ---- 內部 ----

type TenantForPush = { slug: string; name: string; line_channel_access_token: string | null };

async function loadTenantForPush(tenantId: string): Promise<TenantForPush | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('slug, name, line_channel_access_token')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    console.error('[groupbuy-notify tenant]', error);
    return null;
  }
  return (data as TenantForPush | null) ?? null;
}

/** 攤位有自己的 channel access token 就用它,沒有退回全站那把 */
function clientFor(tenant: TenantForPush): messagingApi.MessagingApiClient {
  const token = tenant.line_channel_access_token?.trim();
  if (token) return new messagingApi.MessagingApiClient({ channelAccessToken: token });
  return lineClient;
}

/** 逐一推、逐一 await;失敗記 failed 不 throw */
async function pushEach(
  client: messagingApi.MessagingApiClient,
  targets: { to: string; message: messagingApi.Message }[],
): Promise<PushResult> {
  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      await client.pushMessage({ to: t.to, messages: [t.message] });
      sent += 1;
    } catch (e) {
      failed += 1;
      console.warn('[groupbuy-notify] push 失敗', t.to.slice(0, 6), e instanceof Error ? e.message : e);
    }
  }
  return { sent, failed };
}

/** LINE multicast 一次最多 500 個收件人 */
const MULTICAST_BATCH = 500;

/** 同一則訊息推給多人:每 500 人一次 multicast;以批為單位計 sent / failed,失敗記 failed 不 throw */
async function multicastAll(
  client: messagingApi.MessagingApiClient,
  ids: string[],
  message: messagingApi.Message,
): Promise<PushResult> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += MULTICAST_BATCH) {
    const batch = ids.slice(i, i + MULTICAST_BATCH);
    try {
      await client.multicast({ to: batch, messages: [message] });
      sent += batch.length;
    } catch (e) {
      failed += batch.length;
      console.warn('[groupbuy-notify] multicast 失敗', `batch ${i / MULTICAST_BATCH + 1}`, batch.length, e instanceof Error ? e.message : e);
    }
  }
  return { sent, failed };
}

/** 一列「標籤 … 值」 */
function kvRow(label: string, value: string, margin: 'lg' | 'sm' = 'sm'): messagingApi.FlexBox {
  return {
    type: 'box', layout: 'baseline', margin,
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#71717a', flex: 3 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: '#18181b', flex: 5, align: 'end', wrap: true },
    ],
  };
}

/** 開團卡:團名 / 截止 / 預計到貨 三列 + 說明前 60 字 + 「看團購」 */
function buildOpenedFlex(gb: GroupBuyRow, tenantName: string, groupBuyUrl: string): messagingApi.FlexMessage {
  const desc = (gb.description ?? '').trim();
  const descShort = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc;
  const bodyContents: messagingApi.FlexBox['contents'] = [
    { type: 'text', text: `🛒 ${gb.name} 開團了`, weight: 'bold', size: 'lg', color: '#16a34a', wrap: true },
    { type: 'text', text: tenantName, size: 'xs', color: '#71717a', margin: 'xs' },
    kvRow('團名', gb.name, 'lg'),
    kvRow('截止', fmtEndsAt(gb.ends_at)),
    kvRow('預計到貨', fmtArrival(gb.expected_arrival_on)),
  ];
  if (descShort) {
    bodyContents.push({ type: 'separator', margin: 'lg', color: '#e4e4e7' });
    bodyContents.push({ type: 'text', text: descShort, size: 'sm', color: '#374151', wrap: true, margin: 'lg' });
  }
  bodyContents.push({
    type: 'text',
    text: '收單中,點下方「看團購」挑商品;整張單會等到貨後一起出。',
    size: 'xs', color: '#71717a', wrap: true, margin: 'lg',
  });
  return {
    type: 'flex',
    altText: `${gb.name} 開團了 · 截止 ${fmtEndsAt(gb.ends_at)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'none', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#16a34a', height: 'sm', action: { type: 'uri', label: '看團購', uri: groupBuyUrl } },
        ],
      },
    },
  };
}

/** 到貨卡:團名 + 訂單編號(同一人多張單全列)+ 「查看訂單」 */
function buildArrivedFlex(gb: GroupBuyRow, orderNos: string[], orderUrl: string): messagingApi.FlexMessage {
  const bodyContents: messagingApi.FlexBox['contents'] = [
    { type: 'text', text: '📦 團購商品到貨了', weight: 'bold', size: 'lg', color: '#16a34a' },
    kvRow('團購', gb.name, 'lg'),
    kvRow('訂單編號', orderNos.join('\n')),
    { type: 'separator', margin: 'lg', color: '#e4e4e7' },
    {
      type: 'text',
      text: '您訂的團購商品已經到貨,賣家會盡快為您出貨,出貨後會再通知您。',
      size: 'xs', color: '#71717a', wrap: true, margin: 'lg',
    },
  ];
  return {
    type: 'flex',
    altText: `團購商品到貨了 · ${gb.name} · 訂單 ${orderNos.join('、')}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'none', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#16a34a', height: 'sm', action: { type: 'uri', label: '查看訂單', uri: orderUrl } },
        ],
      },
    },
  };
}

/**
 * 開團通知:推給攤位全部 active LINE 好友(multicast 分批);文案帶團名、截止、預計到貨、/{slug}/groupbuy 連結。
 */
export async function notifyGroupBuyOpened(tenantId: string, groupBuyId: string): Promise<PushResult> {
  const none: PushResult = { sent: 0, failed: 0 };
  try {
    const [tenant, gb] = await Promise.all([loadTenantForPush(tenantId), getGroupBuyById(tenantId, groupBuyId)]);
    if (!tenant || !gb) return none;
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('line_user_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (error) {
      console.error('[notifyGroupBuyOpened users]', error);
      return none;
    }
    const ids = [...new Set(((data as { line_user_id: string | null }[] | null) ?? []).map((u) => u.line_user_id).filter((x): x is string => !!x))];
    if (ids.length === 0) return none;
    const url = `${siteOrigin()}/${tenant.slug}/groupbuy`;
    const message = buildOpenedFlex(gb, tenant.name, url);
    return await multicastAll(clientFor(tenant), ids, message);
  } catch (e) {
    console.error('[notifyGroupBuyOpened]', e);
    return none;
  }
}

/**
 * 到貨通知:本團每張未取消訂單、有 users.line_user_id 的客人各推一則;
 * 同一個 LINE 帳號多張單只推一則但列出全部單號,按鈕開第一張單(帶 ?k= 存取碼)。
 */
export async function notifyGroupBuyArrived(tenantId: string, groupBuyId: string): Promise<PushResult> {
  const none: PushResult = { sent: 0, failed: 0 };
  try {
    const [tenant, gb] = await Promise.all([loadTenantForPush(tenantId), getGroupBuyById(tenantId, groupBuyId)]);
    if (!tenant || !gb) return none;
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_no, access_key, created_at, users(line_user_id)')
      .eq('tenant_id', tenantId)
      .eq('group_buy_id', groupBuyId)
      .not('status', 'in', '(cancelled,refunded)')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[notifyGroupBuyArrived orders]', error);
      return none;
    }
    type Row = { order_no: string; access_key: string | null; users: { line_user_id: string | null } | null };
    const byLine = new Map<string, { orderNos: string[]; firstNo: string; firstKey: string | null }>();
    for (const o of ((data as unknown as Row[] | null) ?? [])) {
      const lid = o.users?.line_user_id;
      if (!lid) continue;
      const cur = byLine.get(lid);
      if (cur) cur.orderNos.push(o.order_no);
      else byLine.set(lid, { orderNos: [o.order_no], firstNo: o.order_no, firstKey: o.access_key ?? null });
    }
    if (byLine.size === 0) return none;
    const base = siteOrigin();
    const targets = [...byLine.entries()].map(([to, g]) => ({
      to,
      message: buildArrivedFlex(gb, g.orderNos, `${base}/${tenant.slug}/order/${g.firstNo}${g.firstKey ? `?k=${g.firstKey}` : ''}`),
    }));
    return await pushEach(clientFor(tenant), targets);
  } catch (e) {
    console.error('[notifyGroupBuyArrived]', e);
    return none;
  }
}
