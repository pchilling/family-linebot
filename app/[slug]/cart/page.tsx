import { redirect } from 'next/navigation';

/**
 * 2026-09-11:購物車與結帳併成一頁(/checkout 內含明細編輯 + 結帳表單)。
 * 這個路由保留給舊連結 / 書籤,直接轉向。
 */
export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}/checkout`);
}
