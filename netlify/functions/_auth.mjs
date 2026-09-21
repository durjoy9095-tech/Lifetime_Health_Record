import crypto from 'node:crypto';
import { getJSON, setJSON, store, cookieSerialize, getCookie, json } from './_store.mjs';

const SESSION_TTL = 7 * 24 * 60 * 60;
const COOKIE = 'lhr_session';

// Per-account session signing: no extra session-secret write is needed during login.
// Password changes automatically invalidate existing sessions.
function sessionKey(user) {
  if (!user?.accountId || !user?.passwordHash) throw new Error('Invalid user session data.');
  return crypto.createHash('sha256').update(`LHR-SESSION-V1:${user.accountId}:${user.passwordHash}`).digest();
}

export function normalize(value) { return String(value || '').trim().toLowerCase(); }
export function makeId(prefix = 'ACC') { return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored || '').split(':');
    if (!salt || !expected || expected.length !== 128) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}
async function sign(payload, user) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionKey(user)).update(body).digest('base64url');
  return `${body}.${sig}`;
}
async function verify(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.uid || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const user = await getJSON(`user:${payload.uid}`, null);
    if (!user) return null;
    const expected = crypto.createHmac('sha256', sessionKey(user)).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return payload;
  } catch { return null; }
}

export function publicUser(u) {
  if (!u) return null;
  return { accountId: u.accountId, username: u.username, name: u.name, email: u.email, phone: u.phone, role: u.role, accountType: u.accountType || 'PATIENT', gender: u.gender || '', dob: u.dob || '', createdAt: u.createdAt };
}

export async function sessionResponse(user, extra = {}) {
  const token = await sign({ uid: user.accountId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, user);
  return { ...extra, user: publicUser(user), cookie: cookieSerialize(COOKIE, token, { maxAge: SESSION_TTL }) };
}

export async function requireUser(event) {
  const token = getCookie(event, COOKIE);
  const payload = await verify(token);
  if (!payload?.uid) return null;
  return getJSON(`user:${payload.uid}`, null);
}

export function authError() { return json({ error: 'লগইন প্রয়োজন।' }, 401); }
export function adminOnly(user) { return user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'); }
export function superOnly(user) { return user?.role === 'SUPER_ADMIN'; }

export async function notify(accountId, notification) {
  const key = `notifications:${accountId}`;
  const list = await getJSON(key, []);
  list.unshift({ id: makeId('NOTIF'), createdAt: new Date().toISOString(), read: false, ...notification });
  await setJSON(key, list.slice(0, 200));
}

export async function getSystem() { return getJSON('system:config', null); }
export async function ensureSystem() {
  const s = await getSystem();
  if (s) return s;
  const candidate = { version: 2, superAdminAccountId: null, createdAt: new Date().toISOString() };
  const r = await setJSON('system:config', candidate, { onlyIfNew: true });
  if (r?.modified) return candidate;
  return getSystem();
}

export async function claimSuperAdmin(accountId) {
  const lock = await setJSON('system:superadmin-lock', { accountId, claimedAt: new Date().toISOString() }, { onlyIfNew: true });
  if (!lock?.modified) return false;
  const current = await getSystem();
  await setJSON('system:config', { ...(current || {}), version: 2, superAdminAccountId: accountId, superAdminAssignedAt: new Date().toISOString() });
  return true;
}

export { getJSON, setJSON, store };
