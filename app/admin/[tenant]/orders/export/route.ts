import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 訂單匯出 CSV(2026-09-02,批次 B #20)。
 * 吃跟訂單列表一樣的 query params(status / payment / source / q / from / to),
 * 「先用列表篩好 → 按匯出」= 匯出目前看到的範圍。to 含當天。
 * UTF-8 BOM 讓 Excel 直接開不亂碼。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  const payment = sp.get('payment') ?? '';
  const source = sp.get('source') ?? '';
  const q = sp.get('q') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';

  let query = supabaseAdmin
    .from('orders')
    .select(
      'order_no, status, payment_status, payment_method, payment_last5, total_twd, shipping_method, shipping_fee_twd, source, shipping_recipient, shipping_phone, shipping_address, tracking_no, note, created_at, paid_at, shipped_at, order_items(qty, price_at_purchase, products(name), product_variants(variant_name))',
    )
    .eq('tenant_id', tenant.id);

  if (status) query = query.eq('status', status);
  if (payment) query = query.eq('payment_status', payment);
  if (source) query = query.eq('source', source);
  if (from) query = query.gte('created_at', `${from}T00:00:00+08:00`);
  if (to) {
    // 含當天:界線設到隔天 00:00(台灣時區)
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
    query = query.lt('created_at', end.toISOString());
  }
  if (q) {
    const safe = q.replace(/[%,]/g, '');
    query = query.or(
      `order_no.ilike.%${safe}%,shipping_recipient.ilike.%${safe}%,shipping_phone.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(5000);
  if (error) {
    console.error('[orders export]', error);
    return NextResponse.json({ error: '匯出失敗' }, { status: 500 });
  }

  type ItemRow = {
    qty: number;
    price_at_purchase: number;
    products: { name: string } | null;
    product_variants: { variant_name: string } | null;
  };
  type Row = {
    order_no: string;
    status: string;
    payment_status: string;
    payment_method: string | null;
    payment_last5: string | null;
    total_twd: number;
    shipping_method: string | null;
    shipping_fee_twd: number | null;
    source: string | null;
    shipping_recipient: string | null;
    shipping_phone: string | null;
    shipping_address: string | null;
    tracking_no: string | null;
    note: string | null;
    created_at: string;
    paid_at: string | null;
    shipped_at: string | null;
    order_items: ItemRow[] | null;
  };
  const rows = ((data ?? []) as unknown as Row[]);

  const statusMap: Record<string, string> = {
    open: '待付款', paid: '已付款', shipped: '已出貨',
    delivered: '已送達', cancelled: '已取消', refunded: '已退款',
  };
  const payMap: Record<string, string> = { pending: '未付', paid: '已付', failed: '失敗', refunded: '已退' };

  const fmtTw = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) // YYYY-MM-DD HH:mm:ss
      : '';
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    '訂單編號', '建立日期', '狀態', '付款狀態', '付款方式', '匯款後五碼',
    '商品小計', '運費', '合計', '來源', '收件人', '電話', '地址', '追蹤單號',
    '品項明細', '付款時間', '出貨時間', '備註',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const items = (r.order_items ?? [])
      .map((it) => {
        const vn = it.product_variants?.variant_name;
        const name = it.products?.name ?? '(已刪)';
        return `${name}${vn && vn !== 'default' ? `(${vn})` : ''} x${it.qty} @${it.price_at_purchase}`;
      })
      .join('; ');
    lines.push(
      [
        esc(r.order_no),
        fmtTw(r.created_at),
        esc(statusMap[r.status] ?? r.status),
        esc(payMap[r.payment_status] ?? r.payment_status),
        esc(r.payment_method ?? ''),
        esc(r.payment_last5 ?? ''),
        r.total_twd,
        r.shipping_fee_twd ?? 0,
        r.total_twd + (r.shipping_fee_twd ?? 0),
        esc(r.source ?? ''),
        esc(r.shipping_recipient ?? ''),
        esc(r.shipping_phone ?? ''),
        esc(r.shipping_address ?? ''),
        esc(r.tracking_no ?? ''),
        esc(items),
        fmtTw(r.paid_at),
        fmtTw(r.shipped_at),
        esc(r.note ?? ''),
      ].join(','),
    );
  }

  const rangeTag = from || to ? `-${from || 'start'}~${to || 'now'}` : '';
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const csv = '﻿' + lines.join('\n'); // BOM:Excel 開 UTF-8 不亂碼
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${slug}${rangeTag || '-' + today}.csv"`,
    },
  });
}
