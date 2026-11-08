import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FlashToast } from '../../_components/toast';
import { ShopListing } from '../shop-listing';
import { buildListing } from '../shop-listing-data';
import { cancelOpenNotifyAction, followThisStore, requestOpenNotifyAction, unfollowThisStore } from './actions';
import { fmtArrivalPhrase, fmtEndsAt, followTenant, getFollowStatus, getGroupBuyState, GROUP_BUY_STATUS_LABEL, hasOpenNotifyRequest, requestOpenNotify } from '@/lib/groupbuy';
import { IconBell, IconLock, IconUsers } from '@/lib/icons';
import { getCurrentMember } from '@/lib/member-auth';
import { loginHref } from '@/lib/return-to';
import { getActiveProducts, getTenantPublic } from '@/lib/supabase';
import { Button, ButtonLink } from '@/lib/ui';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ follow?: string; followed?: string; requested?: string; notify?: string; notified?: string; notify_off?: string }>;
};

// 要看 cookie(有沒有登入 / 追蹤)與開團狀態,每次都算
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantPublic(slug);
  if (!tenant) return { title: '攤位不存在' };
  return {
    title: `團購 - ${tenant.name}`,
    description: `${tenant.name} 的團購`,
    // 只給追蹤者看時不讓搜尋引擎收錄
    robots: { index: !tenant.groupbuy_followers_only, follow: !tenant.groupbuy_followers_only },
  };
}

const CSS = `
.gb-card{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border-radius:10px;border:1px solid;margin-bottom:24px}
.gb-card h2{margin:0;font-size:1rem;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gb-card h2 .st{font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:999px}
.gb-card p{margin:0;font-size:.8438rem;line-height:1.7;white-space:pre-wrap}
.gb-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:.8125rem;margin-top:2px}
.gb-meta span{display:inline-flex;align-items:center;gap:5px}
.gb-open{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
.gb-open .st{background:#dcfce7;color:#15803d}
.gb-idle{background:#fafafa;border-color:var(--ui-line);color:#52525b}
.gb-idle h2{color:var(--ui-ink)}
.gb-gate{max-width:440px;margin:24px auto 0;padding:40px 28px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}
.gb-gate .ic{width:52px;height:52px;border-radius:50%;background:var(--ui-line-soft);display:grid;place-items:center;color:var(--ui-muted)}
.gb-gate h2{margin:0;font-size:1.25rem;font-weight:600;letter-spacing:-.02em;line-height:1.3}
.gb-gate p{margin:0;font-size:.875rem;line-height:1.7;color:var(--ui-muted)}
.gb-notify{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}
.gb-notify form{margin:0;display:inline-flex}
.gb-notify small{font-size:.7813rem;color:var(--ui-muted)}
@media (max-width:640px){.gb-gate{padding:32px 20px}}
`;

/**
 * 團購分頁(Phase 35,2026-11-07):/{slug}/groupbuy,也是攤主的邀請連結。
 * 攤位開了「只給追蹤者看」且這個人沒追蹤 → 只渲染一扇門,商品、團名都不撈、不送到前端。
 * 能看 → 上方一張狀態卡(收單中綠卡 / 目前沒開團灰卡 + 上一團狀態),下面商品列表跟攤位首頁同一套;
 * 沒開團時商品可看不可買。
 */
export default async function GroupBuyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();
  const member = await getCurrentMember();

  // 登入回來帶 follow=1 → 自動追蹤(Phase 37:攤位要核准就是申請),再導回乾淨網址顯示 toast
  if (sp?.follow === '1' && member) {
    const st = await followTenant(tenant.id, member.id, tenant.groupbuy_follow_approval);
    redirect(`/${slug}/groupbuy?${st === 'pending' ? 'requested' : 'followed'}=1`);
  }
  // Phase 37:登入回來帶 notify=1 → 自動登記開團通知
  if (sp?.notify === '1' && member) {
    await requestOpenNotify(tenant.id, member.id);
    redirect(`/${slug}/groupbuy?notified=1`);
  }

  // Phase 37:三態 — none / pending(申請中)/ approved;只給追蹤者看時要 approved 才能看
  const followStatus = await getFollowStatus(tenant.id, member);
  const canView = !tenant.groupbuy_followers_only || followStatus === 'approved';
  if (!canView) {
    const pending = followStatus === 'pending';
    return (
      <div className="ui-enter">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {sp?.requested === '1' && <FlashToast message="已送出追蹤申請,等這家店核准" />}
        <div className="ui-card gb-gate">
          <span className="ic"><IconLock size={22} /></span>
          <div>
            <h2>{pending ? '追蹤申請已送出' : '團購只開放給追蹤這家店的人'}</h2>
            <p style={{ marginTop: 8 }}>
              {pending
                ? '這家店的追蹤要經店主同意,核准後這個分頁就會顯示團購商品。'
                : tenant.groupbuy_follow_approval
                  ? '送出追蹤申請,店主核准後就能看到團購商品。'
                  : '追蹤後就能看到團購商品,開團時也會在這個分頁第一時間看到。'}
            </p>
          </div>
          {pending ? (
            <form action={unfollowThisStore}>
              <input type="hidden" name="tenant_slug" value={slug} />
              <input type="hidden" name="return_to" value={`/${slug}/groupbuy`} />
              <Button type="submit" variant="outline" size="md">取消申請</Button>
            </form>
          ) : member ? (
            <form action={followThisStore}>
              <input type="hidden" name="tenant_slug" value={slug} />
              <input type="hidden" name="return_to" value={`/${slug}/groupbuy`} />
              <Button type="submit" variant="primary" size="lg">{tenant.groupbuy_follow_approval ? '申請追蹤這家店' : '追蹤這家店'}</Button>
            </form>
          ) : (
            <ButtonLink href={loginHref(slug, `/${slug}/groupbuy?follow=1`)} variant="primary" size="lg">登入並追蹤這家店</ButtonLink>
          )}
        </div>
      </div>
    );
  }

  const [state, products, notifyOn] = await Promise.all([
    getGroupBuyState(tenant.id),
    getActiveProducts(tenant.id, 'groupbuy'),
    member ? hasOpenNotifyRequest(tenant.id, member.id) : Promise.resolve(false),
  ]);
  const { listing, categories } = await buildListing(tenant, products);
  const current = state.current;
  const last = state.last;

  // Phase 37:沒開團時的「開團通知我」— 只能推 LINE,所以沒 LINE 的會員看到的是說明而不是按鈕
  const notifyBlock = current ? null : (
    <div className="gb-notify">
      {notifyOn ? (
        <>
          <small><IconBell size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />開團時會用 LINE 通知你</small>
          <form action={cancelOpenNotifyAction}>
            <input type="hidden" name="tenant_slug" value={slug} />
            <input type="hidden" name="return_to" value={`/${slug}/groupbuy`} />
            <Button type="submit" variant="link" size="xs">取消</Button>
          </form>
        </>
      ) : !member ? (
        <>
          <ButtonLink href={loginHref(slug, `/${slug}/groupbuy?notify=1`)} variant="outline" size="sm">開團通知我</ButtonLink>
          <small>用 LINE 登入,開團時會收到 LINE 通知</small>
        </>
      ) : member.line_user_id ? (
        <form action={requestOpenNotifyAction}>
          <input type="hidden" name="tenant_slug" value={slug} />
          <input type="hidden" name="return_to" value={`/${slug}/groupbuy`} />
          <Button type="submit" variant="outline" size="sm">開團通知我</Button>
        </form>
      ) : (
        <small>開團通知走 LINE,改用 LINE 登入就能收到。</small>
      )}
    </div>
  );

  const headerSlot = current ? (
    <div className={`gb-card gb-open ui-enter`}>
      <h2>
        {current.name}
        <span className="st">收單中</span>
      </h2>
      {current.description && <p>{current.description}</p>}
      <div className="gb-meta">
        <span>截止 {fmtEndsAt(current.ends_at)}</span>
        <span>{fmtArrivalPhrase(current.expected_arrival_on)}</span>
      </div>
    </div>
  ) : (
    <div className="gb-card gb-idle ui-enter">
      <h2><IconUsers size={16} /> 目前沒開團</h2>
      <p>
        {last ? `上一團:${last.name} · ${GROUP_BUY_STATUS_LABEL[last.status]}。` : '這家店還沒開過團。'}
        開團後商品就能加入購物車。
      </p>
      {notifyBlock}
    </div>
  );

  return (
    <div className="ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {sp?.followed === '1' && <FlashToast message={`已追蹤 ${tenant.name}`} />}
      {sp?.requested === '1' && <FlashToast message="已送出追蹤申請,等這家店核准" />}
      {sp?.notified === '1' && <FlashToast message="開團時會用 LINE 通知你" />}
      {sp?.notify_off === '1' && <FlashToast message="已取消開團通知" />}
      <ShopListing slug={slug} products={listing} categories={categories} canBuy={!!current} mode="groupbuy" headerSlot={headerSlot} />
    </div>
  );
}
