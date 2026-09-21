import { getJSON, json } from './_store.mjs';
import { requireUser, authError } from './_auth.mjs';
export default async (req) => {
  const user = await requireUser(req); if (!user) return authError();
  if (!['DOCTOR'].includes(user.accountType) && !['ADMIN','SUPER_ADMIN'].includes(user.role)) return json({ error: 'Doctor Portal শুধু Doctor ও Admin-এর জন্য।' }, 403);
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
  const token = new URL(req.url).searchParams.get('code') || '';
  if (!token.startsWith('SHARE-')) return json({ error: 'Invalid share code.' }, 400);
  const share = await getJSON(`share:${token}`, null);
  if (!share || share.expiresAt < Date.now()) return json({ error: 'Share code expired or invalid.' }, 404);
  const record = await getJSON(`patient:${share.accountId}`, { info: {}, prescriptions: [] });
  const profile = await getJSON(`profile:${share.accountId}`, { profilePicture: '' });
  const sharedRecord = { ...record, profilePicture: profile.profilePicture || '' };
  return json({ success: true, expiresAt: share.expiresAt, record: sharedRecord });
};
