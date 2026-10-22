'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import AdminGate, { useAdminSession } from './admin-session';

export const navigation = [
  { label: 'لوحة التحكم', href: '/' },
  { label: 'الطلبات المباشرة', href: '/admin/live-orders' },
  { label: 'إدارة الطلبات', href: '/admin/orders' },
  { label: 'المطاعم', href: '/admin/restaurants' },
  { label: 'المندوبون', href: '/admin/drivers' },
  { label: 'العملاء', href: '/admin/customers' },
  { label: 'المدفوعات', href: '/admin/payments' },
  { label: 'العروض والكوبونات', href: '/admin/promotions' },
  { label: 'مناطق التوصيل', href: '/admin/zones' },
  { label: 'الدعم', href: '/admin/support' },
  { label: 'البانرات الإعلانية', href: '/admin/banners' },
  { label: 'طلبات الشراكة', href: '/admin/partners' },
  { label: 'الإشعارات', href: '/admin/notifications' },
  { label: 'تحديثات التطبيقات', href: '/admin/app-updates' },
  { label: 'التقارير', href: '/admin/reports' },
  { label: 'الإعدادات', href: '/admin/settings' },
];

export default function AdminSectionLayout({ children }: { children: ReactNode }) {
  return <AdminGate><Shell>{children}</Shell></AdminGate>;
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useAdminSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <>
      {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="إغلاق القائمة الجانبية" onClick={() => setSidebarOpen(false)} />}
      <div className="admin-shell">
        <aside id="admin-sidebar" className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="brand"><div className="brand-mark">♨</div><div><h1>معًا</h1><small>مدير النظام</small></div></div>
          <nav className="admin-nav" aria-label="القائمة الرئيسية">
            {navigation.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname === item.href;
              return <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => setSidebarOpen(false)}>{item.label}</Link>;
            })}
          </nav>
          <div className="sidebar-note">منصة توصيل تجمع العملاء والمطاعم والسائقين داخل مصر.</div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button type="button" className="menu-toggle" aria-label={sidebarOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={sidebarOpen} aria-controls="admin-sidebar" onClick={() => setSidebarOpen((open) => !open)}><span aria-hidden="true">☰</span></button>
            <Link className="section-back" href="/">← لوحة التحكم</Link>
            <div className="user-chip"><div className="avatar">م</div><div><strong>{session.user.displayName || 'مدير المنصة'}</strong><div className="muted">{session.user.email}</div></div><button className="link-button" onClick={() => session.signOut()}>خروج</button></div>
          </header>
          {children}
        </div>
      </div>
    </>
  );
}
