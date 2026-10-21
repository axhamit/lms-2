'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from './AuthProvider';

// Wraps every logged-in page. `role` locks the page to one role; omit it for pages every role can open.
export default function Shell({ role, wide, children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (role && user.role !== role) router.replace('/' + user.role);
    else if (user.mustChangePassword && path !== '/account') router.replace('/account');
  }, [user, loading, role, path, router]);

  if (loading || !user || (role && user.role !== role)) return <div className="center">Loading…</div>;

  return (
    <>
      <header className="top">
        <Link href={'/' + user.role} className="brand">GSN Foundation</Link>
        <span className="role">{user.role}</span>
        <span className="spacer" />
        <div className="nav-user">
          <div className="nav-avatar">
            <span>{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="nav-user-info">
            <span className="nav-name">{user.name}</span>
            <span className="nav-id">{user.userId}</span>
          </div>
        </div>
        <Link href="/account" className="navlink">Account</Link>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </header>
      <main className={wide ? 'wrap wide' : 'wrap'}>{children}</main>
    </>
  );
}
