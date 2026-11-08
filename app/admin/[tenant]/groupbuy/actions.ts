'use server';

/**
 * 後台「團購」的 server action(Phase 35,2026-11-07)。規格:docs/GROUPBUY.md。
 * 每支一進來先 requireAdminTenant(slug),讀寫一律 eq tenant_id;狀態轉換只接受合法前態,否則 throw。
 * 合法轉換:open → closed(提前截止)、closed(未 ordered)→ open(重新開放)、closed → ordered、ordered → arrived、arrived → done。
 * 「有效狀態」看 effectiveStatus:DB 是 open 但 ends_at 到了算已截止(標已訂貨時順手把 DB 落成 closed)。
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminTenant } from '@/lib/super-admin';
import { effectiveStatus, getCurrentGroupBuy, GROUP_BUY_SELECT, setFollowerApproval, type GroupBuyRow } from '@/lib/groupbuy';
import { notifyGroupBuyArrived, notifyGroupBuyOpened, notifyGroupBuyRequesters } from '@/lib/groupbuy-notify';

/** datetime-local 'YYYY-MM-DDTHH:MM'(台北)→ ISO;空字串 → null;格式不對 → throw */
function endsAtFromForm(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new Error('截止時間格式不正確');
  const iso = new Date(`${s}:00+08:00`);
  if (!Number.isFinite(iso.getTime())) throw new Error('截止時間格式不正確');
  return iso.toISOString();
}

/** date 'YYYY-MM-DD' → 原字串(DB date 欄位);空 → null */
function arrivalFromForm(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('預計到貨日格式不正確');
  return s;
}

function revalidateGroupBuy(slug: string) {
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/groupbuy`);
  revalidatePath(`/admin/${slug}/groupbuy`, 'layout');
}

async function requireTenant(formData: FormData) {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  if (!slug) throw new Error('缺攤位資訊');
  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');
  return { slug, tenant };
}

async function loadRow(tenantId: string, id: string): Promise<GroupBuyRow> {
  if (!id) throw new Error('缺資料 id');
  const { data, error } = await supabaseAdmin
    .from('group_buys')
    .select(GROUP_BUY_SELECT)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('讀取失敗:' + error.message);
  if (!data) throw new Error('這一團不存在');
  return data as GroupBuyRow;
}

async function updateRow(tenantId: string, id: string, patch: Record<string, unknown>, fromStatus: string | string[]): Promise<void> {
  // where 加 status 條件:兩個人同時按,第二個會改到 0 列而不是蓋掉狀態
  let q = supabaseAdmin.from('group_buys').update(patch).eq('tenant_id', tenantId).eq('id', id);
  q = Array.isArray(fromStatus) ? q.in('status', fromStatus) : q.eq('status', fromStatus);
  const { data, error } = await q.select('id');
  if (error) {
    if (error.code === '23505') throw new Error('已經有一團在收單中,請先截止那一團');
    throw new Error('儲存失敗:' + error.message);
  }
  if (!data || data.length === 0) throw new Error('狀態已經被改過,請重新整理再試');
}

// ====================
// 開團 / 編輯
// ====================

/** tenant_slug, name, description, ends_at(datetime-local 台北), expected_arrival_on(date), notify_on_open('on') */
export async function createGroupBuy(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const name = String(formData.get('name') ?? '').trim().slice(0, 60);
  if (!name) throw new Error('請填團名');
  const description = String(formData.get('description') ?? '').trim().slice(0, 1000) || null;
  const ends_at = endsAtFromForm(String(formData.get('ends_at') ?? ''));
  if (ends_at && new Date(ends_at).getTime() <= Date.now()) throw new Error('截止時間已經過了,請改晚一點或留空改成手動截止');
  const expected_arrival_on = arrivalFromForm(String(formData.get('expected_arrival_on') ?? ''));
  const notify_on_open = formData.get('notify_on_open') === 'on';

  // 同時只能一團收單中;上一團時間到了但 DB 還是 open → 先落成 closed 再開新團
  const current = await getCurrentGroupBuy(tenant.id);
  if (current) {
    if (effectiveStatus(current) === 'open') throw new Error('已經有一團在收單中,請先截止');
    await updateRow(tenant.id, current.id, { status: 'closed', closed_at: current.ends_at }, 'open');
  }

  const { data, error } = await supabaseAdmin
    .from('group_buys')
    .insert({ tenant_id: tenant.id, name, description, ends_at, expected_arrival_on, status: 'open', notify_on_open })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new Error('已經有一團在收單中,請先截止');
    throw new Error('開團失敗:' + (error?.message ?? ''));
  }
  const id = (data as { id: string }).id;

  let sent = 0;
  let failed = 0;
  if (notify_on_open) {
    const r = await notifyGroupBuyOpened(tenant.id, id);
    sent = r.sent;
    failed = r.failed;
  }
  // Phase 37:按過「開團通知我」的人 — 有推全部好友時他們已經收到,只標記;沒推才單獨推給他們
  const rq = await notifyGroupBuyRequesters(tenant.id, id, notify_on_open);
  sent += rq.sent;
  failed += rq.failed;

  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=created${notify_on_open || rq.sent > 0 ? `&sent=${sent}&failed=${failed}` : ''}`);
}

// ====================
// Phase 37(2026-11-08):追蹤申請核准 / 拒絕(攤位開了「追蹤要核准」才會有 pending)
// ====================

/** tenant_slug, id(tenant_followers.id) */
export async function approveFollower(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  await setFollowerApproval(tenant.id, id, true);
  revalidatePath(`/admin/${slug}/groupbuy`);
  revalidatePath(`/admin/${slug}/customers`);
  revalidatePath(`/${slug}/groupbuy`);
  redirect(`/admin/${slug}/groupbuy?saved=approved`);
}

export async function rejectFollower(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  await setFollowerApproval(tenant.id, id, false);
  revalidatePath(`/admin/${slug}/groupbuy`);
  revalidatePath(`/admin/${slug}/customers`);
  redirect(`/admin/${slug}/groupbuy?saved=rejected`);
}

/** id + 同上欄位(status != done 才能改);notify_on_open 只是紀錄,編輯不會重推 */
export async function updateGroupBuy(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  if (row.status === 'done') throw new Error('已結團的團不能再編輯');

  const name = String(formData.get('name') ?? '').trim().slice(0, 60);
  if (!name) throw new Error('請填團名');
  const description = String(formData.get('description') ?? '').trim().slice(0, 1000) || null;
  const ends_at = endsAtFromForm(String(formData.get('ends_at') ?? ''));
  const expected_arrival_on = arrivalFromForm(String(formData.get('expected_arrival_on') ?? ''));

  const { error } = await supabaseAdmin
    .from('group_buys')
    .update({ name, description, ends_at, expected_arrival_on })
    .eq('tenant_id', tenant.id)
    .eq('id', id);
  if (error) throw new Error('儲存失敗:' + error.message);

  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=edit`);
}

// ====================
// 狀態轉換
// ====================

/** 提前截止:open → closed */
export async function closeGroupBuy(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  if (row.status !== 'open') throw new Error('只有收單中的團可以截止');
  // 時間已到的團 closed_at 用它的 ends_at(真正截止的時刻);手動提前截止用現在
  const closed_at = effectiveStatus(row) === 'closed' ? row.ends_at : new Date().toISOString();
  await updateRow(tenant.id, id, { status: 'closed', closed_at }, 'open');
  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=closed`);
}

/** 重新開放:closed(未 ordered)→ open;ends_at 已過就清成 null(手動截止),否則一開放馬上又是已截止 */
export async function reopenGroupBuy(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  const endsExpired = !!row.ends_at && new Date(row.ends_at).getTime() <= Date.now();
  if (row.status === 'open' && endsExpired) {
    // 時間到了自動截止、DB 還是 open:重新開放 = 把截止時間清掉(變手動截止)
    await updateRow(tenant.id, id, { ends_at: null }, 'open');
  } else {
    if (row.status !== 'closed') throw new Error('只有已截止、還沒訂貨的團可以重新開放');
    // 另一團 open 時 partial unique index 會 23505,updateRow 會轉成看得懂的錯誤
    await updateRow(tenant.id, id, { status: 'open', closed_at: null, ...(endsExpired ? { ends_at: null } : {}) }, 'closed');
  }
  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=reopened`);
}

/** 標已訂貨:closed → ordered;DB 是 open 但時間已到(自動截止還沒落庫)也接受,先落成 closed */
export async function markGroupBuyOrdered(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  const eff = effectiveStatus(row);
  if (eff !== 'closed') throw new Error('只有已截止的團可以標已訂貨');
  if (row.status === 'open') {
    await updateRow(tenant.id, id, { status: 'closed', closed_at: row.ends_at }, 'open');
  }
  await updateRow(tenant.id, id, { status: 'ordered', ordered_at: new Date().toISOString() }, 'closed');
  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=ordered`);
}

/** 標到貨:ordered → arrived,再推 LINE 通知給本團客人;結果用 ?saved=arrived&sent=N&failed=M 帶回 */
export async function markGroupBuyArrived(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  if (row.status !== 'ordered') throw new Error('只有已訂貨的團可以標到貨');
  await updateRow(tenant.id, id, { status: 'arrived', arrived_at: new Date().toISOString() }, 'ordered');
  const r = await notifyGroupBuyArrived(tenant.id, id);
  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=arrived&sent=${r.sent}&failed=${r.failed}`);
}

/** 結團:arrived → done */
export async function markGroupBuyDone(formData: FormData): Promise<void> {
  const { slug, tenant } = await requireTenant(formData);
  const id = String(formData.get('id') ?? '').trim();
  const row = await loadRow(tenant.id, id);
  if (row.status !== 'arrived') throw new Error('只有已到貨的團可以結團');
  await updateRow(tenant.id, id, { status: 'done', done_at: new Date().toISOString() }, 'arrived');
  revalidateGroupBuy(slug);
  redirect(`/admin/${slug}/groupbuy/${id}?saved=done`);
}
