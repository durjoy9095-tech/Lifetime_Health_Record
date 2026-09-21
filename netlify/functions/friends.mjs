import { getJSON, setJSON, json, store } from './_store.mjs';
import { requireUser, authError, notify } from './_auth.mjs';

const blank = { friends: [], incoming: [], outgoing: [] };
const pub = u => u && ({ accountId: u.accountId, username: u.username, name: u.name, email: u.email, phone: u.phone, profilePicture: u.profilePicture || '' });

async function searchUsers(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  const listed = await store().list({ prefix: 'user:' });
  for (const x of listed.blobs) {
    const u = await getJSON(x.key, null);
    if (!u) continue;
    if (u.username.toLowerCase().includes(needle)) out.push(pub(u));
    if (out.length >= 20) break;
  }
  return out;
}

export default async (req) => {
  const user = await requireUser(req);
  if (!user) return authError();
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (q) return json({ success: true, results: await searchUsers(q) });
      const f = await getJSON(`friends:${user.accountId}`, blank);
      const friends = [];
      for (const id of f.friends || []) { const u = await getJSON(`user:${id}`, null); if (u) friends.push(pub(u)); }
      const incoming = [];
      for (const id of f.incoming || []) { const u = await getJSON(`user:${id}`, null); if (u) incoming.push(pub(u)); }
      const outgoing = [];
      for (const id of f.outgoing || []) { const u = await getJSON(`user:${id}`, null); if (u) outgoing.push(pub(u)); }
      return json({ success: true, friends, incoming, outgoing });
    }
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    const b = await req.json();
    const targetId = String(b.targetAccountId || '').trim().toUpperCase();
    if (!/^ACC-[A-Z0-9]+$/.test(targetId)) return json({ error: 'সঠিক Account ID দিন।' }, 400);
    if (targetId === user.accountId) return json({ error: 'নিজেকে friend করা যাবে না।' }, 400);
    const target = await getJSON(`user:${targetId}`, null);
    if (!target) return json({ error: 'Account ID পাওয়া যায়নি।' }, 404);
    const mine = await getJSON(`friends:${user.accountId}`, blank);
    const theirs = await getJSON(`friends:${targetId}`, blank);
    const action = b.action || 'send';
    if (action === 'send') {
      if (mine.friends.includes(targetId)) return json({ error: 'ইতোমধ্যে friend।' }, 409);
      if (mine.outgoing.includes(targetId) || theirs.incoming.includes(user.accountId)) return json({ error: 'Friend request ইতোমধ্যে পাঠানো হয়েছে।' }, 409);
      mine.outgoing = [...new Set([...mine.outgoing, targetId])];
      theirs.incoming = [...new Set([...theirs.incoming, user.accountId])];
      await setJSON(`friends:${user.accountId}`, mine); await setJSON(`friends:${targetId}`, theirs);
      await notify(targetId, { type: 'FRIEND_REQUEST', title: 'নতুন Friend Request', message: `${user.name || user.username} আপনাকে friend request পাঠিয়েছেন।`, fromAccountId: user.accountId });
      return json({ success: true, message: 'Friend request পাঠানো হয়েছে।' });
    }
    if (action === 'respond') {
      const response = String(b.response || '');
      if (!['accept', 'reject'].includes(response)) return json({ error: 'Invalid response' }, 400);
      if (!mine.incoming.includes(targetId)) return json({ error: 'এই request পাওয়া যায়নি।' }, 404);
      mine.incoming = mine.incoming.filter(x => x !== targetId);
      theirs.outgoing = theirs.outgoing.filter(x => x !== user.accountId);
      if (response === 'accept') {
        mine.friends = [...new Set([...mine.friends, targetId])];
        theirs.friends = [...new Set([...theirs.friends, user.accountId])];
        await notify(targetId, { type: 'FRIEND_ACCEPTED', title: 'Friend Request Accepted', message: `${user.name || user.username} আপনার request গ্রহণ করেছেন।`, fromAccountId: user.accountId });
      }
      await setJSON(`friends:${user.accountId}`, mine); await setJSON(`friends:${targetId}`, theirs);
      return json({ success: true, message: response === 'accept' ? 'Friend request গ্রহণ করা হয়েছে।' : 'Friend request প্রত্যাখ্যান করা হয়েছে।' });
    }
    return json({ error: 'Invalid action' }, 400);
  } catch (e) { console.error(e); return json({ error: 'Friend operation failed.' }, 500); }
};
