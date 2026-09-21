import { getStore } from '@netlify/blobs';

// One site-wide persistent store. Netlify supplies the site context automatically
// inside deployed Functions. If explicit Netlify credentials are configured as
// environment variables, they are used as well.
export const STORE = 'lifetime-health-record-v3';
let storeInstance;

export function store() {
  if (!storeInstance) {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN;
    storeInstance = siteID && token
      ? getStore(STORE, { siteID, token })
      : getStore(STORE);
  }
  return storeInstance;
}

export async function getJSON(key, fallback = null) {
  const value = await store().get(key, { type: 'json', consistency: 'strong' });
  return value ?? fallback;
}

export async function setJSON(key, value, options = {}) {
  return store().setJSON(key, value, options);
}

export async function deleteKey(key) {
  return store().delete(key);
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function cookieSerialize(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  parts.push(`Path=${opts.path || '/'}`);
  return parts.join('; ');
}

export function getCookie(event, name) {
  const raw = event.headers?.get?.('cookie') || event.headers?.get?.('Cookie') || event.headers?.cookie || event.headers?.Cookie || '';
  const found = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}
