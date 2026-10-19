import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { rateLimited } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCK = 'bootstrap';

/** هل ما زال إنشاء المدير الأول متاحًا؟ */
export async function GET() {
  try {
    const lock = await adminDb().collection('settings').doc(LOCK).get();
    return Response.json({ available: !lock.exists }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ available: false, error: 'إعداد Firebase Admin غير مكتمل' }, { status: 503 });
  }
}

/**
 * إنشاء الحساب الأول: يصبح المالك (owner) ويحمل كل المناصب.
 * يعمل مرة واحدة فقط؛ بعدها يُغلق هذا المسار ويُنشأ باقي الحسابات من داخل اللوحة.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`bootstrap:${ip}`, 5)) return Response.json({ error: 'محاولات كثيرة. حاول لاحقًا.' }, { status: 429 });

  const db = adminDb();
  const auth = adminAuth();
  const lockRef = db.collection('settings').doc(LOCK);
  let locked = false;
  let uid = '';
  let created = false;
  try {
    const body = await request.json().catch(() => ({})) as { name?: string; email?: string; password?: string };
    // ترقية حساب موجود ومسجّل دخوله حاليًا ليصبح المدير الأول (بدون إنشاء حساب جديد)
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let existing: { uid: string; email: string; name: string } | null = null;
    if (token) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const record = await auth.getUser(decoded.uid);
        existing = { uid: record.uid, email: (record.email ?? '').toLowerCase(), name: record.displayName || record.email || 'المدير' };
      } catch {
        return Response.json({ error: 'جلسة الدخول غير صالحة. سجّل الدخول من جديد.' }, { status: 401 });
      }
    }
    const name = existing?.name ?? (body.name ?? '').trim();
    const email = existing?.email ?? (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (name.length < 2) return Response.json({ error: 'أدخل اسمًا صحيحًا' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'البريد الإلكتروني غير صالح' }, { status: 400 });
    if (!existing && password.length < 8) return Response.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });

    try {
      await lockRef.create({ createdAt: FieldValue.serverTimestamp(), email });
      locked = true;
    } catch {
      return Response.json({ error: 'تم إنشاء الحساب الأول مسبقًا. سجّل الدخول.' }, { status: 409 });
    }

    if (existing) {
      uid = existing.uid;
    } else {
      const user = await auth.createUser({ email, password, displayName: name });
      uid = user.uid;
      created = true;
    }
    const roles = ['admin', 'restaurant', 'driver', 'customer', 'support'];
    await auth.setCustomUserClaims(uid, { role: 'admin', roles, owner: true });
    await db.collection('users').doc(uid).set({
      uid, role: 'admin', roles, owner: true, publicId: 'ADM-0001', name, email,
      accountStatus: 'نشط', createdBy: 'bootstrap', createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ success: true, publicId: 'ADM-0001' }, { status: 201 });
  } catch (error) {
    // تراجع حتى لا يبقى المسار مقفولًا بدون مدير
    if (uid && created) await auth.deleteUser(uid).catch(() => undefined);
    if (locked) await lockRef.delete().catch(() => undefined);
    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') return Response.json({ error: 'هذا البريد مسجل مسبقًا في Firebase' }, { status: 409 });
    console.error('Bootstrap failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'تعذر إنشاء الحساب. تحقق من متغيرات Firebase Admin في Vercel.' }, { status: 500 });
  }
}
