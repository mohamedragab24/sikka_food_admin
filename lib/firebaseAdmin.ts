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

type Credentials = { projectId: string; clientEmail: string; privateKey: string };

/** يستخرج الحقول من نص JSON حتى لو كان مكسورًا (أسطر داخل المفتاح، لصق ناقص...) */
function fromJsonText(text: string): { credentials: Credentials | null; problem: string } {
  try {
    const parsed = JSON.parse(text.trim()) as { project_id?: string; client_email?: string; private_key?: string };
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return { credentials: { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: normalizePrivateKey(parsed.private_key) }, problem: '' };
    }
  } catch { /* نحاول الاستخراج اليدوي */ }
  const pick = (name: string) => text.match(new RegExp(`"${name}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,|\\})`))?.[1]?.trim();
  const projectId = pick('project_id');
  const clientEmail = pick('client_email');
  const privateKey = pick('private_key');
  const missing = [!projectId && 'project_id', !clientEmail && 'client_email', !privateKey && 'private_key'].filter(Boolean);
  if (missing.length) return { credentials: null, problem: `الحقول غير موجودة في النص الملصوق: ${missing.join('، ')} — انسخ الملف كاملًا من { إلى }` };
  return { credentials: { projectId: projectId!, clientEmail: clientEmail!, privateKey: normalizePrivateKey(privateKey!) }, problem: '' };
}

export function credentialsStatus(): { credentials: Credentials | null; problem: string } {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const result = fromJsonText(json);
    if (result.credentials) return result;
    if (!process.env.FIREBASE_PRIVATE_KEY) return result;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) return { credentials: null, problem: 'لا يوجد FIREBASE_SERVICE_ACCOUNT_JSON ولا المتغيرات المنفصلة كاملة' };
  return { credentials: { projectId, clientEmail: clientEmail.trim(), privateKey: normalizePrivateKey(rawKey) }, problem: '' };
}

export function readCredentials(): Credentials | null {
  return credentialsStatus().credentials;
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
