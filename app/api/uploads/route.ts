import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { signUpload } from '@/lib/r2';

export const runtime = 'nodejs';

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return Response.json({ error: 'يلزم تسجيل الدخول' }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(token);
    const profile = await adminDb().collection('users').doc(decoded.uid).get();
    const role = profile.data()?.role ?? decoded.role;
    if (!['admin', 'restaurant', 'driver'].includes(String(role))) {
      return Response.json({ error: 'لا تملك صلاحية رفع الملفات' }, { status: 403 });
    }

    const body = await request.json() as { contentType?: string; size?: number; category?: string };
    const contentType = String(body.contentType ?? '');
    const size = Number(body.size ?? 0);
    const category = String(body.category ?? 'images');
    if (!mimeExtensions[contentType]) return Response.json({ error: 'نوع الملف غير مسموح' }, { status: 415 });
    if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024) {
      return Response.json({ error: 'حجم الملف يجب ألا يتجاوز 10 ميغابايت' }, { status: 413 });
    }
    if (!['menu', 'profile', 'documents', 'support', 'broadcast', 'app-updates'].includes(category)) {
      return Response.json({ error: 'تصنيف الملف غير صالح' }, { status: 400 });
    }
    if (category === 'documents' && role !== 'driver' && role !== 'admin') {
      return Response.json({ error: 'رفع المستندات غير مسموح لهذا الدور' }, { status: 403 });
    }

    const key = `${category}/${decoded.uid}/${randomUUID()}.${mimeExtensions[contentType]}`;
    const result = await signUpload(key, contentType, size);
    return Response.json({ ...result, objectKey: key, expiresIn: 120 }, { status: 201 });
  } catch (error) {
    console.error('Upload URL request failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'تعذر إنشاء رابط الرفع' }, { status: 500 });
  }
}
