import { getJSON, setJSON, json, STORE } from './_store.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const key = 'system:health-check';
    const stamp = new Date().toISOString();
    await setJSON(key, { stamp }, {});
    const saved = await getJSON(key, null);
    return json({ ok: true, blobs: !!saved, store: STORE, time: saved?.stamp || stamp });
  } catch (err) {
    console.error('Blobs health check failed:', err);
    return json({
      ok: false,
      blobs: false,
      error: 'Netlify Blobs connection failed.',
      detail: String(err?.message || err),
    }, 500);
  }
};
