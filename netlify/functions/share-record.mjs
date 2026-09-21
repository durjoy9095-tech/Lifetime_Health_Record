import crypto from 'node:crypto';
import { getJSON, setJSON, json } from './_store.mjs';
import { requireUser, authError, makeId } from './_auth.mjs';

export default async (req) => {
  const user = await requireUser(req);
  if (!user) return authError();
  try {
    if (req.method === 'POST') {
      const b = await req.json();
      if (b.action === 'create') {
        if (user.accountType !== 'PATIENT') return json({ error: 'শুধু Patient account থেকে patient Share Code তৈরি করা যাবে।' }, 403);
        const token = crypto.randomBytes(18).toString('base64url');
        const code = `SHARE-${token}`;
        const share = { accountId: user.accountId, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000 };
        await setJSON(`share:${code}`, share, { onlyIfNew: true });
        return json({ success: true, code, expiresInMinutes: 30 });
      }
    }
    return json({ error: 'Invalid action' }, 400);
  } catch (e) { return json({ error: 'Share code তৈরি করা যায়নি।' }, 500); }
};
