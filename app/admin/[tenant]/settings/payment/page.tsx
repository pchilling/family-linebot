import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { bankTransferFromRow } from '@/lib/bank-transfer';
import { isEcpayAvailable, isLinePayAvailable } from '@/app/[slug]/checkout/actions';
import { PaymentSettings } from '../qr-payment-settings';

type QrPayment = { enabled?: boolean; image_url?: string; label?: string; note?: string; link_url?: string } | null;

/** 設定 → 收款(2026-11-01 改版;Phase 28 匯款改分欄) */
export default async function PaymentSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const [{ data }, linePay, ecpay] = await Promise.all([
    supabaseAdmin.from('tenants').select('payment_info, qr_payment, bank_transfer').eq('slug', slug).maybeSingle(),
    isLinePayAvailable(slug),
    isEcpayAvailable(slug),
  ]);
  if (!data) notFound();
  const t = data as { payment_info: string | null; qr_payment: QrPayment; bank_transfer: unknown };

  return (
    <PaymentSettings
      tenantSlug={slug}
      bank={bankTransferFromRow(t.bank_transfer)}
      legacyPaymentInfo={t.payment_info ?? ''}
      qr={{
        enabled: t.qr_payment?.enabled ?? false,
        image_url: t.qr_payment?.image_url ?? null,
        label: t.qr_payment?.label ?? '',
        note: t.qr_payment?.note ?? '',
        link_url: t.qr_payment?.link_url ?? '',
      }}
      gateways={[
        { key: 'linepay', name: 'LINE Pay', desc: '需要公司統編。付款完成自動標記已付款。', on: linePay },
        { key: 'ecpay', name: '綠界 ECPay', desc: '信用卡、ATM 虛擬帳號、超商代碼。個人會員也能申請。', on: ecpay },
      ]}
    />
  );
}
