import { redirect } from 'next/navigation';

// Legacy URL → redirect 預設 tenant
export default function LegacyClassesPage() {
  redirect('/admin/oilswa/classes');
}
