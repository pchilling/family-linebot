import { redirect } from 'next/navigation';

export default function AdminIndex() {
  // 預設 tenant = oilswa,進去看 dashboard(/admin/[tenant]/page.tsx)
  redirect('/admin/oilswa');
}
