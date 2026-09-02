import type { Metadata } from 'next';

// LIFF 頂端 title:override 全站預設「NEOP STALL 管理後台」(同 /m/shop 作法)
export const metadata: Metadata = {
  title: '會員中心',
};

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
