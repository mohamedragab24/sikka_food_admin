import type { NextRequest } from 'next/server';
import { adminAuth, adminDb } from './firebaseAdmin';

export async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const profile = await adminDb().collection('users').doc(decoded.uid).get();
    return profile.data()?.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
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
