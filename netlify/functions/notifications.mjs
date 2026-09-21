import { getJSON, setJSON, json } from './_store.mjs';
import { requireUser, authError } from './_auth.mjs';
export default async (req) => {
  const user = await requireUser(req); if (!user) return authError();
  if (req.method === 'GET') {
    const notifications = await getJSON(`notifications:${user.accountId}`, []);
    const notices = await getJSON('notices:global', []);
    return json({ success: true, notifications, notices });
  }
  if (req.method === 'POST') {
    const b = await req.json();
    if (b.action === 'read') {
      const list = await getJSON(`notifications:${user.accountId}`, []);
      await setJSON(`notifications:${user.accountId}`, list.map(n => n.id === b.id ? { ...n, read: true } : n));
      return json({ success: true });
    }
  }
  return json({ error: 'Method Not Allowed' }, 405);
};
