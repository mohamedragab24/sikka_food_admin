'use client';

import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { firebaseClient } from '../../lib/firebaseClient';

type Status = 'checking' | 'open' | 'closed' | 'error';

export default function RegisterPage() {
  const client = useMemo(() => firebaseClient(), []);
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/bootstrap', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (result.available === true) setStatus('open');
        else if (result.error) { setStatus('error'); setDetail(result.error); }
        else setStatus('closed');
      })
      .catch(() => { setStatus('error'); setDetail('تعذر الاتصال بالخادم'); });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'تعذر إنشاء الحساب');
      if (client) await signInWithEmailAndPassword(client.auth, email.trim(), password);
      window.location.href = '/';
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر إنشاء الحساب');
    } finally { setBusy(false); }
  }

  return (
    <div className="message-shell" style={{ maxWidth: 520, margin: '6vh auto', padding: '0 16px' }}>
      {status === 'checking' && <div className="message-alert warning">جارٍ التحقق…</div>}
      {status === 'error' && (
        <div className="message-login">
          <div className="message-alert error">تعذر التحقق من إعداد الخادم: {detail}</div>
          <p>افتح <a href="/api/health">/api/health</a> لمعرفة المتغير الناقص أو الخاطئ في Vercel، ثم أعد النشر.</p>
          <Link className="secondary-button" href="/">رجوع لتسجيل الدخول</Link>
        </div>
      )}
      {status === 'closed' && (
        <div className="message-login">
          <div className="message-logo">م</div><h2>التسجيل مغلق</h2>
          <p>تم إنشاء الحساب الأول (المالك) مسبقًا. تُنشأ بقية الحسابات من داخل لوحة التحكم.</p>
          <Link className="primary-button" href="/">تسجيل الدخول</Link>
        </div>
      )}
      {status === 'open' && (
        <form className="message-login" onSubmit={submit}>
          <div className="message-logo">م</div><h2>إنشاء حساب</h2>
          <p>هذا أول حساب في المنصة، فيصبح <strong>المالك</strong> ويحصل على جميع الصلاحيات والمناصب (مدير، مطعم، سائق، عميل، دعم). يُغلق التسجيل بعده.</p>
          <label>الاسم<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>كلمة المرور (8 أحرف على الأقل)<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
          {error && <div className="message-alert error">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
          <Link className="secondary-button" href="/">لدي حساب — تسجيل الدخول</Link>
        </form>
      )}
    </div>
  );
}
