import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validAudiences = new Set(['customer', 'restaurant', 'driver']);
const collections = { notification: 'broadcastMessages', appUpdate: 'appUpdates' } as const;
type MessageKind = keyof typeof collections;

async function authorizedAdmin(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token);
  const profile = await adminDb().collection('users').doc(decoded.uid).get();
  const role = profile.data()?.role ?? decoded.role;
  return role === 'admin' ? decoded : null;
}

function getKind(raw: string | null): MessageKind | null {
  return raw === 'notifications' ? 'notification' : raw === 'app-updates' ? 'appUpdate' : null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await authorizedAdmin(request);
    if (!admin) return Response.json({ error: 'يلزم تسجيل الدخول بحساب مدير مخوّل' }, { status: 401 });
    const kind = getKind(request.nextUrl.searchParams.get('kind'));
    if (!kind) return Response.json({ error: 'نوع سجل غير صالح' }, { status: 400 });
    const snapshot = await adminDb().collection(collections[kind]).orderBy('createdAt', 'desc').limit(50).get();
    const items = snapshot.docs.map((document) => {
      const data = document.data();
      return { id: document.id, ...data, createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null };
    });
    return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Admin message history failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'تعذر تحميل سجل الرسائل. تحقق من إعداد Firebase.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await authorizedAdmin(request);
    if (!admin) return Response.json({ error: 'يلزم تسجيل الدخول بحساب مدير مخوّل' }, { status: 401 });

    const body = await request.json() as Record<string, unknown>;
    const kind = body.kind === 'notification' || body.kind === 'appUpdate' ? body.kind : null;
    if (!kind) return Response.json({ error: 'نوع الرسالة غير صالح' }, { status: 400 });
    const title = String(body.title ?? '').trim();
    const description = String(body.description ?? '').trim();
    if (title.length < 2 || title.length > 100) return Response.json({ error: 'العنوان يجب أن يكون بين حرفين و100 حرف' }, { status: 400 });
    if (description.length < 2 || description.length > 2000) return Response.json({ error: 'الوصف يجب ألا يتجاوز 2000 حرف' }, { status: 400 });

    const requestedAudiences: unknown[] = Array.isArray(body.audienceIds) ? body.audienceIds : [];
    const audienceIds = requestedAudiences.length
      ? [...new Set(requestedAudiences.map(String).filter((value) => validAudiences.has(value)))]
      : [];
    if (!audienceIds.length || audienceIds.length !== requestedAudiences.length) {
      return Response.json({ error: 'اختر تطبيقًا واحدًا على الأقل من الجمهور المتاح' }, { status: 400 });
    }

    const rawImage = body.imageUrl == null ? '' : String(body.imageUrl).trim();
    let imageUrl: string | null = null;
    if (rawImage) {
      try {
        const parsed = new URL(rawImage);
        if (parsed.protocol !== 'https:') throw new Error('HTTPS only');
        imageUrl = parsed.toString();
      } catch {
        return Response.json({ error: 'رابط الصورة يجب أن يكون HTTPS عامًا وصالحًا' }, { status: 400 });
      }
    }

    const pushEnabled = kind === 'appUpdate' || body.pushEnabled === true;
    const inAppEnabled = kind === 'appUpdate' || body.inAppEnabled === true;
    if (!pushEnabled && !inAppEnabled) return Response.json({ error: 'اختر عرض الرسالة داخل التطبيق أو إرسالها كإشعار دفع' }, { status: 400 });

    const mandatory = kind === 'appUpdate' && body.mandatory === true;
    const versionName = String(body.versionName ?? '').trim();
    const minBuildNumber = Number(body.minBuildNumber);
    const androidStoreUrl = String(body.androidStoreUrl ?? '').trim();
    const iosStoreUrl = String(body.iosStoreUrl ?? '').trim();
    if (kind === 'appUpdate') {
      if (!versionName || versionName.length > 30 || !Number.isSafeInteger(minBuildNumber) || minBuildNumber < 1) {
        return Response.json({ error: 'أدخل اسم الإصدار ورقم البناء المستهدف بصورة صحيحة' }, { status: 400 });
      }
      if (mandatory && (!validHttpsUrl(androidStoreUrl) || !validHttpsUrl(iosStoreUrl))) {
        return Response.json({ error: 'التحديث الإجباري يحتاج رابط متجر HTTPS صالحًا لكل من Android وiOS' }, { status: 400 });
      }
      if (androidStoreUrl && !validHttpsUrl(androidStoreUrl) || iosStoreUrl && !validHttpsUrl(iosStoreUrl)) {
        return Response.json({ error: 'روابط المتاجر يجب أن تستخدم HTTPS' }, { status: 400 });
      }
    }

    const db = adminDb();
    const collectionName = collections[kind];
    const documentRef = db.collection(collectionName).doc();
    const saved = {
      id: documentRef.id,
      kind,
      title,
      description,
      imageUrl,
      audienceIds,
      published: true,
      inAppEnabled,
      pushEnabled,
      mandatory,
      versionName: kind === 'appUpdate' ? versionName : null,
      minBuildNumber: kind === 'appUpdate' ? minBuildNumber : null,
      androidStoreUrl: kind === 'appUpdate' ? androidStoreUrl || null : null,
      iosStoreUrl: kind === 'appUpdate' ? iosStoreUrl || null : null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: admin.uid,
      pushStatus: pushEnabled ? 'pending' : 'not_requested',
      pushChannels: [],
    };
    await documentRef.set(saved);

    let sent = 0;
    let failed = 0;
    const channels = pushEnabled ? topicsForAudience(audienceIds) : [];
    if (channels.length) {
      const messaging = getMessaging(adminAuth().app);
      const results = await Promise.allSettled(channels.map((topic) => messaging.send({
        topic,
        notification: { title, body: description, ...(imageUrl ? { imageUrl } : {}) },
        data: {
          kind,
          messageId: documentRef.id,
          title,
          description,
          imageUrl: imageUrl ?? '',
          ...(kind === 'appUpdate' ? { mandatory: String(mandatory), versionName, minBuildNumber: String(minBuildNumber) } : {}),
        },
        android: { priority: 'high', notification: { channelId: 'maa_announcements', ...(imageUrl ? { imageUrl } : {}) } },
        apns: { payload: { aps: { sound: 'default', badge: 1, 'mutable-content': 1 } } },
      })));
      for (const result of results) {
        if (result.status === 'fulfilled') sent++;
        else {
          failed++;
          console.error('FCM topic send failed:', result.reason instanceof Error ? result.reason.message : 'unknown error');
        }
      }
      const pushStatus = failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
      await documentRef.update({ pushStatus, pushChannels: channels, pushAttemptedAt: FieldValue.serverTimestamp(), pushSuccessCount: sent, pushFailureCount: failed });
    }

    return Response.json({
      success: true,
      id: documentRef.id,
      push: { attempted: channels.length, sent, failed },
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Admin message send failed:', error instanceof Error ? error.message : 'unknown error');
    if (error instanceof SyntaxError) return Response.json({ error: 'محتوى الطلب غير صالح' }, { status: 400 });
    if (error instanceof Error && error.message.includes('Firebase Admin environment')) {
      return Response.json({ error: 'إعداد Firebase Admin غير مكتمل على Vercel' }, { status: 503 });
    }
    return Response.json({ error: 'تعذر إرسال الرسالة. تحقق من Firebase Authentication وFirestore وFCM.' }, { status: 500 });
  }
}

function validHttpsUrl(value: string) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function topicsForAudience(audienceIds: string[]) {
  if (audienceIds.length === validAudiences.size && [...validAudiences].every((role) => audienceIds.includes(role))) return ['all_apps'];
  return audienceIds.map((role) => `app_${role}`);
}
