import { getJSON, setJSON, store, json, cookieSerialize } from './_store.mjs';
import { requireUser, authError } from './_auth.mjs';
export default async (req) => {
  const user = await requireUser(req); if (!user) return authError();
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const b = await req.json();
  if (String(b.confirm || '') !== 'DELETE') return json({ error: 'DELETE লিখে confirm করুন।' }, 400);
  if (user.role === 'SUPER_ADMIN') return json({ error: 'Super Admin account self-delete করার আগে অন্য Super Admin assign করতে হবে।' }, 400);
  await store().delete(`user:${user.accountId}`);
  await store().delete(`idx:account:${user.accountId}`);
  await store().delete(`idx:username:${String(user.username).toLowerCase()}`);
  await store().delete(`idx:email:${String(user.email).toLowerCase()}`);
  await store().delete(`profile:${user.accountId}`);
  await store().delete(`patient:${user.accountId}`);
  await store().delete(`friends:${user.accountId}`);
  await store().delete(`notifications:${user.accountId}`);
  // Remove this account from every other user's friend/request lists.
  const listed = await store().list({ prefix: 'friends:' });
  for (const x of listed.blobs) {
    if (x.key === `friends:${user.accountId}`) continue;
    const f = await getJSON(x.key, null);
    if (!f) continue;
    const cleanList = a => (a || []).filter(id => id !== user.accountId);
    f.friends = cleanList(f.friends); f.incoming = cleanList(f.incoming); f.outgoing = cleanList(f.outgoing);
    await setJSON(x.key, f);
  }
  return json({ success: true, message: 'Account deleted.' }, 200, { 'set-cookie': cookieSerialize('lhr_session', '', { maxAge: 0 }) });
};
