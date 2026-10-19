'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import AdminSectionLayout from './admin-section-layout';
import AdminMessageCenter from './admin-message-center';
import { OpenStreetMap, zoneShapes } from './osm-admin-map';
import { arrayUnion, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAdminSession } from './admin-session';
import { useLiveData } from '../lib/live-data';
import { ORDER_STATUSES, PAYMENT_STATUSES, PROMO_STATUSES, SECTION_COLLECTION, DEFAULT_SETTINGS, type AdminData, type DemoRow, type Point } from '../lib/admin-types';

const TITLES: Record<string, { title: string; description: string }> = {
  'live-orders': { title: 'الطلبات المباشرة', description: 'تابع الطلبات الجارية ومواقع المطاعم والمندوبين على خريطة القاهرة.' },
  orders: { title: 'إدارة الطلبات', description: 'ابحث عن أي طلب، راجع تفاصيله، وحدث حالته ضمن مراحل العمل المسموحة.' },
  restaurants: { title: 'المطاعم', description: 'إدارة ملفات المطاعم وحالة الحساب واستقبال الطلبات ومؤشرات الأداء.' },
  drivers: { title: 'المندوبون', description: 'تابع الحساب والاتصال والتوافر وآخر ظهور وملف المندوب.' },
  customers: { title: 'العملاء', description: 'ابحث عن العملاء وافتح سجل الطلبات والحساب والعناوين.' },
  payments: { title: 'المدفوعات', description: 'تابع المعاملات المالية بمعزل عن حالة الطلب، وصدّر كشف المعاملات.' },
  promotions: { title: 'العروض والكوبونات', description: 'أنشئ العروض، عدّل قواعدها، وفلتر حسب الحالة والصلاحية.' },
  zones: { title: 'مناطق التوصيل', description: 'ارسم حدود التغطية على خريطة مفتوحة المصدر واضبط رسوم كل منطقة.' },
  support: { title: 'الدعم', description: 'افتح محادثة العميل وأرسل ردًا أو أغلق التذكرة أو صعّدها للإدارة.' },
  notifications: { title: 'الإشعارات', description: 'أرسل إعلانًا داخل التطبيقات أو كإشعار دفع إلى شريط الهاتف.' },
  'app-updates': { title: 'تحديثات التطبيقات', description: 'انشر تحديثًا اختياريًا أو إجباريًا لتطبيق العميل أو المطعم أو السائق.' },
  reports: { title: 'التقارير', description: 'راجع الطلبات المكتملة والملغاة وقيمها حسب فترة محددة.' },
  settings: { title: 'الإعدادات', description: 'إعدادات المنطقة والعملة واللغة وبيانات خدمة العملاء.' },
};

const COLUMNS: Record<string, Array<[string, string]>> = {
  orders: [['order','رقم الطلب'],['customer','العميل'],['restaurant','المطعم'],['driver','المندوب'],['status','الحالة'],['total','الإجمالي'],['date','التاريخ']],
  restaurants: [['id','رقم المطعم'],['name','اسم المطعم'],['address','العنوان'],['accountStatus','الحساب'],['accepting','استقبال الطلبات'],['orders','الطلبات'],['cancelled','ملغاة']],
  drivers: [['id','رقم المندوب'],['uid','المعرّف التعريفي'],['name','المندوب'],['online','الاتصال'],['availability','التوافر'],['lastSeen','آخر ظهور'],['accountStatus','الحساب']],
  customers: [['id','رقم العميل'],['name','العميل'],['email','البريد الإلكتروني'],['phone','الهاتف'],['orders','الطلبات'],['cancelled','ملغاة'],['lastOrder','آخر طلب']],
  payments: [['id','رقم المعاملة'],['order','الطلب'],['customer','العميل'],['restaurant','المطعم'],['method','طريقة الدفع'],['status','حالة الدفع'],['total','المبلغ']],
  promotions: [['code','الكوبون'],['name','اسم العرض'],['type','نوع الخصم'],['value','القيمة'],['uses','الاستخدامات'],['end','ينتهي في'],['status','الحالة']],
  support: [['id','رقم التذكرة'],['customer','مقدم الطلب'],['subject','الموضوع'],['category','القسم'],['status','الحالة'],['updated','آخر تحديث']],
};

const SEARCH_HINT: Record<string, string> = {
  orders: 'ابحث برقم الطلب أو اسم العميل أو المطعم أو المندوب…',
  restaurants: 'ابحث برقم المطعم أو الاسم…',
  drivers: 'ابحث برقم المندوب أو المعرّف أو الهاتف…',
  customers: 'ابحث برقم العميل أو البريد أو الهاتف…',
  payments: 'ابحث برقم المعاملة أو الطلب أو العميل أو المطعم…',
  promotions: 'ابحث باسم العرض أو رمز الكوبون…',
  zones: 'ابحث باسم المنطقة أو المدينة…',
  support: 'ابحث برقم التذكرة أو العميل أو الموضوع…',
};

const STATUS_KEY: Record<string, string> = { orders: 'status', restaurants: 'accountStatus', drivers: 'accountStatus', customers: 'accountStatus', payments: 'status', promotions: 'status', zones: 'status', support: 'status' };
const MONEY = (value: unknown) => `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;
const simple = (value: unknown) => value === null || value === undefined || value === '' ? '—' : Array.isArray(value) ? value.map(String).join('، ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
const flatten = (row: DemoRow) => Object.values(row).map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')).join(' ').toLocaleLowerCase('ar');
const today = new Date().toLocaleDateString('sv-SE');

function StatusPill({ children }: { children: ReactNode }) {
  const value = String(children ?? '');
  const tone = /مكتمل|مدفوع|نشط|مفعّلة|متصل|مفتوح|متاح/.test(value) ? 'green' : /ملغي|موقوف|فشل|منتهي|مقيّد|مغلقة/.test(value) ? 'orange' : /قيد|انتظار|مراجعة|مشغول|مجدول/.test(value) ? 'purple' : '';
  return <span className={`status ${tone}`}>{value}</span>;
}

function SectionHeading({ section, count }: { section: string; count?: number }) {
  const meta = TITLES[section] ?? TITLES.orders;
  return <div className="workspace-heading"><div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="heading-badges">{count !== undefined && <span className="count-chip">{count.toLocaleString('ar-EG')} سجل</span>}</div></div>;
}

export default function AdminWorkspace({ section }: { section: string }) {
  if (section === 'notifications' || section === 'app-updates') {
    return <AdminSectionLayout><main className="section-content workspace-content"><AdminMessageCenter kind={section} /></main></AdminSectionLayout>;
  }
  return <AdminSectionLayout><AdminWorkspaceContent section={section} /></AdminSectionLayout>;
}

const ACCOUNT_ROLE: Record<string, 'customer' | 'restaurant' | 'driver'> = { customers: 'customer', restaurants: 'restaurant', drivers: 'driver' };

function AdminWorkspaceContent({ section }: { section: string }) {
  const { db, token } = useAdminSession();
  const { data, ready, errors } = useLiveData(db);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<DemoRow | null>(null);
  const [modalMode, setModalMode] = useState<'detail' | 'new-promo' | 'new-account'>('detail');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setQuery(''); setStatusFilter(''); setSecondaryFilter(''); setFromDate(''); setToDate('');
  }, [section]);

  const records = data[section] ?? [];
  const statusKey = STATUS_KEY[section];
  const statusOptions = useMemo(() => statusKey ? [...new Set(records.map((row) => String(row[statusKey] ?? '')).filter(Boolean))] : [], [records, statusKey]);
  const secondaryOptions = useMemo(() => {
    const values: Array<[string,string]> = [];
    if (section === 'orders') {
      [...new Set(records.map((row) => String(row.restaurant ?? '')))].filter(Boolean).forEach((value) => values.push([`restaurant:${value}`, `مطعم: ${value}`]));
      [...new Set(records.map((row) => String(row.driver || 'بلا مندوب')))].filter(Boolean).forEach((value) => values.push([`driver:${value}`, `مندوب: ${value}`]));
    } else if (section === 'restaurants') {
      [...new Set(records.map((row) => String(row.accepting ?? '')))].filter(Boolean).forEach((value) => values.push([`accepting:${value}`, `استقبال: ${value}`]));
    } else if (section === 'drivers') {
      [...new Set(records.map((row) => String(row.online ?? '')))].filter(Boolean).forEach((value) => values.push([`online:${value}`, `اتصال: ${value}`]));
      [...new Set(records.map((row) => String(row.availability ?? '')))].filter(Boolean).forEach((value) => values.push([`availability:${value}`, `التوافر: ${value}`]));
    } else if (section === 'payments') {
      [...new Set(records.map((row) => String(row.method ?? '')))].filter(Boolean).forEach((value) => values.push([`method:${value}`, `طريقة: ${value}`]));
    }
    return values;
  }, [records, section]);
  const filtered = useMemo(() => records.filter((row) => {
    if (query.trim() && !flatten(row).includes(query.trim().toLocaleLowerCase('ar'))) return false;
    if (statusFilter && String(row[statusKey ?? 'status'] ?? '') !== statusFilter) return false;
    if (secondaryFilter) { const [key, value] = secondaryFilter.split(':'); if (String(key === 'driver' && !row.driver ? 'بلا مندوب' : row[key] ?? '') !== value) return false; }
    const date = String(row.date ?? row.joined ?? row.updated ?? row.start ?? '');
    if (fromDate && date.slice(0,10) < fromDate) return false;
    if (toDate && date.slice(0,10) > toDate) return false;
    return true;
  }), [records, query, statusFilter, secondaryFilter, statusKey, fromDate, toDate]);

  const setMessage = useCallback((message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 4200); }, []);

  const patchRow = useCallback(async (key: string, id: string, patch: DemoRow) => {
    const source = (data[key] ?? []).find((row) => String(row.id) === id);
    const ref = String(source?._ref ?? id);
    setSelected((current) => current && String(current.id) === id ? { ...current, ...patch } : current);
    try {
      const role = ACCOUNT_ROLE[key];
      if (role && typeof patch.accountStatus === 'string') {
        const { accountStatus, blockReason, ...rest } = patch;
        const response = await fetch('/api/admin/accounts', {
          method: 'PATCH',
          headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ role, uid: ref, accountStatus, blockReason }),
        });
        if (!response.ok) throw new Error((await response.json()).error ?? 'تعذر تحديث الحساب');
        if (Object.keys(rest).length) await updateDoc(doc(db, SECTION_COLLECTION[key], ref), rest);
        return;
      }
      if (key === 'payments') { await updateDoc(doc(db, 'orders', ref), { paymentStatus: patch.status, updated: new Date().toLocaleString('sv-SE').slice(0, 16) }); return; }
      await updateDoc(doc(db, SECTION_COLLECTION[key], ref), patch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ التغيير');
    }
  }, [data, db, token, setMessage]);

  const openDetail = (row: DemoRow) => { setSelected(row); setModalMode('detail'); };

  return <main className="section-content workspace-content">
    <SectionHeading section={section} count={section === 'reports' ? data.orders.length : records.length} />
    {notice && <div className="toast" role="status">{notice}</div>}
    {errors.length > 0 && <div className="message-alert error">تعذر قراءة: {errors.join('، ')}. تأكد من نشر firestore.rules على مشروع Firebase.</div>}
    {!ready && <div className="message-alert warning">جارٍ تحميل البيانات من Firebase…</div>}
    {ACCOUNT_ROLE[section] && <div className="filter-bar"><button className="primary-button" onClick={() => { setSelected(null); setModalMode('new-account'); }}>＋ إنشاء حساب {section === 'restaurants' ? 'مطعم' : section === 'drivers' ? 'سائق' : 'عميل'}</button><span className="muted">يُنشأ حساب الدخول والرقم التعريفي ويُربطان بالتطبيق فورًا.</span></div>}
    {section === 'live-orders' && <LiveOrders orders={data.orders} restaurants={data.restaurants} drivers={data.drivers} openDetail={openDetail} />}
    {section === 'orders' && <GenericTable section={section} rows={filtered} columns={COLUMNS.orders} query={query} setQuery={setQuery} searchHint={SEARCH_HINT.orders} statusOptions={ORDER_STATUSES} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} extra={secondarySelect(secondaryOptions,secondaryFilter,setSecondaryFilter)} />}
    {section === 'restaurants' && <GenericTable section={section} rows={filtered} columns={COLUMNS.restaurants} query={query} setQuery={setQuery} searchHint={SEARCH_HINT.restaurants} statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} extra={secondarySelect(secondaryOptions,secondaryFilter,setSecondaryFilter)} />}
    {section === 'drivers' && <GenericTable section={section} rows={filtered} columns={COLUMNS.drivers} query={query} setQuery={setQuery} searchHint={SEARCH_HINT.drivers} statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} extra={secondarySelect(secondaryOptions,secondaryFilter,setSecondaryFilter)} />}
    {section === 'customers' && <GenericTable section={section} rows={filtered} columns={COLUMNS.customers} query={query} setQuery={setQuery} searchHint={SEARCH_HINT.customers} statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} />}
    {section === 'payments' && <Payments rows={filtered} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} statusOptions={PAYMENT_STATUSES} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} extra={secondarySelect(secondaryOptions,secondaryFilter,setSecondaryFilter)} />}
    {section === 'promotions' && <Promotions rows={filtered} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} statusOptions={PROMO_STATUSES} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} onNew={() => { setSelected(null); setModalMode('new-promo'); }} onToggle={(row) => patchRow('promotions', String(row.id), { status: row.status === 'نشط' ? 'ملغي' : 'نشط' })} />}
    {section === 'zones' && <Zones rows={filtered} allZones={data.zones} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} statusOptions={statusOptions} onSave={async (zone) => { try { await setDoc(doc(db, 'zones', String(zone.id)), { ...zone, updatedAt: serverTimestamp() }); setMessage('تم حفظ المنطقة.'); } catch { setMessage('تعذر حفظ المنطقة (صلاحيات Firestore).'); } }} onToggle={(row) => patchRow('zones', String(row.id), { status: row.status === 'موقوفة' ? 'مفعّلة' : 'موقوفة' })} onDelete={async (row) => { try { await deleteDoc(doc(db, 'zones', String(row._ref ?? row.id))); setMessage('تم حذف المنطقة.'); } catch { setMessage('تعذر حذف المنطقة.'); } }} setMessage={setMessage} />}
    {section === 'support' && <GenericTable section={section} rows={filtered} columns={COLUMNS.support} query={query} setQuery={setQuery} searchHint={SEARCH_HINT.support} statusOptions={['مفتوحة','قيد المعالجة','مكتملة','مصعّدة للإدارة']} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onOpen={openDetail} />}
    {section === 'reports' && <Reports rows={data.orders} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />}
    {section === 'settings' && <Settings row={data.settings[0]} onSave={async (row) => { try { const { _ref, ...clean } = row; await setDoc(doc(db, 'settings', 'platform'), { ...DEFAULT_SETTINGS, ...clean, commissionRate: Number(clean.commissionRate ?? 15), id: 'platform' }, { merge: true }); setMessage('حُفظت الإعدادات.'); } catch { setMessage('تعذر حفظ الإعدادات.'); } }} />}
    {selected && modalMode === 'detail' && <DetailModal section={section} row={selected} allData={data} onClose={() => setSelected(null)} onPatch={(patch) => patchRow(section, String(selected.id), patch)} onReply={(text) => {
      const message = { from: 'الدعم', text, at: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), ts: Date.now() };
      updateDoc(doc(db, 'supportTickets', String(selected._ref ?? selected.id)), { messages: arrayUnion(message), updated: new Date().toLocaleString('sv-SE').slice(0, 16), status: 'قيد المعالجة' })
        .then(() => setSelected((current) => current ? { ...current, messages: [...(Array.isArray(current.messages) ? current.messages : []), message], status: 'قيد المعالجة' } : current))
        .catch(() => setMessage('تعذر إرسال الرد.'));
    }} />}
    {modalMode === 'new-promo' && <PromotionModal onClose={() => setModalMode('detail')} onSave={async (row) => { const id = `PRM-${Date.now().toString(36).toUpperCase()}`; try { await setDoc(doc(db, 'promotions', id), { ...row, id, createdAt: serverTimestamp() }); setModalMode('detail'); setMessage('تمت إضافة العرض.'); } catch { setMessage('تعذر حفظ العرض.'); } }} />}
    {modalMode === 'new-account' && ACCOUNT_ROLE[section] && <CreateAccountModal role={ACCOUNT_ROLE[section]} getToken={token} onClose={() => setModalMode('detail')} onCreated={(publicId) => { setModalMode('detail'); setMessage(`تم إنشاء الحساب بالرقم التعريفي ${publicId}`); }} />}
  </main>;
}

function FilterBar({ query, setQuery, hint, statusOptions, statusFilter, setStatusFilter, fromDate, toDate, setFromDate, setToDate, extra, showDates = true, showSearch = true }: {
  query: string; setQuery: (value: string) => void; hint: string; statusOptions: string[]; statusFilter: string; setStatusFilter: (value: string) => void; fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; extra?: ReactNode; showDates?:boolean; showSearch?:boolean;
}) {
  return <div className="filter-bar">
    {showSearch && <label className="filter-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={hint} /></label>}
    {statusOptions.length > 0 && <select aria-label="فلترة حسب الحالة" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">كل الحالات</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
    {showDates && <><label className="date-filter">من <input aria-label="من تاريخ" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
    <label className="date-filter">إلى <input aria-label="إلى تاريخ" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></>}
    {extra}
  </div>;
}

function secondarySelect(options: Array<[string,string]>, value: string, onChange: (value:string)=>void) {
  if (!options.length) return undefined;
  return <select aria-label="فلترة إضافية" value={value} onChange={event=>onChange(event.target.value)}><option value="">كل الخيارات</option>{options.map(([option,label])=><option key={option} value={option}>{label}</option>)}</select>;
}

function GenericTable({ section, rows, columns, query, setQuery, searchHint, statusOptions, statusFilter, setStatusFilter, fromDate, toDate, setFromDate, setToDate, onOpen, extra }: {
  section: string; rows: DemoRow[]; columns: Array<[string,string]>; query: string; setQuery: (v: string) => void; searchHint: string; statusOptions: string[]; statusFilter: string; setStatusFilter: (v: string) => void; fromDate: string; toDate: string; setFromDate: (v: string) => void; setToDate: (v: string) => void; onOpen: (row: DemoRow) => void; extra?: ReactNode;
}) {
  const titles: Record<string,string> = { orders: 'كل الطلبات', restaurants: 'ملفات المطاعم', drivers: 'حسابات المندوبين', customers: 'حسابات العملاء', support: 'صندوق تذاكر الدعم' };
  return <>
    <div className="workspace-stats">
      <article><span>نتائج مطابقة</span><strong>{rows.length.toLocaleString('ar-EG')}</strong></article>
      <article><span>{section === 'orders' ? 'مكتملة' : section === 'drivers' ? 'متصلون' : 'سجلات نشطة'}</span><strong>{section === 'orders' ? rows.filter((r) => r.status === 'مكتمل').length : section === 'drivers' ? rows.filter((r) => r.online === 'متصل').length : rows.filter((r) => r.accountStatus === 'نشط' || r.status === 'مفتوحة').length}</strong></article>
      <article><span>{section === 'orders' ? 'ملغاة' : section === 'restaurants' ? 'طلبات ملغاة' : section === 'customers' ? 'طلبات ملغاة' : 'تحتاج متابعة'}</span><strong>{section === 'orders' ? rows.filter((r) => r.status === 'ملغي').length : section === 'restaurants' || section === 'customers' ? rows.reduce((n, r) => n + Number(r.cancelled ?? 0), 0) : rows.filter((r) => /انتظار|مفتوحة|مراجعة/.test(String(r.accountStatus ?? r.status ?? ''))).length}</strong></article>
    </div>
    <FilterBar query={query} setQuery={setQuery} hint={searchHint} statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} extra={extra} />
    <section className="panel workspace-table-panel"><div className="panel-head"><h2>{titles[section] ?? 'السجلات'}</h2><span className="status green">اضغط على السجل لفتح الملف</span></div>
      {rows.length ? <div className="table-wrap"><table className="data-table workspace-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}<th>التفاصيل</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} onClick={() => onOpen(row)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(row)} className="clickable-row">{columns.map(([key]) => <td key={key}>{key === 'status' || key === 'accountStatus' || key === 'online' || key === 'accepting' ? <StatusPill>{simple(row[key])}</StatusPill> : key === 'total' || key === 'spent' || key === 'sales' || key === 'payable' || key === 'earnings' ? MONEY(row[key]) : simple(row[key])}</td>)}<td><button className="small-button" onClick={(event) => { event.stopPropagation(); onOpen(row); }}>عرض الملف</button></td></tr>)}</tbody></table></div> : <EmptyState />}
    </section>
  </>;
}

function EmptyState() { return <div className="empty-state"><strong>لا توجد نتائج مطابقة</strong><span>جرّب تغيير كلمات البحث أو الفلاتر.</span></div>; }

function LiveOrders({ orders, restaurants, drivers, openDetail }: { orders: DemoRow[]; restaurants: DemoRow[]; drivers: DemoRow[]; openDetail: (row: DemoRow) => void }) {
  const activeOrders = orders.filter((row) => ['جديد','قيد التأكيد','قيد التحضير','جاهز للاستلام','قيد التوصيل'].includes(String(row.status)));
  const isPoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
  const markers: Array<{ position: Point; title: string; detail: string; tone: string; onSelect?: () => void }> = [
    ...activeOrders.flatMap((order) => isPoint(order.coordinates) ? [{ position: order.coordinates, title: `${order.order} — العميل`, detail: `${order.customer} · ${order.status} · ${MONEY(order.total)}`, tone: '#ff7657', onSelect: () => openDetail(order) }] : []),
    ...restaurants.filter((row) => typeof row.lat === 'number' && typeof row.lng === 'number' && row.accountStatus === 'نشط').map((row) => ({ position: [row.lat as number, row.lng as number] as Point, title: String(row.name), detail: `${row.id} · ${row.accepting}`, tone: '#7755a3' })),
    ...drivers.filter((row) => typeof row.lat === 'number' && typeof row.lng === 'number' && row.online === 'متصل').map((row) => ({ position: [row.lat as number, row.lng as number] as Point, title: String(row.name), detail: `${row.id} · ${row.availability} · آخر ظهور ${row.lastSeen}`, tone: '#27a36f' })),
  ];
  return <>
    <div className="workspace-stats"><article><span>طلبات جارية</span><strong>{activeOrders.length}</strong></article><article><span>بانتظار مندوب</span><strong>{activeOrders.filter((row) => !row.driverId).length}</strong></article><article><span>قيد التوصيل</span><strong>{activeOrders.filter((row) => row.status === 'قيد التوصيل').length}</strong></article><article><span>جاهزة للاستلام</span><strong>{activeOrders.filter((row) => row.status === 'جاهز للاستلام').length}</strong></article></div>
    <div className="map-disclaimer">العلامات تأتي مباشرة من Firestore: عناوين الطلبات، المطاعم المفتوحة، والسائقون المتصلون بحسب آخر موقع أرسله تطبيق السائق.</div>
    <section className="panel live-map-panel"><div className="panel-head"><h2>خريطة الطلبات المباشرة</h2><div className="map-key"><span><i className="dot orange-dot"/> عميل / طلب</span><span><i className="dot purple-dot"/> مطعم</span><span><i className="dot green-dot"/> مندوب</span></div></div><OpenStreetMap markers={markers} zones={[]} zoom={11} /></section>
    <section className="panel workspace-table-panel"><div className="panel-head"><h2>الطلبات التي تحتاج متابعة</h2><span className="status purple">اختر الطلب لعرض تفاصيله</span></div><div className="table-wrap"><table className="data-table workspace-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المطعم</th><th>المندوب</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>{activeOrders.map((row) => <tr key={String(row.id)} className="clickable-row" onClick={() => openDetail(row)}><td>{simple(row.order)}</td><td>{simple(row.customer)}</td><td>{simple(row.restaurant)}</td><td>{row.driver ? simple(row.driver) : <StatusPill>بانتظار مندوب</StatusPill>}</td><td><StatusPill>{simple(row.status)}</StatusPill></td><td>{MONEY(row.total)}</td></tr>)}</tbody></table></div></section>
  </>;
}

function Payments({ rows, query, setQuery, statusFilter, setStatusFilter, statusOptions, fromDate, toDate, setFromDate, setToDate, onOpen, extra }: { rows: DemoRow[]; query: string; setQuery: (v:string)=>void; statusFilter:string; setStatusFilter:(v:string)=>void; statusOptions:string[]; fromDate:string; toDate:string; setFromDate:(v:string)=>void; setToDate:(v:string)=>void; onOpen:(row:DemoRow)=>void; extra?:ReactNode }) {
  const exportCsv = () => {
    const headers = ['رقم المعاملة','رقم الطلب','العميل','المطعم','الإجمالي','رسوم التوصيل','العمولة','صافي المطعم','مستحق المندوب','طريقة الدفع','حالة الدفع','التاريخ'];
    const keys = ['id','order','customer','restaurant','total','deliveryFee','commission','restaurantNet','driverDue','method','status','date'];
    const content = [headers, ...rows.map((row) => keys.map((key) => String(row[key] ?? '')))].map((line) => line.map((cell) => `"${cell.replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff',content],{type:'text/csv;charset=utf-8'})); const a = document.createElement('a'); a.href=url; a.download='payments-egypt.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return <>
    <div className="workspace-stats"><article><span>سجلات مطابقة</span><strong>{rows.length}</strong></article><article><span>مدفوع فعليًا</span><strong>{MONEY(rows.filter(r=>r.status==='مدفوع').reduce((n,r)=>n+Number(r.total),0))}</strong></article><article><span>المبالغ المستردة</span><strong>{MONEY(rows.reduce((n,r)=>n+Number(r.refund),0))}</strong></article></div>
    <FilterBar query={query} setQuery={setQuery} hint="ابحث برقم المعاملة أو الطلب أو العميل أو المطعم…" statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} extra={<>{extra}<button className="primary-button" onClick={exportCsv}>تصدير CSV</button></>} />
    <div className="map-disclaimer">حالة السداد مستقلة عن حالة الطلب. تعديل حالة الدفع يُحفظ على الطلب في Firestore.</div>
    <section className="panel workspace-table-panel"><div className="table-wrap"><table className="data-table workspace-table"><thead><tr>{COLUMNS.payments.map(([key,label])=><th key={key}>{label}</th>)}<th>التفاصيل</th></tr></thead><tbody>{rows.map(row=><tr key={String(row.id)} className="clickable-row" onClick={()=>onOpen(row)}>{COLUMNS.payments.map(([key])=><td key={key}>{key==='status'?<StatusPill>{simple(row[key])}</StatusPill>:key==='total'?MONEY(row.total):simple(row[key])}</td>)}<td><button className="small-button" onClick={(event)=>{event.stopPropagation();onOpen(row);}}>تفاصيل المعاملة</button></td></tr>)}</tbody></table></div></section>
  </>;
}

function Promotions({ rows, query, setQuery, statusFilter, setStatusFilter, statusOptions, fromDate, toDate, setFromDate, setToDate, onOpen, onNew, onToggle }: { rows:DemoRow[]; query:string; setQuery:(v:string)=>void; statusFilter:string; setStatusFilter:(v:string)=>void; statusOptions:string[]; fromDate:string; toDate:string; setFromDate:(v:string)=>void; setToDate:(v:string)=>void; onOpen:(r:DemoRow)=>void; onNew:()=>void; onToggle:(r:DemoRow)=>void }) {
  return <><div className="workspace-stats"><article><span>عروض نشطة</span><strong>{rows.filter(r=>r.status==='نشط').length}</strong></article><article><span>استخدامات</span><strong>{rows.reduce((n,r)=>n+Number(r.uses),0)}</strong></article><article><span>قيمة الخصومات</span><strong>{MONEY(rows.reduce((n,r)=>n+Number(r.value)*Number(r.uses),0))}</strong></article></div>
    <FilterBar query={query} setQuery={setQuery} hint="ابحث باسم العرض أو رمز الكوبون…" statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} extra={<button className="primary-button" onClick={onNew}>＋ إنشاء عرض</button>} />
    <section className="panel workspace-table-panel"><div className="table-wrap"><table className="data-table workspace-table"><thead><tr>{COLUMNS.promotions.map(([key,label])=><th key={key}>{label}</th>)}<th>الإجراء</th></tr></thead><tbody>{rows.map(row=><tr key={String(row.id)} className="clickable-row" onClick={()=>onOpen(row)}>{COLUMNS.promotions.map(([key])=><td key={key}>{key==='status'?<StatusPill>{simple(row[key])}</StatusPill>:simple(row[key])}</td>)}<td><button className="small-button" onClick={(event)=>{event.stopPropagation();onToggle(row);}}>{row.status==='نشط'?'إيقاف':'تفعيل'}</button></td></tr>)}</tbody></table></div></section>
    <p className="map-disclaimer">التحقق من صلاحية الكوبون عند إتمام الطلب يجب تطبيقه في خدمة الطلبات الخادمية، وليس في هذه الواجهة وحدها.</p>
  </>;
}

function PromotionModal({ onClose, onSave }: { onClose:()=>void; onSave:(row:DemoRow)=>void }) {
  const [form,setForm]=useState({code:'',name:'',type:'نسبة مئوية',value:'10',maxDiscount:'50',minOrder:'100',start:today,end:'2026-12-31',limit:'100',perCustomer:'1',targetRestaurants:'كل المطاعم',targetRegions:'القاهرة'});
  const update=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
  const submit=(event:FormEvent)=>{event.preventDefault();if(!form.code.trim()||!form.name.trim())return;onSave({...form,code:form.code.toUpperCase(),value:Number(form.value),maxDiscount:Number(form.maxDiscount),minOrder:Number(form.minOrder),limit:Number(form.limit),perCustomer:Number(form.perCustomer),uses:0,status:form.start>today?'مجدول':'نشط'});};
  return <Modal title="إنشاء عرض أو كوبون" onClose={onClose}><form className="detail-form" onSubmit={submit}><FormInput label="رمز الكوبون" value={form.code} onChange={v=>update('code',v)} required/><FormInput label="اسم العرض" value={form.name} onChange={v=>update('name',v)} required/><label>نوع الخصم<select value={form.type} onChange={e=>update('type',e.target.value)}><option>نسبة مئوية</option><option>قيمة ثابتة</option></select></label><FormInput label="قيمة الخصم" value={form.value} onChange={v=>update('value',v)} type="number"/><FormInput label="الحد الأقصى للخصم (ج.م)" value={form.maxDiscount} onChange={v=>update('maxDiscount',v)} type="number"/><FormInput label="الحد الأدنى للطلب (ج.م)" value={form.minOrder} onChange={v=>update('minOrder',v)} type="number"/><FormInput label="تاريخ البداية" value={form.start} onChange={v=>update('start',v)} type="date"/><FormInput label="تاريخ النهاية" value={form.end} onChange={v=>update('end',v)} type="date"/><FormInput label="حد مرات الاستخدام" value={form.limit} onChange={v=>update('limit',v)} type="number"/><FormInput label="لكل عميل" value={form.perCustomer} onChange={v=>update('perCustomer',v)} type="number"/><FormInput label="مطاعم مستهدفة" value={form.targetRestaurants} onChange={v=>update('targetRestaurants',v)}/><FormInput label="مناطق مستهدفة" value={form.targetRegions} onChange={v=>update('targetRegions',v)}/><div className="modal-actions"><button className="primary-button" type="submit">حفظ العرض</button><button className="secondary-button" type="button" onClick={onClose}>إلغاء</button></div></form></Modal>;
}

function Zones({ rows, allZones, query, setQuery, statusFilter, setStatusFilter, statusOptions, onSave, onToggle, onDelete, setMessage }: { rows:DemoRow[]; allZones:DemoRow[]; query:string; setQuery:(v:string)=>void; statusFilter:string; setStatusFilter:(v:string)=>void; statusOptions:string[]; onSave:(zone:DemoRow)=>Promise<void>; onToggle:(row:DemoRow)=>void; onDelete:(row:DemoRow)=>Promise<void>; setMessage:(s:string)=>void }) {
  const [selectedId,setSelectedId]=useState(''); const [draft,setDraft]=useState<Point[]>([]); const [editing,setEditing]=useState(false); const [name,setName]=useState(''); const [city,setCity]=useState('القاهرة'); const [fee,setFee]=useState('15'); const [minimum,setMinimum]=useState('50'); const [center,setCenter]=useState<Point>([30.0444,31.2357]); const [place,setPlace]=useState(''); const [searching,setSearching]=useState(false);
  const selected=allZones.find(row=>String(row.id)===selectedId);
  const shapes=zoneShapes(allZones);
  const beginNew=()=>{setSelectedId('');setName('');setCity('القاهرة');setFee('15');setMinimum('50');setDraft([]);setEditing(true);};
  const beginEdit=(row:DemoRow)=>{setSelectedId(String(row.id));setName(String(row.name));setCity(String(row.city));setFee(String(row.fee));setMinimum(String(row.minOrder));setDraft(Array.isArray(row.polygon)?row.polygon as Point[]:[]);setEditing(true);};
  const findPlace=async()=>{if(!place.trim())return;setSearching(true);try{const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=eg&q=${encodeURIComponent(place)}`,{headers:{'Accept-Language':'ar'}});if(!response.ok)throw new Error();const result=await response.json();if(!result[0]){setMessage('لم نعثر على الموقع. جرّب اسمًا أو عنوانًا أوضح.');return;}setCenter([Number(result[0].lat),Number(result[0].lon)]);setMessage(`تم العثور على: ${result[0].display_name}`);}catch{setMessage('تعذر البحث عن المكان الآن. يمكنك تحديده بالنقر على الخريطة.');}finally{setSearching(false);}};
  const saveZone=()=>{
    if(!name.trim()||draft.length<3){setMessage('أدخل اسم المنطقة وحدد ثلاث نقاط أو أكثر لإغلاق حدودها.');return;}
    const candidate={id:selectedId||`ZON-${Date.now().toString(36).toUpperCase()}`,name:name.trim(),city:city.trim(),fee:Number(fee),minOrder:Number(minimum),status:'مفعّلة',polygon:draft};
    const others=allZones.filter(row=>String(row.id)!==selectedId&&row.status!=='موقوفة');
    if(others.some(row=>polygonsOverlap(draft,Array.isArray(row.polygon)?row.polygon as Point[]:[]))){setMessage('تتداخل الحدود مع منطقة توصيل مفعّلة. عدّل النقاط لتجنّب تعارض الرسوم.');return;}
    void onSave(candidate);
    setEditing(false);setDraft([]);
  };
  const toggleZone=(row:DemoRow)=>onToggle(row);
  const deleteZone=(row:DemoRow)=>{if(!window.confirm(`حذف منطقة «${row.name}»؟`))return;void onDelete(row);};
  return <>
    <FilterBar query={query} setQuery={setQuery} hint="ابحث باسم المنطقة أو المدينة…" statusOptions={statusOptions} statusFilter={statusFilter} setStatusFilter={setStatusFilter} fromDate="" toDate="" setFromDate={()=>{}} setToDate={()=>{}} showDates={false} extra={<button className="primary-button" onClick={beginNew}>＋ منطقة جديدة</button>} />
    <div className="map-disclaimer">ابحث عن موقع في مصر ثم انقر على الخريطة لإضافة نقاط الحدود. أضف 3 نقاط على الأقل؛ تُرفض الحدود إذا تداخلت مع منطقة مفعّلة أخرى. تعتمد البلاطات على OpenStreetMap.</div>
    <section className="panel zone-map-panel"><div className="panel-head"><h2>{editing?'رسم / تعديل حدود المنطقة':'خريطة مناطق التوصيل'}</h2><span className="status purple">{editing?`${draft.length} نقاط محددة`:'مناطق التوصيل المعرّفة'}</span></div>
      <div className="map-search-row"><input value={place} onChange={e=>setPlace(e.target.value)} onKeyDown={e=>e.key==='Enter'&&findPlace()} placeholder="ابحث عن حي أو عنوان في مصر…"/><button className="secondary-button" onClick={findPlace} disabled={searching}>{searching?'جارٍ البحث…':'بحث على الخريطة'}</button>{editing&&<><button className="secondary-button" onClick={()=>setDraft(points=>points.slice(0,-1))} disabled={!draft.length}>تراجع عن نقطة</button><button className="secondary-button" onClick={()=>setDraft([])} disabled={!draft.length}>مسح الرسم</button></>}</div>
      <OpenStreetMap zones={shapes} draft={editing?draft:[]} center={center} zoom={12} onAddPoint={editing?(point)=>setDraft(current=>[...current,point]):undefined}/>
      {editing&&<div className="zone-form"><FormInput label="اسم المنطقة" value={name} onChange={setName} required/><FormInput label="المدينة" value={city} onChange={setCity}/><FormInput label="رسوم التوصيل (ج.م)" type="number" value={fee} onChange={setFee}/><FormInput label="الحد الأدنى للطلب (ج.م)" type="number" value={minimum} onChange={setMinimum}/><button className="primary-button" onClick={saveZone}>حفظ الحدود والمنطقة</button><button className="secondary-button" onClick={()=>{setEditing(false);setDraft([]);}}>إلغاء</button></div>}
    </section>
    <section className="panel workspace-table-panel"><div className="panel-head"><h2>المناطق المعرفة</h2><span className="muted">{rows.length} منطقة</span></div>{rows.length?<div className="table-wrap"><table className="data-table workspace-table"><thead><tr><th>المعرّف</th><th>المنطقة</th><th>المدينة</th><th>الرسوم</th><th>الحد الأدنى</th><th>الحدود</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>{rows.map(row=><tr key={String(row.id)}><td>{simple(row.id)}</td><td>{simple(row.name)}</td><td>{simple(row.city)}</td><td>{MONEY(row.fee)}</td><td>{MONEY(row.minOrder)}</td><td>{Array.isArray(row.polygon)?`${row.polygon.length} نقاط`:'—'}</td><td><StatusPill>{simple(row.status)}</StatusPill></td><td className="row-actions"><button className="small-button" onClick={()=>beginEdit(row)}>تعديل الحدود</button><button className="small-button" onClick={()=>toggleZone(row)}>{row.status==='موقوفة'?'تفعيل':'إيقاف'}</button><button className="danger-button" onClick={()=>deleteZone(row)}>حذف</button></td></tr>)}</tbody></table></div>:<EmptyState/>}</section>
  </>;
}

function polygonsOverlap(a:Point[],b:Point[]) {
  if(a.length<3||b.length<3)return false;
  const inside=(point:Point,poly:Point[])=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [yi,xi]=poly[i],[yj,xj]=poly[j];if(((xi>point[1])!==(xj>point[1]))&&(point[0]<(yj-yi)*(point[1]-xi)/(xj-xi+Number.EPSILON)+yi))c=!c;}return c;};
  const orient=(p:Point,q:Point,r:Point)=>Math.sign((q[1]-p[1])*(r[0]-q[0])-(q[0]-p[0])*(r[1]-q[1]));
  const intersects=(p1:Point,q1:Point,p2:Point,q2:Point)=>orient(p1,q1,p2)!==orient(p1,q1,q2)&&orient(p2,q2,p1)!==orient(p2,q2,q1);
  if(a.some(point=>inside(point,b))||b.some(point=>inside(point,a)))return true;
  return a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
}

function Reports({ rows, fromDate, toDate, setFromDate, setToDate }: { rows:DemoRow[]; fromDate:string; toDate:string; setFromDate:(v:string)=>void; setToDate:(v:string)=>void }) {
  const selected=rows.filter(row=>{const d=String(row.date??'').slice(0,10);return (!fromDate||d>=fromDate)&&(!toDate||d<=toDate);});
  const completed=selected.filter(row=>row.status==='مكتمل'); const cancelled=selected.filter(row=>row.status==='ملغي');
  const exportReport=()=>{const csv=['نوع الطلب,رقم الطلب,العميل,المطعم,الحالة,القيمة,التاريخ',...selected.filter(row=>['مكتمل','ملغي'].includes(String(row.status))).map(row=>[row.status,row.order,row.customer,row.restaurant,row.status,row.total,row.date].join(','))].join('\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='orders-report-egypt.csv';a.click();URL.revokeObjectURL(url);};
  return <><FilterBar query="" setQuery={()=>{}} hint="تقارير الطلبات المكتملة والملغاة" statusOptions={[]} statusFilter="" setStatusFilter={()=>{}} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} showSearch={false} extra={<button className="primary-button" onClick={exportReport}>تصدير التقرير</button>} />
    <div className="workspace-stats"><article><span>الطلبات المكتملة</span><strong>{completed.length}</strong><small>{MONEY(completed.reduce((n,r)=>n+Number(r.total),0))}</small></article><article><span>الطلبات الملغاة</span><strong>{cancelled.length}</strong><small>{MONEY(cancelled.reduce((n,r)=>n+Number(r.total),0))}</small></article><article><span>نسبة الإلغاء</span><strong>{selected.length?`${Math.round(cancelled.length/selected.length*100)}%`:'0%'}</strong><small>من الطلبات في الفترة</small></article><article><span>إجمالي الطلبات</span><strong>{selected.length}</strong><small>مكتملة وملغاة وحالية</small></article></div>
    <section className="panel workspace-table-panel"><div className="panel-head"><h2>سجل الطلبات المكتملة والملغاة</h2></div><div className="table-wrap"><table className="data-table workspace-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المطعم</th><th>الحالة</th><th>القيمة</th><th>تاريخ الإنشاء</th><th>سبب الإلغاء</th></tr></thead><tbody>{selected.filter(row=>['مكتمل','ملغي'].includes(String(row.status))).map(row=><tr key={String(row.id)}><td>{simple(row.order)}</td><td>{simple(row.customer)}</td><td>{simple(row.restaurant)}</td><td><StatusPill>{simple(row.status)}</StatusPill></td><td>{MONEY(row.total)}</td><td>{simple(row.date)}</td><td>{simple(row.cancelReason)}</td></tr>)}</tbody></table></div></section>
  </>;
}

function Settings({ row, onSave }: { row:DemoRow; onSave:(row:DemoRow)=>void }) {
  const [form,setForm]=useState({...row});
  const change=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));
  return <section className="panel settings-panel"><div className="panel-head"><h2>إعدادات المنصة الإقليمية</h2><span className="status green">محفوظة في Firestore</span></div><div className="settings-grid"><FormInput label="الدولة" value={String(form.country??'')} onChange={v=>change('country',v)}/><FormInput label="العملة" value={String(form.currency??'')} onChange={v=>change('currency',v)}/><FormInput label="المنطقة الزمنية" value={String(form.timezone??'')} onChange={v=>change('timezone',v)}/><FormInput label="لغة لوحة التحكم" value={String(form.language??'')} onChange={v=>change('language',v)}/><FormInput label="هاتف خدمة العملاء" value={String(form.deliveryPhone??'')} onChange={v=>change('deliveryPhone',v)}/><FormInput label="نسبة عمولة المنصة (%)" type="number" value={String(form.commissionRate??15)} onChange={v=>change('commissionRate',v)}/></div><div className="settings-note"><strong>إعداد الخرائط</strong><p>المصدر المفتوح: OpenStreetMap عبر Leaflet. مواقع السائقين والمطاعم والعملاء تأتي من Firestore مباشرة. يُرجى اعتماد مزود بلاطات مناسب للاستخدام الإنتاجي واحترام سياسة الاستخدام والإسناد.</p></div><button className="primary-button" onClick={()=>onSave(form)}>حفظ الإعدادات</button></section>;
}

function DetailModal({ section, row, allData, onClose, onPatch, onReply }: { section:string; row:DemoRow; allData:AdminData; onClose:()=>void; onPatch:(patch:DemoRow)=>void; onReply:(message:string)=>void }) {
  const [reply,setReply]=useState('');
  const [edit,setEdit]=useState(false);
  const relatedOrders=allData.orders.filter(order=>order.customerId===row.id||order.restaurantId===row.id||order.driverId===row.id||order.order===row.order);
  const title=section==='orders'?`تفاصيل الطلب ${simple(row.order)}`:section==='restaurants'?`ملف المطعم — ${simple(row.name)}`:section==='drivers'?`ملف المندوب — ${simple(row.name)}`:section==='customers'?`ملف العميل — ${simple(row.name)}`:section==='payments'?`تفاصيل المعاملة — ${simple(row.id)}`:section==='support'?`محادثة ${simple(row.id)}`:section==='promotions'?`العرض — ${simple(row.code)}`:`تفاصيل ${simple(row.id)}`;
  const fields=Object.entries(row).filter(([key])=>!key.startsWith('_')&&!['polygon','history','messages','coordinates','itemsList','createdAt','updatedAt','fcmToken','publicId','createdBy','customerUid','restaurantUid','driverUid','requesterUid','lat','lng','locationUpdatedAt'].includes(key));
  const allowedNext:Record<string,string[]>={'جديد':['قيد التأكيد','ملغي'],'قيد التأكيد':['قيد التحضير','ملغي'],'قيد التحضير':['جاهز للاستلام','ملغي'],'جاهز للاستلام':['قيد التوصيل','ملغي'],'قيد التوصيل':['مكتمل']};
  const updatePayment=(status:string)=>onPatch({status});
  const inactiveStatuses=['موقوف','مقيّد','بانتظار الموافقة'];
  const isInactive=inactiveStatuses.includes(String(row.accountStatus));
  const toggleAccount=()=>{
    const next=isInactive?'نشط':section==='customers'?'مقيّد':'موقوف';
    const reason=next==='نشط'?'':window.prompt('اكتب سبب الإيقاف / التقييد:');
    if(next!=='نشط'&&!reason?.trim())return;
    onPatch({accountStatus:next,...(section==='drivers'?{blockReason:reason??''}:{})});
  };
  const messages=Array.isArray(row.messages)?row.messages as DemoRow[]:[];
  return <Modal title={title} onClose={onClose} wide>
    {(section==='orders'||section==='restaurants'||section==='drivers'||section==='customers'||section==='payments'||section==='promotions')&&<div className="detail-metrics">{profileMetrics(section,row).map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
    {section==='orders'&&<div className="order-progress"><label>تحديث حالة الطلب<select value={String(row.status)} onChange={e=>onPatch({status:e.target.value,updated:new Date().toLocaleString('ar-EG')})}><option value={String(row.status)}>{String(row.status)} — الحالية</option>{(allowedNext[String(row.status)]??[]).map(status=><option value={status} key={status}>{status}</option>)}</select></label><label>حالة السداد المستقلة<select value={String(row.paymentStatus)} onChange={e=>onPatch({paymentStatus:e.target.value})}>{PAYMENT_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label><div className="notice-inline">تغيير حالة الطلب لا يغيّر حالة الدفع. التحقق المالي الفعلي يجب أن يصدر من مزود الدفع.</div></div>}
    {section==='payments'&&<div className="order-progress"><label>حالة المعاملة<select value={String(row.status)} onChange={e=>updatePayment(e.target.value)}>{PAYMENT_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label><div className="notice-inline">تغيير الحالة هنا يسجل الحالة فقط ولا ينفذ رد أموال أو تسوية فعلية عند مزود الدفع.</div></div>}
    {section==='support'&&<div className="chat-box"><div className="chat-top"><StatusPill>{simple(row.status)}</StatusPill><div className="row-actions"><button className="secondary-button" onClick={()=>onPatch({status:'مكتملة'})}>إغلاق كمكتملة</button><button className="secondary-button" onClick={()=>onPatch({status:'مصعّدة للإدارة'})}>تصعيد للإدارة</button><button className="secondary-button" onClick={()=>onPatch({status:'قيد المعالجة'})}>قيد المعالجة</button></div></div><div className="chat-messages">{messages.map((message,index)=><div className={`chat-message ${message.from==='الدعم'?'from-agent':''}`} key={index}><small>{simple(message.from)} · {simple(message.at)}</small><p>{simple(message.text)}</p></div>)}</div>{row.status!=='مكتملة'&&<form className="chat-reply" onSubmit={event=>{event.preventDefault();if(!reply.trim())return;onReply(reply.trim());setReply('');}}><input value={reply} onChange={event=>setReply(event.target.value)} placeholder="اكتب ردًا للعميل…"/><button className="primary-button" type="submit">إرسال</button></form>}{row.status==='مكتملة'&&<div className="notice-inline">تم إغلاق المحادثة. أعد فتحها بتغيير الحالة إلى «قيد المعالجة» لإرسال رد جديد.</div>}</div>}
    {section==='promotions'&&<div className="modal-actions"><button className="secondary-button" onClick={()=>onPatch({status:row.status==='نشط'?'ملغي':'نشط'})}>{row.status==='نشط'?'إيقاف العرض':'تفعيل العرض'}</button><button className="secondary-button" onClick={()=>setEdit(value=>!value)}>{edit?'إلغاء التعديل':'تعديل العرض'}</button></div>}
    {edit&&section==='promotions'&&<form className="detail-form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const patch=Object.fromEntries(form.entries());onPatch({...patch,value:Number(patch.value),maxDiscount:Number(patch.maxDiscount),minOrder:Number(patch.minOrder),limit:Number(patch.limit),perCustomer:Number(patch.perCustomer)});setEdit(false);}}><FormInput name="name" label="اسم العرض" defaultValue={String(row.name??'')}/><FormInput name="value" label="قيمة الخصم" type="number" defaultValue={String(row.value??0)}/><FormInput name="maxDiscount" label="الحد الأقصى للخصم" type="number" defaultValue={String(row.maxDiscount??0)}/><FormInput name="minOrder" label="الحد الأدنى للطلب" type="number" defaultValue={String(row.minOrder??0)}/><FormInput name="end" label="تاريخ النهاية" type="date" defaultValue={String(row.end??'')}/><FormInput name="limit" label="حد الاستخدام" type="number" defaultValue={String(row.limit??0)}/><FormInput name="perCustomer" label="لكل عميل" type="number" defaultValue={String(row.perCustomer??1)}/><FormInput name="targetRestaurants" label="المطاعم المستهدفة" defaultValue={String(row.targetRestaurants??'')}/><FormInput name="targetRegions" label="المناطق المستهدفة" defaultValue={String(row.targetRegions??'')}/><button className="primary-button" type="submit">حفظ التعديل</button></form>}
    {section==='drivers'&&<div className="modal-actions"><button className="secondary-button" onClick={toggleAccount}>{row.accountStatus==='بانتظار الموافقة'?'الموافقة وتفعيل الحساب':row.accountStatus==='موقوف'?'إلغاء الإيقاف':'إيقاف الحساب'}</button><button className="secondary-button" onClick={()=>onPatch({documents:row.documents==='موثقة'?'بانتظار التجديد':'موثقة'})}>تحديث حالة المستندات</button><button className="secondary-button" onClick={()=>onPatch({availability:row.availability==='متاح'?'غير متاح':'متاح'})}>تبديل التوافر</button></div>}
    {section==='restaurants'&&<div className="modal-actions"><button className="secondary-button" onClick={toggleAccount}>{row.accountStatus==='بانتظار الموافقة'?'الموافقة وتفعيل الحساب':row.accountStatus==='موقوف'?'تفعيل الحساب':'إيقاف الحساب'}</button><button className="secondary-button" onClick={()=>onPatch({accepting:row.accepting==='مفتوح'?'مغلق مؤقتًا':'مفتوح'})}>{row.accepting==='مفتوح'?'إيقاف استقبال الطلبات':'فتح استقبال الطلبات'}</button></div>}
    {section==='customers'&&<div className="modal-actions"><button className="secondary-button" onClick={toggleAccount}>{row.accountStatus==='مقيّد'?'إعادة تفعيل الحساب':'تقييد الحساب'}</button></div>}
    <section className="detail-fields"><h3>{section==='drivers'||section==='restaurants'||section==='customers'?'بيانات الملف':'بيانات السجل'}</h3><div className="detail-grid">{fields.map(([key,value])=><div key={key}><span>{fieldLabel(key)}</span><strong>{key==='total'||key==='spent'||key==='sales'||key==='payable'||key==='earnings'||key==='deliveryFee'||key==='commission'||key==='restaurantNet'||key==='driverDue'||key==='refund'||key==='minOrder'||key==='maxDiscount'?MONEY(value):simple(value)}</strong></div>)}</div></section>
    {section==='orders'&&<><section className="detail-fields"><h3>المنتجات والكميات</h3><p>{simple(row.items)}</p><div className="detail-grid"><div><span>رسوم التوصيل</span><strong>{MONEY(row.deliveryFee)}</strong></div><div><span>طريقة الدفع</span><strong>{simple(row.paymentMethod)}</strong></div><div><span>آخر تحديث</span><strong>{simple(row.updated)}</strong></div>{Boolean(row.cancelReason)&&<div><span>سبب الإلغاء</span><strong>{simple(row.cancelReason)}</strong></div>}</div></section><section className="detail-fields"><h3>سجل تغييرات الحالة</h3><pre className="history-box">{simple(row.history)}</pre></section></>}
    {['restaurants','drivers','customers'].includes(section)&&<section className="detail-fields"><h3>سجل الطلبات المرتبط</h3>{relatedOrders.length?<div className="related-list">{relatedOrders.map(order=><div key={String(order.id)}><strong>{simple(order.order)}</strong><span>{simple(order.date)}</span><StatusPill>{simple(order.status)}</StatusPill><b>{MONEY(order.total)}</b></div>)}</div>:<div className="muted">لا توجد طلبات مرتبطة بعد.</div>}</section>}
    {section==='drivers'&&Boolean(row.blockReason)&&<div className="notice-inline">سبب الإيقاف: {simple(row.blockReason)}</div>}
    {section==='customers'&&<section className="detail-fields"><h3>العناوين والمحادثات</h3><p>العنوان المحفوظ: {simple(row.address)}</p><p>التذاكر المفتوحة: {allData.support.filter(ticket=>ticket.customerId===row.id&&ticket.status!=='مكتملة').length}</p></section>}
    {section==='payments'&&<><section className="detail-fields"><h3>توزيع المعاملة</h3><div className="detail-grid"><div><span>رسوم التوصيل</span><strong>{MONEY(row.deliveryFee)}</strong></div><div><span>عمولة المنصة</span><strong>{MONEY(row.commission)}</strong></div><div><span>صافي المطعم</span><strong>{MONEY(row.restaurantNet)}</strong></div><div><span>مستحق المندوب</span><strong>{MONEY(row.driverDue)}</strong></div><div><span>المبلغ المسترد</span><strong>{MONEY(row.refund)}</strong></div></div></section><section className="detail-fields"><h3>سجل تدقيق العرض</h3><p>لا ينفذ هذا القسم رد مبالغ فعلية؛ سجّل الحالة هنا بعد إتمام الرد عند مزود الدفع.</p></section></>}
  </Modal>;
}

function profileMetrics(section:string,row:DemoRow):Array<[string,string]> {
  if(section==='orders')return [['حالة الطلب',simple(row.status)],['حالة الدفع',simple(row.paymentStatus)],['الإجمالي',MONEY(row.total)],['المطعم',simple(row.restaurant)]];
  if(section==='restaurants')return [['إجمالي الطلبات',simple(row.orders)],['مكتملة',simple(row.completed)],['ملغاة',simple(row.cancelled)],['جارية',simple(row.current)],['المبيعات',MONEY(row.sales)],['مستحق المطعم',MONEY(row.payable)]];
  if(section==='drivers')return [['الحساب',simple(row.accountStatus)],['الاتصال',simple(row.online)],['التوافر',simple(row.availability)],['آخر ظهور',simple(row.lastSeen)],['مكتملة / ملغاة',`${simple(row.completed)} / ${simple(row.cancelled)}`],['الأرباح',MONEY(row.earnings)]];
  if(section==='customers')return [['الحساب',simple(row.accountStatus)],['إجمالي الطلبات',simple(row.orders)],['مكتملة / ملغاة',`${simple(row.completed)} / ${simple(row.cancelled)}`],['آخر طلب',simple(row.lastOrder)],['إجمالي المدفوع',MONEY(row.spent)]];
  if(section==='payments')return [['حالة الدفع',simple(row.status)],['الإجمالي',MONEY(row.total)],['طريقة الدفع',simple(row.method)],['تاريخ المعاملة',simple(row.date)]];
  return [['الحالة',simple(row.status)],['الاستخدامات',simple(row.uses)],['الحد',simple(row.limit)],['قيمة الخصم',simple(row.value)]];
}

function fieldLabel(key:string) { const labels:Record<string,string>={id:'المعرّف',uid:'معرّف الحساب',name:'الاسم',order:'رقم الطلب',customer:'العميل',customerId:'رقم العميل',restaurant:'المطعم',restaurantId:'رقم المطعم',driver:'المندوب',driverId:'رقم المندوب',region:'المنطقة',status:'الحالة',total:'الإجمالي',deliveryFee:'رسوم التوصيل',paymentMethod:'طريقة الدفع',paymentStatus:'حالة الدفع',date:'التاريخ',items:'المنتجات',created:'وقت الإنشاء',updated:'آخر تحديث',cancelReason:'سبب الإلغاء',phone:'رقم الهاتف',email:'البريد الإلكتروني',address:'العنوان',accountStatus:'حالة الحساب',accepting:'استقبال الطلبات',orders:'إجمالي الطلبات',completed:'الطلبات المكتملة',cancelled:'الطلبات الملغاة',current:'الطلبات الجارية',sales:'إجمالي المبيعات',payable:'المستحقات',joined:'تاريخ التسجيل',lastActivity:'آخر نشاط',rating:'التقييم',owner:'اسم المسؤول',online:'الاتصال بالتطبيق',availability:'التوافر للطلبات',lastSeen:'آخر ظهور',location:'آخر موقع معروف',earnings:'إجمالي الأرباح',vehicle:'المركبة',documents:'المستندات والتحقق',blockReason:'سبب الإيقاف',lastOrder:'آخر طلب',spent:'المبالغ المدفوعة',method:'طريقة الدفع',commission:'العمولة',restaurantNet:'صافي المطعم',driverDue:'مستحق المندوب',refund:'المبلغ المسترد',code:'رمز العرض',type:'نوع الخصم',value:'قيمة الخصم',maxDiscount:'الحد الأقصى للخصم',minOrder:'الحد الأدنى للطلب',start:'تاريخ البداية',end:'تاريخ النهاية',uses:'عدد الاستخدامات',limit:'حد الاستخدام',perCustomer:'لكل عميل',targetRestaurants:'المطاعم المستهدفة',targetRegions:'المناطق المستهدفة',city:'المدينة',fee:'رسوم التوصيل',subject:'الموضوع',category:'القسم',country:'الدولة',currency:'العملة',timezone:'المنطقة الزمنية',language:'اللغة',deliveryPhone:'هاتف خدمة العملاء'}; return labels[key]??key; }

function CreateAccountModal({ role, getToken, onClose, onCreated }: { role: 'customer' | 'restaurant' | 'driver'; getToken: () => Promise<string>; onClose: () => void; onCreated: (publicId: string) => void }) {
  const labels = { customer: 'عميل', restaurant: 'مطعم', driver: 'سائق' } as const;
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', address: '', vehicle: '', owner: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const generate = () => set('password', Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join(''));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/accounts', { method: 'POST', headers: { authorization: `Bearer ${await getToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ role, ...form }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'تعذر إنشاء الحساب');
      onCreated(result.publicId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر إنشاء الحساب'); } finally { setBusy(false); }
  };
  return <Modal title={`إنشاء حساب ${labels[role]}`} onClose={onClose}>
    <form className="detail-form" onSubmit={submit}>
      <FormInput label={role === 'restaurant' ? 'اسم المطعم' : 'الاسم الكامل'} value={form.name} onChange={(v) => set('name', v)} required />
      {role === 'restaurant' && <FormInput label="اسم المسؤول" value={form.owner} onChange={(v) => set('owner', v)} />}
      <FormInput label="البريد الإلكتروني (اسم الدخول)" type="email" value={form.email} onChange={(v) => set('email', v)} required />
      <FormInput label="رقم الهاتف" type="tel" value={form.phone} onChange={(v) => set('phone', v)} required />
      <FormInput label={role === 'restaurant' ? 'عنوان المطعم' : 'العنوان'} value={form.address} onChange={(v) => set('address', v)} />
      {role === 'driver' && <FormInput label="المركبة" value={form.vehicle} onChange={(v) => set('vehicle', v)} />}
      <FormInput label="كلمة المرور (8 أحرف على الأقل)" value={form.password} onChange={(v) => set('password', v)} required />
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={generate}>توليد كلمة مرور</button></div>
      {error && <div className="message-alert error">{error}</div>}
      <div className="notice-inline">سلّم البريد وكلمة المرور لصاحب الحساب؛ سيدخل بهما إلى تطبيق {labels[role]}. لن تظهر كلمة المرور مرة أخرى.</div>
      <div className="modal-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button><button className="secondary-button" type="button" onClick={onClose}>إلغاء</button></div>
    </form>
  </Modal>;
}

function FormInput({ label, value, onChange, type='text', required=false, name, defaultValue }: { label:string; value?:string; onChange?:(value:string)=>void; type?:string; required?:boolean; name?:string; defaultValue?:string }) {
  return <label>{label}<input name={name} type={type} value={value} defaultValue={defaultValue} required={required} onChange={onChange?event=>onChange(event.target.value):undefined}/></label>;
}

function Modal({ title, children, onClose, wide=false }: { title:string; children:ReactNode; onClose:()=>void; wide?:boolean }) {
  useEffect(()=>{const close=(event:KeyboardEvent)=>event.key==='Escape'&&onClose();window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose]);
  return <div className="modal-scrim" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section className={`detail-modal ${wide?'wide-modal':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-titlebar"><h2>{title}</h2><button className="close-button" onClick={onClose} aria-label="إغلاق">×</button></div>{children}</section></div>;
}
