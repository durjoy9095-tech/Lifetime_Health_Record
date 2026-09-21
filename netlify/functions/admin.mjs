import { getJSON, setJSON, json, store } from './_store.mjs';
import { requireUser, authError, adminOnly, superOnly, notify, publicUser } from './_auth.mjs';

export default async (req) => {
  const user = await requireUser(req); if (!user) return authError();
  if (!adminOnly(user)) return json({ error: 'Admin permission required.' }, 403);
  try {
    if (req.method === 'GET') {
      const s = await getJSON('system:config', {});
      const url = new URL(req.url);
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const users = [];
      const listed = await store().list({ prefix: 'user:' });
      for (const x of listed.blobs) { const u = await getJSON(x.key, null); if (u) { const pu = publicUser(u); if (!q || [pu.accountId, pu.username, pu.name, pu.email, pu.phone].some(v => String(v || '').toLowerCase().includes(q))) users.push(pu); } }
      return json({ success: true, system: s, users: users.sort((a,b) => a.createdAt.localeCompare(b.createdAt)) });
    }
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    const b = await req.json();
    if (b.action === 'promote') {
      if (!superOnly(user)) return json({ error: 'শুধু Super Admin অন্য user-কে Admin করতে পারবেন।' }, 403);
      const targetId = String(b.accountId || '').trim().toUpperCase();
      const target = await getJSON(`user:${targetId}`, null);
      if (!target) return json({ error: 'Account ID পাওয়া যায়নি।' }, 404);
      if (target.role === 'SUPER_ADMIN') return json({ error: 'Super Admin-কে পরিবর্তন করা যাবে না।' }, 400);
      target.role = 'ADMIN'; target.updatedAt = new Date().toISOString();
      await setJSON(`user:${targetId}`, target);
      await notify(targetId, { type: 'ROLE_CHANGED', title: 'আপনাকে Admin করা হয়েছে', message: 'Super Admin আপনার account-কে Admin role দিয়েছেন।' });
      return json({ success: true, message: 'Account ID অনুযায়ী user-কে Admin করা হয়েছে।' });
    }
    if (b.action === 'demote') {
      if (!superOnly(user)) return json({ error: 'শুধু Super Admin Admin role পরিবর্তন করতে পারবেন।' }, 403);
      const targetId = String(b.accountId || '').trim().toUpperCase();
      const target = await getJSON(`user:${targetId}`, null);
      if (!target || target.role !== 'ADMIN') return json({ error: 'Admin account পাওয়া যায়নি।' }, 404);
      target.role = 'USER'; await setJSON(`user:${targetId}`, target);
      return json({ success: true, message: 'Admin role সরানো হয়েছে।' });
    }
    if (b.action === 'transfer_super') {
      return json({ error: 'Super Admin transfer করা যাবে না। এই website-এ প্রথম global account-ই একমাত্র Super Admin।' }, 403);
    }
    if (b.action === 'notice') {
      const title = String(b.title || '').trim().slice(0, 150); const message = String(b.message || '').trim().slice(0, 3000);
      if (!title || !message) return json({ error: 'Notice title ও message দিন।' }, 400);
      const notices = await getJSON('notices:global', []);
      notices.unshift({ id: `NOTICE-${Date.now()}`, title, message, by: user.accountId, byName: user.name, createdAt: new Date().toISOString() });
      await setJSON('notices:global', notices.slice(0, 100));
      return json({ success: true, message: 'Notice প্রকাশ হয়েছে।' });
    }
    return json({ error: 'Invalid action' }, 400);
  } catch (e) { console.error(e); return json({ error: 'Admin operation failed.' }, 500); }
};
