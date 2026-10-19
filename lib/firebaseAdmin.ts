import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function firebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').trim().replace(/^["']|["']$/g, '');
  const privateKey = rawKey.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin environment is not configured');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

export function adminAuth() {
  return getAuth(firebaseApp());
}

export function adminDb() {
  return getFirestore(firebaseApp());
}
