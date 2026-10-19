import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { AccountError, createAccount, ROLE_COLLECTION, STATUS_ACTIVE, validateAccountInput, type AccountRole } from '@/lib/accounts';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deny = () => Response.json({ error: 'يلزم تسجيل الدخول بحساب مدير مخوّل' }, { status: 401 });

/** إنشاء حساب (مطعم / سائق / عميل) من لوحة التحكم — يُفعَّل مباشرة */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return deny();
  try {
    const body = await request.json() as Record<string, string>;
    const role = body.role as AccountRole;
    const input = { role, name: body.name, email: body.email, phone: body.phone, password: body.password, address: body.address, vehicle: body.vehicle, owner: body.owner };
    const problem = validateAccountInput(input);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    const result = await createAccount({ ...input, accountStatus: STATUS_ACTIVE, createdBy: admin.uid } as Parameters<typeof createAccount>[0]);
    return Response.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Admin create account failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'تعذر إنشاء الحساب. تحقق من إعداد Firebase.' }, { status: 500 });
  }
}

/** تغيير حالة الحساب (نشط / موقوف / مقيّد) أو إعادة تعيين كلمة المرور */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return deny();
  try {
    const body = await request.json() as { role?: AccountRole; uid?: string; accountStatus?: string; blockReason?: string; newPassword?: string };
    if (!body.uid || !body.role || !(body.role in ROLE_COLLECTION)) return Response.json({ error: 'بيانات غير مكتملة' }, { status: 400 });
    const db = adminDb();
    if (body.newPassword) {
      if (body.newPassword.length < 8) return Response.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
      await adminAuth().updateUser(body.uid, { password: body.newPassword });
    }
    if (body.accountStatus) {
      const suspended = body.accountStatus === 'موقوف' || body.accountStatus === 'مقيّد';
      await adminAuth().updateUser(body.uid, { disabled: body.accountStatus === 'موقوف' });
      if (suspended) await adminAuth().revokeRefreshTokens(body.uid);
      const patch: Record<string, unknown> = { accountStatus: body.accountStatus, updatedAt: FieldValue.serverTimestamp() };
      if (body.role === 'driver') Object.assign(patch, suspended ? { blockReason: body.blockReason ?? '', online: 'غير متصل', availability: 'غير متاح' } : { blockReason: '' });
      if (body.role === 'restaurant' && suspended) patch.accepting = 'مغلق';
      const batch = db.batch();
      batch.update(db.collection(ROLE_COLLECTION[body.role]).doc(body.uid), patch);
      batch.update(db.collection('users').doc(body.uid), { accountStatus: body.accountStatus });
      await batch.commit();
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error('Admin update account failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'تعذر تحديث الحساب' }, { status: 500 });
  }
}
