import { getJSON, setJSON, json } from './_store.mjs';
import { requireUser, authError, publicUser } from './_auth.mjs';

export default async (req) => {
  const user = await requireUser(req); if (!user) return authError();
  const key = `profile:${user.accountId}`;
  if (req.method === 'GET') {
    const profile = await getJSON(key, { profilePicture: '' });
    return json({ success: true, user: { ...publicUser(user), profilePicture: profile.profilePicture || '' } });
  }
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const b = await req.json();
    if (b.action !== 'update') return json({ error: 'Invalid action' }, 400);
    user.name = String(b.name || '').trim().slice(0, 150);
    user.phone = String(b.phone || '').trim().slice(0, 40);
    await setJSON(`user:${user.accountId}`, user);
    const profile = await getJSON(key, {});
    if (b.profilePicture !== undefined) {
      const pic = String(b.profilePicture || '');
      if (pic && !pic.startsWith('data:image/')) return json({ error: 'শুধু image profile picture দেওয়া যাবে।' }, 400);
      if (pic.length > 1_900_000) return json({ error: 'Profile picture ছোট করুন।' }, 413);
      profile.profilePicture = pic;
    }
    await setJSON(key, { ...profile, updatedAt: new Date().toISOString() });
    return json({ success: true, message: 'Profile updated.', user: { ...publicUser(user), profilePicture: profile.profilePicture || '' } });
  } catch { return json({ error: 'Profile update failed.' }, 500); }
};
