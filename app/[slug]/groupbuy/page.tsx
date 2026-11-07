import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FlashToast } from '../../_components/toast';
import { ShopListing } from '../shop-listing';
import { buildListing } from '../shop-listing-data';
import { followThisStore } from './actions';
import { canViewGroupBuy, fmtArrivalPhrase, fmtEndsAt, followTenant, getGroupBuyState, GROUP_BUY_STATUS_LABEL } from '@/lib/groupbuy';
import { IconLock, IconUsers } from '@/lib/icons';
import { getCurrentMember } from '@/lib/member-auth';
import { loginHref } from '@/lib/return-to';
import { getActiveProducts, getTenantPublic } from '@/lib/supabase';
import { Button, ButtonLink } from '@/lib/ui';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ follow?: string; followed?: string }>;
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
.gb-card h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gb-card h2 .st{font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px}
.gb-card p{margin:0;font-size:13.5px;line-height:1.7;white-space:pre-wrap}
.gb-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-top:2px}
.gb-meta span{display:inline-flex;align-items:center;gap:5px}
.gb-open{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
.gb-open .st{background:#dcfce7;color:#15803d}
.gb-idle{background:#fafafa;border-color:var(--ui-line);color:#52525b}
.gb-idle h2{color:var(--ui-ink)}
.gb-gate{max-width:440px;margin:24px auto 0;padding:40px 28px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}
.gb-gate .ic{width:52px;height:52px;border-radius:50%;background:var(--ui-line-soft);display:grid;place-items:center;color:var(--ui-muted)}
.gb-gate h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.3}
.gb-gate p{margin:0;font-size:14px;line-height:1.7;color:var(--ui-muted)}
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

  // 登入回來帶 follow=1 → 自動追蹤,再導回乾淨網址顯示 toast
  if (sp?.follow === '1' && member) {
    await followTenant(tenant.id, member.id);
    redirect(`/${slug}/groupbuy?followed=1`);
  }

  const canView = await canViewGroupBuy(tenant, member);
  if (!canView) {
    return (
      <div className="ui-enter">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ui-card gb-gate">
          <span className="ic"><IconLock size={22} /></span>
          <div>
            <h2>團購只開放給追蹤這家店的人</h2>
            <p style={{ marginTop: 8 }}>追蹤後就能看到團購商品,開團時也會在這個分頁第一時間看到。</p>
          </div>
          {member ? (
            <form action={followThisStore}>
              <input type="hidden" name="tenant_slug" value={slug} />
              <input type="hidden" name="return_to" value={`/${slug}/groupbuy`} />
              <Button type="submit" variant="primary" size="lg">追蹤這家店</Button>
            </form>
          ) : (
            <ButtonLink href={loginHref(slug, `/${slug}/groupbuy?follow=1`)} variant="primary" size="lg">登入並追蹤這家店</ButtonLink>
          )}
        </div>
      </div>
    );
  }

  const [state, products] = await Promise.all([getGroupBuyState(tenant.id), getActiveProducts(tenant.id, 'groupbuy')]);
  const { listing, categories } = await buildListing(tenant, products);
  const current = state.current;
  const last = state.last;

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
    </div>
  );

  return (
    <div className="ui-enter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {sp?.followed === '1' && <FlashToast message={`已追蹤 ${tenant.name}`} />}
      <ShopListing slug={slug} products={listing} categories={categories} canBuy={!!current} mode="groupbuy" headerSlot={headerSlot} />
    </div>
  );
}
