import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** يعيد بناء المفتاح الخاص مهما كان شكل اللصق (مسافات، \n حرفية، علامات تنصيص، أسطر مكسورة) */
export function normalizePrivateKey(input: string): string {
  const text = input.trim().replace(/^["']+|["']+$/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  const match = text.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!match) return text;
  const body = match[1].replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

export function readCredentials(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json.trim()) as { project_id?: string; client_email?: string; private_key?: string };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: normalizePrivateKey(parsed.private_key) };
      }
    } catch { /* يستمر إلى المتغيرات المنفصلة */ }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) return null;
  return { projectId, clientEmail: clientEmail.trim(), privateKey: normalizePrivateKey(rawKey) };
}

function firebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const credentials = readCredentials();
  if (!credentials) throw new Error('Firebase Admin environment is not configured');
  return initializeApp({ credential: cert(credentials), projectId: credentials.projectId });
}

export function adminAuth() {
  return getAuth(firebaseApp());
}

export function adminDb() {
  return getFirestore(firebaseApp());
}
