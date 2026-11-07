import { notFound } from 'next/navigation';
import { getTenantBySlug, hasFeature, supabaseAdmin } from '@/lib/supabase';
import { bankTransferFromRow } from '@/lib/bank-transfer';
import { codPaymentFromRow } from '@/lib/cvs';
import { getLinePayKeyState, hasLinePayEnvKeys } from '@/lib/linepay';
import { getEcpayKeyState, hasEcpayEnvKeys } from '@/lib/ecpay';
import { isSecretBoxReady } from '@/lib/secret-box';
import { currentAdminEmail, isSuperAdmin } from '@/lib/super-admin';
import { PaymentSettings, type GatewayCard } from '../qr-payment-settings';

type QrPayment = { enabled?: boolean; image_url?: string; label?: string; note?: string; link_url?: string } | null;

/**
 * 設定 → 收款(2026-11-01 改版;Phase 28 匯款改分欄)
 * Phase 34(2026-11-06):LINE Pay / 綠界兩張卡改成每攤位自己的金鑰。這裡在 server 算好只含
 * flag / state / 遮罩字串 / 明文 id / 布林 / 日期的 props 傳給 client,payment_config 原值與密文不進 client。
 * 不再用 isXAvailable:flag(方案權限)與金鑰要分開顯示。
 */
export default async function PaymentSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const [{ data }, linePayKeys, ecpayKeys, email] = await Promise.all([
    // Phase 36:cod_payment(取貨付款)+ shipping_rules(有沒有超商店到店,卡上提示用)
    supabaseAdmin.from('tenants').select('payment_info, qr_payment, bank_transfer, cod_payment, shipping_rules').eq('slug', slug).maybeSingle(),
    getLinePayKeyState(tenant.id),
    getEcpayKeyState(tenant.id),
    currentAdminEmail(),
  ]);
  if (!data) notFound();
  const t = data as {
    payment_info: string | null;
    qr_payment: QrPayment;
    bank_transfer: unknown;
    cod_payment: unknown;
    shipping_rules: { options?: { key: string; cvs?: string }[] } | null;
  };
  const cod = codPaymentFromRow(t.cod_payment);
  const hasCvsShipping = (t.shipping_rules?.options ?? []).some((o) => !!o.cvs);

  const secretBoxReady = isSecretBoxReady();
  // 匯入按鈕只給超級管理員、只在預設攤位(愛油哇)、只在還走 env 退路時出現;看不到按鈕不是防線,server action 才是
  const superHere = isSuperAdmin(email) && !!process.env.DEFAULT_TENANT_ID && tenant.id === process.env.DEFAULT_TENANT_ID;

  const linePayFlag = hasFeature(tenant, 'line_pay');
  const ecpayFlag = hasFeature(tenant, 'ecpay');
  const gateways: GatewayCard[] = [
    {
      key: 'linepay',
      name: 'LINE Pay',
      desc: '需要公司統編。付款完成自動標記已付款。',
      flag: linePayFlag,
      state: !linePayFlag ? 'off' : linePayKeys.state,
      brokenCode: linePayKeys.brokenCode,
      id: linePayKeys.id,
      masked: linePayKeys.masked,
      source: linePayKeys.source,
      updatedAt: linePayKeys.updatedAt,
      sandbox: linePayKeys.sandbox,
      canImport: superHere && linePayKeys.state === 'env' && hasLinePayEnvKeys(),
      secretBoxReady,
    },
    {
      key: 'ecpay',
      name: '綠界 ECPay',
      desc: '信用卡、ATM 虛擬帳號、超商代碼。個人會員也能申請。',
      flag: ecpayFlag,
      state: !ecpayFlag ? 'off' : ecpayKeys.state,
      brokenCode: ecpayKeys.brokenCode,
      id: ecpayKeys.id,
      masked: ecpayKeys.masked,
      source: ecpayKeys.source,
      updatedAt: ecpayKeys.updatedAt,
      sandbox: ecpayKeys.sandbox,
      canImport: superHere && ecpayKeys.state === 'env' && hasEcpayEnvKeys(),
      secretBoxReady,
    },
  ];

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
      cod={{ enabled: cod?.enabled ?? false, note: cod?.note ?? '', max_twd: cod?.max_twd ?? null }}
      hasCvsShipping={hasCvsShipping}
      gateways={gateways}
    />
  );
}
