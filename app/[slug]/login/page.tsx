import { notFound, redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/return-to';
import { getTenantPublic } from '@/lib/supabase';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ return_to?: string; error?: string }>;
};

export const dynamic = 'force-dynamic';

/**
 * /[slug]/login(2026-10-24 起):登入改成頁首彈出的視窗(app/[slug]/login-modal.tsx),
 * 這個網址只負責把人導回要回的那一頁並自動打開視窗(帶 ?login=1),舊連結、OAuth 失敗導回都還能用。
 */
export default async function LoginPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantPublic(slug);
  if (!tenant) notFound();

  const returnTo = safeReturnTo(sp.return_to, `/${slug}`);
  const q = new URLSearchParams({ login: '1' });
  if (returnTo !== `/${slug}`) q.set('return_to', returnTo);
  if (typeof sp.error === 'string' && sp.error) q.set('error', sp.error);
  redirect(`/${slug}?${q.toString()}`);
}
