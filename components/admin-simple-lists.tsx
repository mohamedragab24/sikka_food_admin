'use client';

import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAdminSession } from './admin-session';

type Row = Record<string, unknown> & { _ref: string };

function useCollection(name: string) {
  const { db } = useAdminSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(collection(db, name), (snap) => {
    const list = snap.docs.map((d) => ({ ...d.data(), _ref: d.id }) as Row);
    list.sort((a, b) => Number((b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0) - Number((a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0));
    setRows(list);
  }, (e) => setError(`${name}: ${e.code}`)), [db, name]);
  return { rows, error };
}

/** يضغط الصورة في المتصفح ويعيدها Base64 (JPEG) أقل من ~300KB */
async function imageToB64(file: File, maxWidth = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    if (data.length * 0.75 < 300 * 1024) return data;
  }
  throw new Error('الصورة كبيرة جدًا. اختر صورة أصغر.');
}

export default function AdminSimpleLists({ kind }: { kind: 'banners' | 'partners' }) {
  return kind === 'banners' ? <Banners /> : <Partners />;
}

function Banners() {
  const { db } = useAdminSession();
  const banners = useCollection('banners');
  const restaurants = useCollection('restaurants');
  const [restaurantUid, setRestaurantUid] = useState('');
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImage(await imageToB64(file)); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر قراءة الصورة'); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const restaurant = restaurants.rows.find((r) => r._ref === restaurantUid);
    if (!restaurant || !image) { setMessage('اختر المطعم وارفع صورة البانر.'); return; }
    setBusy(true);
    try {
      const id = `BNR-${Date.now().toString(36).toUpperCase()}`;
      await setDoc(doc(db, 'banners', id), { id, restaurantUid, restaurantName: restaurant.name, title, imageB64: image, active: true, createdAt: serverTimestamp() });
      setImage(''); setTitle(''); setRestaurantUid(''); setMessage('تمت إضافة البانر.');
    } catch { setMessage('تعذر حفظ البانر (راجع صلاحيات Firestore).'); } finally { setBusy(false); }
  }

  return <>
    <div className="page-heading"><div><h2>البانرات الإعلانية</h2><p>صور تظهر أعلى الصفحة الرئيسية لتطبيق العميل، وعند الضغط عليها يفتح المطعم المرتبط.</p></div></div>
    {banners.error && <div className="message-alert error">{banners.error}</div>}
    {message && <div className="message-alert warning">{message}</div>}
    <section className="panel">
      <form className="detail-form" onSubmit={add}>
        <label>المطعم صاحب البانر<select value={restaurantUid} onChange={(e) => setRestaurantUid(e.target.value)} required>
          <option value="">اختر مطعمًا</option>
          {restaurants.rows.map((r) => <option key={r._ref} value={r._ref}>{String(r.name)} ({String(r.id)})</option>)}
        </select></label>
        <label>عنوان (اختياري)<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>صورة البانر (يفضّل عرض 1000 × ارتفاع 420)<input type="file" accept="image/*" onChange={pick} /></label>
        {image && <img alt="معاينة" src={`data:image/jpeg;base64,${image}`} style={{ maxWidth: '100%', borderRadius: 14 }} />}
        <div className="modal-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إضافة البانر'}</button></div>
      </form>
    </section>
    <section className="panel">
      <div className="panel-head"><h3>البانرات الحالية ({banners.rows.length})</h3></div>
      {banners.rows.length === 0 ? <p className="muted">لا توجد بانرات بعد.</p> : banners.rows.map((b) => (
        <div className="restaurant-row" key={b._ref} style={{ alignItems: 'center', gap: 12 }}>
          <img alt="" src={`data:image/jpeg;base64,${String(b.imageB64 ?? '')}`} style={{ width: 160, height: 70, objectFit: 'cover', borderRadius: 10 }} />
          <div style={{ flex: 1 }}><strong>{String(b.title || b.restaurantName)}</strong><div className="muted">{String(b.restaurantName)}</div></div>
          <button className="secondary-button" onClick={() => updateDoc(doc(db, 'banners', b._ref), { active: b.active === false })}>{b.active === false ? 'تفعيل' : 'إخفاء'}</button>
          <button className="secondary-button" onClick={() => { if (window.confirm('حذف هذا البانر؟')) void deleteDoc(doc(db, 'banners', b._ref)); }}>حذف</button>
        </div>
      ))}
    </section>
  </>;
}

function Partners() {
  const { db } = useAdminSession();
  const requests = useCollection('partnerRequests');
  return <>
    <div className="page-heading"><div><h2>طلبات الشراكة</h2><p>طلبات «انضم كشريك» القادمة من تطبيق العميل. تواصل مع صاحب الطلب ثم أنشئ له حساب مطعم من قسم المطاعم.</p></div></div>
    {requests.error && <div className="message-alert error">{requests.error}</div>}
    <section className="panel">
      {requests.rows.length === 0 ? <p className="muted">لا توجد طلبات شراكة.</p> : (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>اسم المطعم</th><th>المسؤول</th><th>العنوان</th><th>هاتف المقدّم</th><th>الحالة</th><th></th></tr></thead><tbody>
          {requests.rows.map((r) => <tr key={r._ref}>
            <td>{String(r.restaurantName)}</td><td>{String(r.ownerName)}</td><td>{String(r.address)}</td>
            <td>{String(r.requesterPhone ?? '')}<div className="muted">{String(r.requesterId ?? '')}</div></td>
            <td><span className={`status ${r.status === 'تم التواصل' ? 'green' : 'purple'}`}>{String(r.status ?? 'جديد')}</span></td>
            <td>
              <button className="secondary-button" onClick={() => updateDoc(doc(db, 'partnerRequests', r._ref), { status: 'تم التواصل' })}>تم التواصل</button>{' '}
              <button className="secondary-button" onClick={() => { if (window.confirm('حذف الطلب؟')) void deleteDoc(doc(db, 'partnerRequests', r._ref)); }}>حذف</button>
            </td>
          </tr>)}
        </tbody></table></div>)}
    </section>
  </>;
}
