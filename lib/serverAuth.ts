import type { NextRequest } from 'next/server';
import { adminAuth, adminDb } from './firebaseAdmin';

export type AdminCheck = { admin: import('firebase-admin/auth').DecodedIdToken | null; reason: string };

/** يتحقق من أن الطلب من مدير، ويعيد سببًا عربيًا واضحًا عند الرفض */
export async function adminCheck(request: NextRequest): Promise<AdminCheck> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { admin: null, reason: 'لم يصل رمز الدخول. سجّل الخروج ثم ادخل من جديد.' };
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error('verifyIdToken failed:', message);
    if (/not configured|private key|PEM|credential|parse/i.test(message)) {
      return { admin: null, reason: 'إعداد Firebase Admin في Vercel غير صحيح (راجع FIREBASE_PRIVATE_KEY و FIREBASE_CLIENT_EMAIL ثم Redeploy).' };
    }
    return { admin: null, reason: 'رمز الدخول غير صالح أو منتهٍ. سجّل الخروج ثم ادخل من جديد.' };
  }
  if (decoded.role === 'admin') return { admin: decoded, reason: '' };
  try {
    const profile = await adminDb().collection('users').doc(decoded.uid).get();
    if (profile.data()?.role === 'admin') return { admin: decoded, reason: '' };
    return { admin: null, reason: `حسابك ليس مديرًا: وثيقة users/${decoded.uid} يجب أن تحتوي role = admin.` };
  } catch (error) {
    console.error('admin profile read failed:', error instanceof Error ? error.message : 'unknown');
    return { admin: null, reason: 'تعذر قراءة Firestore من الخادم. تحقق من FIREBASE_PRIVATE_KEY وإنشاء قاعدة Firestore.' };
  }
}

export async function requireAdmin(request: NextRequest) {
  return (await adminCheck(request)).admin;
}

/** حدّ بسيط لعدد محاولات التسجيل العام لكل عنوان IP (ذاكرة المثيل فقط) */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > limit;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
