import type { Metadata } from 'next';

// LIFF 頂端 title:override 全站預設「NEOP STALL 管理後台」
export const metadata: Metadata = {
  title: '商品專區',
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
