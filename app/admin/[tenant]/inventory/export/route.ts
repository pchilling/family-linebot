import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

/**
 * 庫存匯出 CSV(2026-09-02,批次 B #16)。
 * 純匯出給盤點用,不支援匯回。
 * 加 UTF-8 BOM 讓 Excel 直接開不亂碼。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: 'tenant not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('variant_name, sku, stock, price_twd, cost_twd, status, products(name, category, status)')
    .eq('tenant_id', tenant.id)
    .order('sku');
  if (error) {
    console.error('[inventory export]', error);
    return NextResponse.json({ error: '匯出失敗' }, { status: 500 });
  }

  type Row = {
    variant_name: string;
    sku: string;
    stock: number;
    price_twd: number;
    cost_twd: number | null;
    status: string;
    products: { name: string; category: string | null; status: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]);

  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['商品名', '規格', 'SKU', '分類', '庫存', '單價', '成本', '規格狀態', '商品狀態', '盤點數(手填)'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        esc(r.products?.name ?? '(已刪)'),
        esc(r.variant_name),
        esc(r.sku),
        esc(r.products?.category ?? ''),
        r.stock,
        r.price_twd,
        r.cost_twd ?? '',
        esc(r.status),
        esc(r.products?.status ?? ''),
        '', // 盤點欄留白給現場手填
      ].join(','),
    );
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD
  const csv = '﻿' + lines.join('\n'); // BOM:Excel 開 UTF-8 不亂碼
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inventory-${slug}-${today}.csv"`,
    },
  });
}
