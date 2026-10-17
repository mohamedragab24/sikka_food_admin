'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { firebaseClient } from '@/lib/firebaseClient';

type Kind = 'notifications' | 'app-updates';
type Audience = 'customer' | 'restaurant' | 'driver';
type HistoryItem = Record<string, unknown> & { id: string };

const audiences: Array<{ id: Audience; label: string }> = [
  { id: 'customer', label: 'تطبيق العميل' },
  { id: 'restaurant', label: 'تطبيق المطعم' },
  { id: 'driver', label: 'تطبيق السائق' },
];

export default function AdminMessageCenter({ kind }: { kind: Kind }) {
  const client = useMemo(() => firebaseClient(), []);
  const isUpdate = kind === 'app-updates';
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedAudiences, setSelectedAudiences] = useState<Audience[]>(['customer', 'restaurant', 'driver']);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [mandatory, setMandatory] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [minBuildNumber, setMinBuildNumber] = useState('');
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client) { setAuthReady(true); return; }
    return onAuthStateChanged(client.auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, [client]);

  useEffect(() => {
    if (!client || !user) { setHistory([]); return; }
    let cancelled = false;
    user.getIdToken().then((token) => fetch(`/api/admin/messages?kind=${kind}`, { headers: { authorization: `Bearer ${token}` } }))
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? 'تعذر تحميل سجل الرسائل');
        return response.json();
      })
      .then((result) => { if (!cancelled) setHistory(result.items ?? []); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'تعذر تحميل سجل الرسائل'); });
    return () => { cancelled = true; };
  }, [client, user, kind]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(client.auth, email.trim(), password);
      setPassword('');
    } catch {
      setError('تعذر تسجيل الدخول. تأكد من تفعيل Firebase Authentication وصحة حساب المدير.');
    } finally { setLoading(false); }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setError(''); setNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('الأنواع المدعومة: JPG أو PNG أو WebP.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('حجم الصورة الأقصى 10 ميغابايت.'); return; }
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const signed = await fetch('/api/uploads', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size, category: isUpdate ? 'app-updates' : 'broadcast' }),
      });
      const result = await signed.json();
      if (!signed.ok) throw new Error(result.error ?? 'تعذر بدء رفع الصورة');
      if (!result.publicUrl) throw new Error('تم إعداد رابط الرفع، لكن لا يوجد R2_PUBLIC_BASE_URL لعرض الصورة؛ أدخل رابطًا عامًا أو أكمل إعداد Cloudflare.');
      const uploaded = await fetch(result.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!uploaded.ok) throw new Error('فشل رفع الصورة إلى Cloudflare R2.');
      setImageUrl(result.publicUrl);
      setPreviewUrl(result.publicUrl);
      setNotice('تم رفع الصورة إلى Cloudflare R2.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر رفع الصورة.');
    } finally { setUploading(false); event.target.value = ''; }
  }

  function toggleAudience(id: Audience) {
    setSelectedAudiences((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setLoading(true); setError(''); setNotice('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: isUpdate ? 'appUpdate' : 'notification',
          title: title.trim(), description: description.trim(), imageUrl: imageUrl.trim() || null,
          audienceIds: selectedAudiences,
          inAppEnabled: isUpdate || inAppEnabled,
          pushEnabled: isUpdate || pushEnabled,
          mandatory: isUpdate && mandatory,
          versionName: versionName.trim(), minBuildNumber: Number(minBuildNumber),
          androidStoreUrl: androidStoreUrl.trim(), iosStoreUrl: iosStoreUrl.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'تعذر إرسال الرسالة');
      const pushed = result.push?.sent ?? 0;
      const failed = result.push?.failed ?? 0;
      setNotice(failed ? `حُفظت الرسالة. وصل إشعار الدفع إلى ${pushed} قناة وتعذر إرسال ${failed}؛ افحص إعداد FCM.` : isUpdate ? 'تم نشر التحديث في Firestore وإرسال إشعار الدفع إلى التطبيق/التطبيقات المحددة.' : result.push?.attempted ? 'تم حفظ الإشعار وإرساله عبر Firebase Cloud Messaging.' : 'تم حفظ الإشعار في صندوق التطبيق الداخلي.');
      setTitle(''); setDescription(''); setImageUrl(''); setPreviewUrl(''); setVersionName(''); setMinBuildNumber(''); setAndroidStoreUrl(''); setIosStoreUrl('');
      const refreshed = await fetch(`/api/admin/messages?kind=${kind}`, { headers: { authorization: `Bearer ${token}` } });
      if (refreshed.ok) setHistory((await refreshed.json()).items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر إرسال الرسالة.');
    } finally { setLoading(false); }
  }

  const heading = isUpdate ? 'تحديثات التطبيقات' : 'الإشعارات';
  const descriptionText = isUpdate
    ? 'انشر تحديثًا لتطبيق العميل أو المطعم أو السائق. يظهر التحديث داخل التطبيق ويُرسل إشعارًا إلى شريط الهاتف.'
    : 'أنشئ رسالة داخل التطبيق أو أرسل إشعار دفع إلى شريط الهاتف، مع تحديد الجمهور والصورة.';

  if (!authReady) return <div className="message-shell"><header className="message-heading"><h1>{heading}</h1><p>{descriptionText}</p></header><div className="message-alert warning">جارٍ التحقق من جلسة المدير…</div></div>;
  if (!client) return <div className="message-shell"><header className="message-heading"><h1>{heading}</h1><p>{descriptionText}</p></header><div className="message-alert warning">أكمل متغيرات Firebase العامة على Vercel لتفعيل تسجيل دخول المدير. لن تظهر مفاتيح الخادم في المتصفح.</div></div>;
  if (!user) return (
    <div className="message-shell">
      <header className="message-heading"><h1>{heading}</h1><p>{descriptionText}</p></header>
      <form className="message-login" onSubmit={login}>
        <div className="message-logo">م</div><h2>دخول مدير المنصة</h2>
        <p>تسجيل الدخول محمي عبر Firebase Authentication. يجب أن يكون دور الحساب <code>admin</code>.</p>
        <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <div className="message-alert error">{error}</div>}
        <button className="primary-button" type="submit" disabled={loading}>{loading ? 'جارٍ التحقق…' : 'تسجيل الدخول'}</button>
      </form>
    </div>
  );

  return (
    <div className="message-shell">
      <header className="message-heading"><div><h1>{heading}</h1><p>{descriptionText}</p></div><div className="message-user"><span>{user.email}</span><button type="button" className="secondary-button" onClick={() => client.auth.signOut()}>تسجيل الخروج</button></div></header>
      {notice && <div className="message-alert success">{notice}</div>}
      {error && <div className="message-alert error">{error}</div>}
      <div className="message-layout">
        <form className="message-form" onSubmit={submit}>
          <section className="message-panel">
            <h2>{isUpdate ? 'بيانات التحديث' : 'محتوى الإشعار'}</h2>
            <label>عنوان الرسالة<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required placeholder={isUpdate ? 'مثال: تحديث جديد لتطبيق معًا' : 'مثال: عروض نهاية الأسبوع'} /></label>
            <label>الوصف<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} required placeholder={isUpdate ? 'اكتب وصفًا مختصرًا لما يتضمنه الإصدار…' : 'اكتب نص الإشعار الذي سيظهر للمستخدم…'} /></label>
            <label>صورة أو شعار الرسالة<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} disabled={uploading} /></label>
            <div className="upload-help">JPG أو PNG أو WebP، حتى 10 ميغابايت. الرفع إلى Cloudflare R2 يتطلب إعداد مفتاح محدود للحاوية.</div>
            <label>أو أدخل رابط صورة عام<input type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setPreviewUrl(event.target.value); }} placeholder="https://…" /></label>
            {previewUrl && <img className="message-image-preview" src={previewUrl} alt="معاينة صورة الرسالة" />}
          </section>

          <section className="message-panel">
            <h2>الجمهور</h2>
            <div className="audience-options">{audiences.map((item) => <label key={item.id} className="audience-option"><input type="checkbox" checked={selectedAudiences.includes(item.id)} onChange={() => toggleAudience(item.id)} />{item.label}</label>)}</div>
            <button type="button" className="link-button audience-all" onClick={() => setSelectedAudiences(selectedAudiences.length === audiences.length ? [] : audiences.map((item) => item.id))}>{selectedAudiences.length === audiences.length ? 'إلغاء تحديد الكل' : 'إرسال للجميع'}</button>
          </section>

          {isUpdate ? (
            <section className="message-panel">
              <h2>إعداد الإصدار والمتاجر</h2>
              <div className="message-two-columns">
                <label>اسم الإصدار<input value={versionName} onChange={(event) => setVersionName(event.target.value)} required placeholder="مثال: 1.2.0" /></label>
                <label>رقم البناء المستهدف<input type="number" min="1" step="1" value={minBuildNumber} onChange={(event) => setMinBuildNumber(event.target.value)} required placeholder="مثال: 12" /></label>
              </div>
              <label className="check-row"><input type="checkbox" checked={mandatory} onChange={(event) => setMandatory(event.target.checked)} /> تحديث إجباري (يمنع إغلاق نافذة التحديث إلى أن يفتح المتجر)</label>
              <div className="message-two-columns">
                <label>رابط Google Play<input type="url" value={androidStoreUrl} onChange={(event) => setAndroidStoreUrl(event.target.value)} required={mandatory} placeholder="https://play.google.com/store/apps/details?id=…" /></label>
                <label>رابط App Store<input type="url" value={iosStoreUrl} onChange={(event) => setIosStoreUrl(event.target.value)} required={mandatory} placeholder="https://apps.apple.com/app/id…" /></label>
              </div>
              <p className="upload-help">رقم البناء يجب أن يكون أحدث من النسخة المنشورة. لكل تطبيق معرّف متجر مستقل؛ حدّث الروابط قبل الإرسال الإجباري.</p>
            </section>
          ) : (
            <section className="message-panel">
              <h2>أماكن الظهور</h2>
              <label className="check-row"><input type="checkbox" checked={inAppEnabled} onChange={(event) => setInAppEnabled(event.target.checked)} /> حفظ الإشعار داخل صندوق الإشعارات في التطبيق</label>
              <label className="check-row"><input type="checkbox" checked={pushEnabled} onChange={(event) => setPushEnabled(event.target.checked)} /> إرسال إشعار دفع إلى شريط الهاتف</label>
            </section>
          )}
          <button className="primary-button message-submit" type="submit" disabled={loading || uploading || selectedAudiences.length === 0 || (!isUpdate && !inAppEnabled && !pushEnabled)}>{uploading ? 'جارٍ رفع الصورة…' : loading ? 'جارٍ الإرسال…' : isUpdate ? 'نشر التحديث وإرسال الإشعار' : 'إرسال الإشعار'}</button>
        </form>

        <section className="message-panel message-history">
          <div className="message-history-heading"><h2>آخر الرسائل المرسلة</h2><span className="count-chip">{history.length}</span></div>
          {history.length === 0 ? <p className="muted">لا توجد رسائل مسجلة حتى الآن.</p> : history.map((item) => <article className="history-item" key={item.id}>
            <div className="history-item-top"><strong>{String(item.title ?? 'رسالة')}</strong><span className={`status ${item.pushStatus === 'sent' ? 'green' : item.pushStatus === 'failed' ? 'orange' : 'purple'}`}>{item.pushStatus === 'sent' ? 'أُرسل الدفع' : item.pushStatus === 'failed' ? 'تعذر الدفع' : 'داخل التطبيق'}</span></div>
            <p>{String(item.description ?? '')}</p>
            <small>{Array.isArray(item.audienceIds) ? (item.audienceIds as string[]).map((id) => audiences.find((a) => a.id === id)?.label ?? id).join('، ') : ''} · {String(item.versionName ?? item.kind ?? '')}</small>
          </article>)}
        </section>
      </div>
    </div>
  );
}
