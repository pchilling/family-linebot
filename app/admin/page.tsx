import { redirect } from 'next/navigation';

export default function AdminIndex() {
  // 預設 tenant = oilswa(Phase 4-Alpha 暫無 tenant selector,直 redirect)
  redirect('/admin/oilswa/products');
}
