'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import AdminSectionLayout from '../components/admin-section-layout';
import { useAdminSession } from '../components/admin-session';
import { useLiveData } from '../lib/live-data';

const ACTIVE = ['جديد', 'قيد التأكيد', 'قيد التحضير', 'جاهز للاستلام', 'قيد التوصيل'];
const MONEY = (v: number) => `${Math.round(v).toLocaleString('ar-EG')} ج.م`;
const tone = (s: string) => (s === 'مكتمل' ? 'green' : s === 'ملغي' ? 'orange' : 'purple');

export default function DashboardPage() {
  return <AdminSectionLayout><Overview /></AdminSectionLayout>;
}

function Overview() {
  const { db } = useAdminSession();
  const { data, ready, errors } = useLiveData(db);

  const stats = useMemo(() => {
    const paid = data.payments.filter((p) => p.status === 'مدفوع').reduce((n, p) => n + Number(p.total ?? 0), 0);
    return [
      { label: 'عملاء مسجلون', value: data.customers.length.toLocaleString('ar-EG'), icon: '♙', tone: 'icon-red' },
      { label: 'إجمالي المدفوعات', value: MONEY(paid), icon: '▣', tone: 'icon-green' },
      { label: 'إجمالي الطلبات', value: data.orders.length.toLocaleString('ar-EG'), icon: '🛒', tone: 'icon-orange' },
      { label: 'مطاعم نشطة', value: data.restaurants.filter((r) => r.accountStatus === 'نشط').length.toLocaleString('ar-EG'), icon: '♨', tone: 'icon-purple' },
    ];
  }, [data]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return { key: d.toLocaleDateString('sv-SE'), label: d.toLocaleDateString('ar-EG', { weekday: 'long' }), count: 0 };
    });
    data.orders.forEach((o) => { const hit = days.find((d) => String(o.date ?? '').startsWith(d.key)); if (hit) hit.count++; });
    const max = Math.max(1, ...days.map((d) => d.count));
    return days.map((d) => ({ ...d, height: Math.max(4, (d.count / max) * 100) }));
  }, [data.orders]);

  const topRestaurants = useMemo(() => [...data.restaurants].sort((a, b) => Number(b.orders ?? 0) - Number(a.orders ?? 0)).slice(0, 4), [data.restaurants]);
  const active = data.orders.filter((o) => ACTIVE.includes(String(o.status)));
  const pendingAccounts = [...data.restaurants, ...data.drivers].filter((r) => r.accountStatus === 'بانتظار الموافقة');
  const openTickets = data.support.filter((t) => t.status !== 'مكتملة');

  return (
    <section className="content">
      <div className="page-heading"><div><h2>مرحبًا بك</h2><p>ملخص مباشر لحركة المنصة من Firebase.</p></div></div>
      {errors.length > 0 && <div className="message-alert error">تعذر قراءة بعض المجموعات ({errors.join('، ')}). انشر ملف firestore.rules على مشروعك.</div>}
      {!ready && <div className="message-alert warning">جارٍ تحميل البيانات…</div>}
      <div className="stats-grid">{stats.map((s) => <article className="stat-card" key={s.label}><div><div className="stat-label">{s.label}</div><div className="stat-value">{s.value}</div></div><div className={`stat-icon ${s.tone}`}>{s.icon}</div></article>)}</div>

      <div className="dashboard-grid">
        <section className="panel"><div className="panel-head"><h3>الطلبات آخر 7 أيام</h3></div><div className="chart">{week.map((d) => <div className="bar-group" key={d.key}><div className="bar" style={{ height: `${d.height}%` }} title={`${d.count} طلب`} /><span>{d.label}</span></div>)}</div></section>
        <section className="panel"><div className="panel-head"><h3>الطلبات المباشرة الآن</h3><Link className="link-button" href="/admin/live-orders">عرض الخريطة</Link></div><div className="activity-row"><span>طلبات جارية</span><strong>{active.length}</strong></div><div className="activity-row"><span>بانتظار مندوب</span><strong>{active.filter((o) => !o.driverId).length}</strong></div><div className="activity-row"><span>قيد التوصيل</span><strong>{active.filter((o) => o.status === 'قيد التوصيل').length}</strong></div></section>
      </div>

      <div className="dashboard-grid">
        <section className="panel"><div className="panel-head"><h3>أحدث الطلبات</h3><Link className="link-button" href="/admin/orders">عرض الكل</Link></div>
          {data.orders.length === 0 ? <p className="muted">لا توجد طلبات بعد. ستظهر هنا فور أن يطلب العملاء من التطبيق.</p> :
            <div className="table-wrap"><table className="data-table"><thead><tr><th>الرقم</th><th>العميل</th><th>المطعم</th><th>الحالة</th><th>المبلغ</th></tr></thead><tbody>{data.orders.slice(0, 6).map((o) => <tr key={String(o._ref)}><td>{String(o.order)}</td><td>{String(o.customer)}</td><td>{String(o.restaurant)}</td><td><span className={`status ${tone(String(o.status))}`}>{String(o.status)}</span></td><td>{MONEY(Number(o.total ?? 0))}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel"><div className="panel-head"><h3>أفضل المطاعم أداءً</h3><Link className="link-button" href="/admin/restaurants">عرض الكل</Link></div>
          {topRestaurants.length === 0 ? <p className="muted">أضف مطعمًا من قسم المطاعم.</p> : topRestaurants.map((r) => <div className="restaurant-row" key={String(r._ref)}><div className="restaurant-meta"><span className="food-thumb">♨</span><div><strong>{String(r.name)}</strong><div className="muted">{String(r.id)} · {Number(r.orders ?? 0)} طلبًا</div></div></div><span className="status green">{String(r.rating ?? '—')}</span></div>)}
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel"><div className="panel-head"><h3>حالة المنصة</h3></div><div className="activity-row"><span>الطلبات قيد التحضير</span><strong>{data.orders.filter((o) => o.status === 'قيد التحضير').length}</strong></div><div className="activity-row"><span>السائقون المتاحون</span><strong>{data.drivers.filter((d) => d.availability === 'متاح' && d.online === 'متصل').length}</strong></div><div className="activity-row"><span>طلبات تحتاج متابعة</span><strong>{active.filter((o) => !o.driverId && o.status === 'جاهز للاستلام').length}</strong></div></section>
        <section className="panel"><div className="panel-head"><h3>حسابات بانتظار الموافقة</h3></div>{pendingAccounts.length === 0 ? <p className="muted">لا توجد طلبات تسجيل معلّقة.</p> : pendingAccounts.slice(0, 4).map((r) => <div className="activity-row" key={String(r._ref)}><span>{String(r.name)} · {String(r.id)}</span><span className="status purple">بانتظار</span></div>)}<Link className="link-button" href="/admin/restaurants">إدارة الحسابات ←</Link></section>
        <section className="panel"><div className="panel-head"><h3>الدعم</h3></div><div className="activity-row"><span>تذاكر مفتوحة</span><strong>{openTickets.length}</strong></div><Link className="link-button" href="/admin/support">فتح صندوق الدعم ←</Link></section>
      </div>
    </section>
  );
}
