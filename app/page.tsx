'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const stats = [
  { label: 'عملاء مسجلون', value: '1,482', trend: '+12%', icon: '♙', tone: 'icon-red' },
  { label: 'إجمالي المدفوعات', value: '286,350 ج.م', trend: '+18%', icon: '▣', tone: 'icon-green' },
  { label: 'إجمالي الطلبات', value: '3,421', trend: '+14%', icon: '🛒', tone: 'icon-orange' },
  { label: 'مطاعم نشطة', value: '128', trend: '+6%', icon: '♨', tone: 'icon-purple' },
];

const orders = [
  ['#7854', 'سارة محمد', 'بيت الشاورما', 'قيد التحضير', '68 ج.م', 'orange'],
  ['#7853', 'خالد عبدالله', 'مذاق القاهرة', 'في الطريق', '42 ج.م', 'green'],
  ['#7852', 'نورة علي', 'برجر لاند', 'جديد', '55 ج.م', 'purple'],
  ['#7851', 'محمد أحمد', 'سلطة وصحة', 'مكتمل', '28 ج.م', 'green'],
];

const navigation = [
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
  { label: 'الإشعارات', href: '/admin/notifications' },
  { label: 'تحديثات التطبيقات', href: '/admin/app-updates' },
  { label: 'التقارير', href: '/admin/reports' },
  { label: 'الإعدادات', href: '/admin/settings' },
];

const bars = [42, 56, 49, 69, 62, 82, 76];
const weekdays = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export default function DashboardPage() {
  const pathname = usePathname();
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
          <div className="sidebar-note">منصة توصيل تجمع العملاء والمطاعم والسائقين في مكان واحد داخل مصر.</div>
        </aside>

        <main className="main">
          <header className="topbar">
            <button type="button" className="menu-toggle" aria-label={sidebarOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={sidebarOpen} aria-controls="admin-sidebar" onClick={() => setSidebarOpen((open) => !open)}><span aria-hidden="true">☰</span></button>
            <label className="search"><span>⌕</span><input placeholder="ابحث عن طلب، مطعم، عميل..." /></label>
            <div className="user-chip"><button className="link-button" aria-label="الإشعارات">♧</button><div className="avatar">م</div><div><strong>مدير المنصة</strong><div className="muted">القاهرة، مصر</div></div></div>
          </header>

          <section className="content">
            <div className="page-heading"><div><h2>مرحبًا بك</h2><p>هذا ملخص حركة الطلبات في منصتك اليوم داخل مصر.</p></div><button className="date-select">آخر 7 أيام　⌄</button></div>
            <div className="stats-grid">{stats.map((s) => <article className="stat-card" key={s.label}><div><div className="stat-label">{s.label}</div><div className="stat-value">{s.value}</div><div className="stat-trend">↑ {s.trend} عن الفترة السابقة</div></div><div className={`stat-icon ${s.tone}`}>{s.icon}</div></article>)}</div>

            <div className="dashboard-grid">
              <section className="panel"><div className="panel-head"><h3>الطلبات خلال الفترة</h3><button className="link-button">هذا الأسبوع⌄</button></div><div className="chart">{bars.map((height, i) => <div className="bar-group" key={weekdays[i]}><div className="bar" style={{ height: `${height}%` }} /><span>{weekdays[i]}</span></div>)}</div></section>
              <section className="panel"><div className="panel-head"><h3>الطلبات المباشرة الآن</h3><Link className="link-button" href="/admin/live-orders">عرض الخريطة</Link></div><div className="map-placeholder"><span style={{ zIndex: 1, fontSize: 30 }}>⌖</span><div className="map-caption">القاهرة الكبرى</div><div className="map-legend"><span>● مطاعم</span><span>● مندوبون</span><span>● طلبات</span></div></div></section>
            </div>

            <div className="dashboard-grid">
              <section className="panel"><div className="panel-head"><h3>أحدث الطلبات</h3><Link className="link-button" href="/admin/orders">عرض الكل</Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>الرقم</th><th>العميل</th><th>المطعم</th><th>الحالة</th><th>المبلغ</th></tr></thead><tbody>{orders.map((o) => <tr key={o[0]}><td>{o[0]}</td><td>{o[1]}</td><td>{o[2]}</td><td><span className={`status ${o[5]}`}>{o[3]}</span></td><td>{o[4]}</td></tr>)}</tbody></table></div></section>
              <section className="panel"><div className="panel-head"><h3>أفضل المطاعم أداءً</h3><Link className="link-button" href="/admin/restaurants">عرض الكل</Link></div>{[['بيت الشاورما', '542 طلبًا', '4.8 ★'], ['مذاق القاهرة', '421 طلبًا', '4.7 ★'], ['سلطة وصحة', '398 طلبًا', '4.6 ★'], ['برجر لاند', '276 طلبًا', '4.5 ★']].map((r) => <div className="restaurant-row" key={r[0]}><div className="restaurant-meta"><span className="food-thumb">♨</span><div><strong>{r[0]}</strong><div className="muted">{r[1]}</div></div></div><span className="status green">{r[2]}</span></div>)}</section>
            </div>

            <div className="bottom-grid">
              <section className="panel"><div className="panel-head"><h3>حالة المنصة</h3></div><div className="activity-row"><span>الطلبات قيد التحضير</span><strong>24</strong></div><div className="activity-row"><span>السائقون المتاحون</span><strong>36</strong></div><div className="activity-row"><span>طلبات تحتاج متابعة</span><strong>3</strong></div></section>
              <section className="panel"><div className="panel-head"><h3>العروض والكوبونات</h3></div><div className="activity-row"><span>WELCOME10</span><span className="status orange">نشط</span></div><div className="activity-row"><span>FREESHIP</span><span className="status green">نشط</span></div><Link className="link-button" href="/admin/promotions">إدارة العروض ←</Link></section>
              <section className="panel"><div className="panel-head"><h3>آخر التحديثات</h3></div><div className="activity-row"><span>مطعم جديد بانتظار التحقق</span><span className="muted">منذ 8 د</span></div><div className="activity-row"><span>تم تسليم الطلب #7853</span><span className="muted">منذ 15 د</span></div></section>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
