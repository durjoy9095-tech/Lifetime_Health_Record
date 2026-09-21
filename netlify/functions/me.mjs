import { json } from './_store.mjs';
import { requireUser, publicUser } from './_auth.mjs';
export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
  const user = await requireUser(req);
  if (!user) return json({ authenticated: false }, 200);
  return json({ authenticated: true, user: publicUser(user) });
};
