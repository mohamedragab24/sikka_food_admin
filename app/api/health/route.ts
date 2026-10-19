import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فحص إعداد الخادم دون كشف أي أسرار: يبيّن ما الناقص أو الخاطئ */
export async function GET() {
  const env = {
    FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
    FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    NEXT_PUBLIC_FIREBASE_API_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    NEXT_PUBLIC_FIREBASE_APP_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
  const result: Record<string, unknown> = { env, auth: 'غير مفحوص', firestore: 'غير مفحوص', hasAdmin: null };
  try {
    await adminAuth().listUsers(1);
    result.auth = 'يعمل';
  } catch (error) {
    result.auth = `فشل: ${(error as { code?: string }).code ?? 'خطأ في المفتاح/الصلاحيات'}`;
  }
  try {
    const lock = await adminDb().collection('settings').doc('bootstrap').get();
    result.firestore = 'يعمل';
    result.hasAdmin = lock.exists;
  } catch (error) {
    result.firestore = `فشل: ${(error as { code?: string | number }).code ?? 'أنشئ قاعدة Firestore أو راجع المفتاح'}`;
  }
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
