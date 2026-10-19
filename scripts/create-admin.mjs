// تشغيل: node --env-file=.env.local scripts/create-admin.mjs admin@example.com "كلمة-مرور-قوية" "اسم المدير"
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const [email, password, name = 'مدير المنصة'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('الاستخدام: node --env-file=.env.local scripts/create-admin.mjs <email> <password(8+)> [name]');
  process.exit(1);
}
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const auth = getAuth(app);
const db = getFirestore(app);
let user;
try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password }); }
catch { user = await auth.createUser({ email, password, displayName: name }); }
await auth.setCustomUserClaims(user.uid, { role: 'admin' });
await db.collection('users').doc(user.uid).set({
  uid: user.uid, role: 'admin', publicId: 'ADM-0001', name, email, accountStatus: 'نشط', createdAt: FieldValue.serverTimestamp(),
}, { merge: true });
console.log(`تم إنشاء/تحديث المدير ${email} (uid: ${user.uid})`);
process.exit(0);
