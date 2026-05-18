import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { signOut } from './actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {user && (
        <header
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Link
            href="/admin/classes"
            style={{ fontWeight: 600, textDecoration: 'none', color: '#000' }}
          >
            Admin
          </Link>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: '#666' }}>{user.email}</span>
          <form action={signOut} style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 0,
                color: '#0070f3',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
            >
              登出
            </button>
          </form>
        </header>
      )}
      {children}
    </div>
  );
}
