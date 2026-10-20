import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebaseAdmin';

export type AccountRole = 'customer' | 'restaurant' | 'driver';

export const ROLE_PREFIX: Record<AccountRole, string> = { customer: 'CUS', restaurant: 'RES', driver: 'DRV' };
export const ROLE_COLLECTION: Record<AccountRole, string> = { customer: 'customers', restaurant: 'restaurants', driver: 'drivers' };

export const STATUS_ACTIVE = 'نشط';
export const STATUS_PENDING = 'بانتظار الموافقة';

export type CreateAccountInput = {
  role: AccountRole;
  name: string;
  email: string;
  phone: string;
  password: string;
  address?: string;
  vehicle?: string;
  owner?: string;
  governorate?: string;
  area?: string;
  accountStatus: string;
  createdBy: string; // 'self' أو uid المدير
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAccountInput(input: Partial<CreateAccountInput>): string | null {
  if (!input.role || !(input.role in ROLE_PREFIX)) return 'نوع الحساب غير صالح';
  if (!input.name || input.name.trim().length < 2) return 'أدخل اسمًا صحيحًا';
  if (!input.email || !EMAIL_RE.test(input.email.trim())) return 'البريد الإلكتروني غير صالح';
  if (!input.phone || input.phone.replace(/\D/g, '').length < 8) return 'أدخل رقم هاتف صحيحًا';
  if (!input.password || input.password.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف';
  if (input.role !== 'customer') {
    if (!input.governorate?.trim()) return 'اختر المحافظة';
    if (!input.area?.trim()) return 'أدخل المنطقة';
  }
  return null;
}

/** يولّد رقمًا تعريفيًا متسلسلًا مثل RES-0001 داخل معاملة آمنة */
export async function nextPublicId(role: AccountRole): Promise<string> {
  const db = adminDb();
  const ref = db.collection('counters').doc(`public_${role}`);
  const value = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.value as number | undefined) ?? 0) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
  return `${ROLE_PREFIX[role]}-${String(value).padStart(4, '0')}`;
}

export function nowLabel() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' }).slice(0, 16);
}

/**
 * ينشئ حسابًا كاملًا ومترابطًا:
 *  Firebase Auth  ←→  users/{uid}  ←→  customers|restaurants|drivers/{uid}
 * وكلها تشترك في الرقم التعريفي publicId (CUS-/RES-/DRV-) ليُعرف الحساب في كل الخدمات.
 */
export async function createAccount(input: CreateAccountInput) {
  const email = input.email.trim().toLowerCase();
  const auth = adminAuth();
  const db = adminDb();

  let user;
  try {
    user = await auth.createUser({ email, password: input.password, displayName: input.name.trim(), phoneNumber: undefined, disabled: false });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') throw new AccountError('هذا البريد الإلكتروني مسجل مسبقًا', 409);
    throw error;
  }

  try {
    const publicId = await nextPublicId(input.role);
    await auth.setCustomUserClaims(user.uid, { role: input.role, publicId });

    const common = {
      uid: user.uid,
      id: publicId,
      publicId,
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      address: input.address?.trim() ?? '',
      governorate: input.governorate?.trim() ?? '',
      area: input.area?.trim() ?? '',
      accountStatus: input.accountStatus,
      joined: nowLabel().slice(0, 10),
      createdBy: input.createdBy,
      createdAt: FieldValue.serverTimestamp(),
      orders: 0, completed: 0, cancelled: 0, current: 0,
    };

    const batch = db.batch();
    batch.set(db.collection('users').doc(user.uid), {
      uid: user.uid, role: input.role, publicId, name: common.name, email, phone: common.phone,
      address: common.address, accountStatus: input.accountStatus, createdBy: input.createdBy, createdAt: FieldValue.serverTimestamp(),
    });

    const profile: Record<string, unknown> = { ...common };
    if (input.role === 'customer') Object.assign(profile, { spent: 0, lastOrder: '' });
    if (input.role === 'restaurant') Object.assign(profile, {
      owner: input.owner?.trim() || common.name, accepting: 'مغلق', sales: 0, payable: 0, rating: '—',
      lastActivity: '', deliveryFee: 15, minOrder: 0, prepTime: '25–35 دقيقة', cuisine: '', description: '', lat: null, lng: null, logoB64: '',
    });
    if (input.role === 'driver') Object.assign(profile, {
      online: 'غير متصل', availability: 'غير متاح', lastSeen: 'لم يظهر بعد', location: '', earnings: 0,
      vehicle: input.vehicle?.trim() ?? '', documents: 'قيد المراجعة', blockReason: '', lat: null, lng: null,
    });
    batch.set(db.collection(ROLE_COLLECTION[input.role]).doc(user.uid), profile);
    await batch.commit();

    return { uid: user.uid, publicId, role: input.role, accountStatus: input.accountStatus };
  } catch (error) {
    // تراجع كامل: لا نترك حساب Auth بلا ملف
    await auth.deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}

export class AccountError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
