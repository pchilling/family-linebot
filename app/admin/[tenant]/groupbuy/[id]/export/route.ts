import { NextRequest, NextResponse } from 'next/server';
import { requireAdminTenant, assertRowAccess } from '@/lib/super-admin';
import { getGroupBuyById, getGroupBuyOrders, summarizeGroupBuyItems } from '@/lib/groupbuy';

/**
 * 團購彙總單匯出 CSV(Phase 35,2026-11-07)。寫法照 inventory/export。
 * 欄:商品,規格,SKU,已付款件數,已付款金額,全部件數,全部金額;加 UTF-8 BOM 給 Excel。
 * 檔名 團購-{團名}-{YYYYMMDD}.csv。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  const { tenant: slug, id } = await params;
  let tenant;
  try {
    tenant = await requireAdminTenant(slug);
    await assertRowAccess('group_buys', id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '沒有權限' }, { status: 403 });
  }
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 404 });

  const gb = await getGroupBuyById(tenant.id, id);
  if (!gb) return NextResponse.json({ error: 'group buy not found' }, { status: 404 });

  const orders = await getGroupBuyOrders(tenant.id, id);
  const lines = summarizeGroupBuyItems(orders);

  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['商品', '規格', 'SKU', '已付款件數', '已付款金額', '全部件數', '全部金額'];
  const out = [header.join(',')];
  for (const l of lines) {
    out.push([esc(l.product_name), esc(l.variant_name), esc(l.sku), l.paid_qty, l.paid_twd, l.all_qty, l.all_twd].join(','));
  }

  const ymd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/-/g, '');
  // 檔名裡的團名:去掉會弄壞 header 的字元
  const safeName = gb.name.replace(/[\\/:*?"<>|\r\n]/g, '').trim().slice(0, 40) || 'groupbuy';
  const filename = `團購-${safeName}-${ymd}.csv`;
  const csv = '﻿' + out.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // 中文檔名用 RFC 5987 的 filename*,舊瀏覽器退回 ASCII 檔名
      'Content-Disposition': `attachment; filename="groupbuy-${ymd}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
