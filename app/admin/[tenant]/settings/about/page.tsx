import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { planBadge, planLabel } from '@/lib/admin-theme';
import { Badge } from '@/lib/ui';
import { IconCheck, IconInfo } from '@/lib/icons';
import { PanelTitle } from '../settings-ui';

// feature flag → 人看得懂的名稱;沒列的就直接顯示 key
const FEATURE_LABEL: Record<string, string> = {
  line_pay: 'LINE Pay',
  ecpay: '綠界刷卡',
  ecpay_atm: '綠界 ATM',
  activities: '活動與出席',
  news: '最新消息',
};
const STATUS_LABEL: Record<string, string> = { active: '上線中', pending: '審核中', suspended: '停用' };

/** 設定 → 攤位資訊(2026-11-01 改版):由 NEOP 設定的唯讀項目 */
export default async function AboutSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('slug, plan, status, order_prefix, features, created_at, line_channel_id')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) notFound();
  const t = data as {
    slug: string;
    plan: string;
    status: string;
    order_prefix: string;
    features: Record<string, unknown> | null;
    created_at: string;
    line_channel_id: string | null;
  };

  const features = Object.entries(t.features ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => FEATURE_LABEL[k] ?? k);
  if (t.line_channel_id) features.unshift('LINE Bot');

  // 訂單編號範例:prefix-台北時區年月-流水號
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const ym = `${tw.getUTCFullYear()}${String(tw.getUTCMonth() + 1).padStart(2, '0')}`;
  const created = new Date(t.created_at).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="sx-body">
      <PanelTitle title="攤位資訊" desc="由 NEOP 設定的項目,這裡只能看。" />

      <dl className="sx-dl">
        <dt>攤位代號</dt>
        <dd className="sx-mono">{t.slug}</dd>
        <dt>方案</dt>
        <dd>
          <span style={planBadge(t.plan)}>{planLabel(t.plan)}</span>
        </dd>
        <dt>狀態</dt>
        <dd>
          {t.status === 'active' ? (
            <Badge className="sx-badge-ok">
              <IconCheck size={12} />
              上線中
            </Badge>
          ) : (
            <Badge className="sx-badge-off">{STATUS_LABEL[t.status] ?? t.status}</Badge>
          )}
        </dd>
        <dt>訂單編號格式</dt>
        <dd className="sx-mono">
          {t.order_prefix}-{ym}-0001
        </dd>
        <dt>已啟用功能</dt>
        <dd>
          {features.length > 0 ? (
            features.map((f) => (
              <span key={f} className="sx-chip">
                {f}
              </span>
            ))
          ) : (
            <span className="sx-hint">基本功能</span>
          )}
        </dd>
        <dt>建立時間</dt>
        <dd>{created}</dd>
      </dl>

      <hr className="sx-sep" />

      <div className="sx-callout">
        <IconInfo size={16} />
        <span>想升級方案、開 LINE Bot 或 LIFF、換攤位代號,請直接聯繫 NEOP。誰能登後台在左側「管理員」設定。</span>
      </div>
    </div>
  );
}
