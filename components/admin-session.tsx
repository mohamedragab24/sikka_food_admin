'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { firebaseClient } from '@/lib/firebaseClient';

type Session = { user: User; db: Firestore; token: () => Promise<string>; signOut: () => Promise<void> };
const SessionContext = createContext<Session | null>(null);

export function useAdminSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useAdminSession must be used inside <AdminGate>');
  return session;
}

/** بوابة دخول المدير: لا تظهر أي بيانات قبل تسجيل الدخول بحساب role=admin */
export default function AdminGate({ children }: { children: ReactNode }) {
  const client = useMemo(() => firebaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client) { setReady(true); return; }
    return onAuthStateChanged(client.auth, async (next) => {
      setUser(next);
      setIsAdmin(false);
      if (next) {
        try {
          const claims = (await next.getIdTokenResult()).claims;
          let admin = claims.role === 'admin';
          if (!admin) admin = (await getDoc(doc(client.db, 'users', next.uid))).data()?.role === 'admin';
          setIsAdmin(admin);
        } catch { setIsAdmin(false); }
      }
      setReady(true);
    });
  }, [client]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setBusy(true); setError('');
    try {
      await signInWithEmailAndPassword(client.auth, email.trim(), password);
      setPassword('');
    } catch {
      setError('تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.');
    } finally { setBusy(false); }
  }

  const shell = (content: ReactNode) => <div className="message-shell" style={{ maxWidth: 520, margin: '8vh auto' }}>{content}</div>;

  if (!ready) return shell(<div className="message-alert warning">جارٍ التحقق من جلسة المدير…</div>);
  if (!client) return shell(<div className="message-alert warning">أكمل متغيرات NEXT_PUBLIC_FIREBASE_* في إعدادات Vercel (أو ملف .env.local) لربط لوحة التحكم بـ Firebase.</div>);
  if (!user) return shell(
    <form className="message-login" onSubmit={login}>
      <div className="message-logo">م</div><h2>دخول مدير المنصة</h2>
      <p>تسجيل الدخول عبر Firebase Authentication. يجب أن يكون دور الحساب <code>admin</code>.</p>
      <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <div className="message-alert error">{error}</div>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'جارٍ التحقق…' : 'تسجيل الدخول'}</button>
    </form>,
  );
  if (!isAdmin) return shell(<div className="message-login"><div className="message-alert error">هذا الحساب ({user.email}) ليس مديرًا. أنشئ المدير بالأمر <code>npm run create-admin</code>.</div><button className="secondary-button" onClick={() => signOut(client.auth)}>تسجيل الخروج</button></div>);

  const session: Session = { user, db: client.db, token: () => user.getIdToken(), signOut: () => signOut(client.auth) };
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
