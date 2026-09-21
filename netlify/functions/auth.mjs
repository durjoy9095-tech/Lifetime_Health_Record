import crypto from 'node:crypto';
import { getJSON, setJSON, json, cookieSerialize } from './_store.mjs';
import { normalize, makeId, hashPassword, verifyPassword, publicUser, sessionResponse, ensureSystem, claimSuperAdmin } from './_auth.mjs';

const MIN_PASSWORD = 8;
const clean = s => String(s || '').trim();

async function reserveIndex(kind, value, accountId) {
  if (!value) return true;
  const r = await setJSON(`idx:${kind}:${normalize(value)}`, { accountId }, { onlyIfNew: true });
  return !!r?.modified;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body.action;

  try {
    if (action === 'register') {
      const username = clean(body.username);
      const name = clean(body.name);
      const email = normalize(body.email);
      const phone = clean(body.phone).replace(/[^0-9+]/g, '');
      const password = String(body.password || '');
      if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: 'Username অবশ্যই ৩–২০ অক্ষরের হতে হবে এবং শুধু ছোট হাতের a-z, 0-9 ও _ ব্যবহার করা যাবে।' }, 400);
      if (!name || !email || !phone) return json({ error: 'সব তথ্য পূরণ করুন।' }, 400);
      const accountType = String(body.accountType || 'PATIENT').toUpperCase();
      if (!['PATIENT','DOCTOR'].includes(accountType)) return json({ error: 'সঠিক account type নির্বাচন করুন।' }, 400);
      const gender = String(body.gender || '').toUpperCase();
      if (accountType === 'PATIENT' && !['MALE','FEMALE'].includes(gender)) return json({ error: 'Patient registration-এর সময় Male বা Female নির্বাচন করুন।' }, 400);
      if (password.length < MIN_PASSWORD) return json({ error: `পাসওয়ার্ড কমপক্ষে ${MIN_PASSWORD} অক্ষরের হতে হবে।` }, 400);
      const dob = clean(body.dob);
      if (accountType === 'DOCTOR') {
        const doctorPhone = clean(body.phone).replace(/[^0-9+]/g, '');
        const doctorEmail = normalize(body.email);
        const workplaceName = clean(body.workplaceName);
        const degrees = Array.isArray(body.degrees) ? body.degrees.map(x => clean(x)).filter(Boolean).slice(0, 30) : [];
        if (!dob || !doctorPhone || !doctorEmail || !workplaceName || !degrees.length) return json({ error: 'Doctor registration-এর Date of Birth, Workplace, Number, Gmail ID ও অন্তত একটি Degree বাধ্যতামূলক।' }, 400);
      }

      const accountId = makeId('ACC');
      const recoveryCode = crypto.randomBytes(6).toString('hex').toUpperCase();
      const indexes = [
        ['username', username],
        ['email', email],
      ];
      const reserved = [];
      for (const [kind, value] of indexes) {
        if (!(await reserveIndex(kind, value, accountId))) {
          for (const [rk, rv] of reserved) await (await import('./_store.mjs')).store().delete(`idx:${rk}:${normalize(rv)}`);
          return json({ error: `${kind === 'username' ? 'ইউজারনেম' : 'ইমেইল'} আগে থেকেই ব্যবহার করা হয়েছে।` }, 409);
        }
        reserved.push([kind, value]);
      }

      await ensureSystem();
      let role = (await claimSuperAdmin(accountId)) ? 'SUPER_ADMIN' : 'USER';

      const user = {
        accountId, username, name, email, phone, role,
        accountType,
        gender: accountType === 'PATIENT' ? gender : '',
        dob,
        passwordHash: hashPassword(password),
        recoveryCodeHash: hashPassword(recoveryCode),
        createdAt: new Date().toISOString(),
      };
      await setJSON(`user:${accountId}`, user, { onlyIfNew: true });
      await setJSON(`idx:account:${accountId}`, { accountId }, { onlyIfNew: true });
      await setJSON(`profile:${accountId}`, { bloodGroup: '', allergies: '', history: '', updatedAt: null }, { onlyIfNew: true });
      await setJSON(`friends:${accountId}`, { friends: [], incoming: [], outgoing: [] }, { onlyIfNew: true });
      if (accountType === 'DOCTOR') {
        const leaflet = String(body.leaflet || '');
        if (leaflet && !leaflet.startsWith('data:image/')) return json({ error: 'শুধু image leaflet upload করা যাবে।' }, 400);
        if (leaflet.length > 4_000_000) return json({ error: 'Leaflet image ছোট করুন।' }, 413);
        await setJSON(`doctor:${accountId}`, { workplaceName: clean(body.workplaceName).slice(0,200), degrees: Array.isArray(body.degrees) ? body.degrees.map(x=>clean(x)).filter(Boolean).slice(0,30) : [], workType: clean(body.workType).slice(0,150), schedule: clean(body.schedule).slice(0,5000), leaflet, createdAt: new Date().toISOString() }, { onlyIfNew: true });
      }

      const publicInfo = publicUser(user);
      return json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে।', patientId: `PAT-${accountId.replace(/^ACC-/, '')}`, user: publicInfo, recoveryCode, recoveryNote: 'এই Recovery Code নিরাপদ জায়গায় রাখুন। Password ভুলে গেলে এটি লাগবে।' }, 201);
    }

    if (action === 'login') {
      const identifier = clean(body.loginIdentifier);
      const password = String(body.password || '');
      const phoneIdentifier = identifier.replace(/[^0-9+]/g, '');
      if (!identifier || !password) return json({ error: 'লগইন তথ্য দিন।' }, 400);
      let accountId = null;
      if (/^ACC-[A-Z0-9]+$/i.test(identifier)) accountId = identifier.toUpperCase();
      else if (identifier.includes('@')) accountId = (await getJSON(`idx:email:${normalize(identifier)}`, null))?.accountId;
      else accountId = (await getJSON(`idx:username:${normalize(identifier)}`, null))?.accountId;
      if (!accountId) {
        // Phone can map to multiple accounts, so only accept it if exactly one account uses it.
        const { store } = await import('./_store.mjs');
        const listed = await store().list({ prefix: 'user:' });
        const matches = [];
        for (const x of listed.blobs) {
          const u = await getJSON(x.key, null);
          if (u && u.phone === phoneIdentifier) matches.push(u.accountId);
          if (matches.length > 1) break;
        }
        if (matches.length === 1) accountId = matches[0];
        else if (matches.length > 1) return json({ error: 'এই ফোন নম্বরে একাধিক account আছে। Account ID বা username দিয়ে login করুন।' }, 409);
      }
      const user = accountId ? await getJSON(`user:${accountId}`, null) : null;
      if (!user || !verifyPassword(password, user.passwordHash)) return json({ error: 'ভুল login তথ্য।' }, 401);
      const payload = await sessionResponse(user);
      return json({ success: true, user: payload.user }, 200, { 'set-cookie': payload.cookie });
    }

    if (action === 'me') {
      // handled by /api/me; retained for compatibility
      return json({ error: 'Use /api/me' }, 400);
    }

    if (action === 'forgot') {
      const accountId = String(body.accountId || '').trim().toUpperCase();
      const recoveryCode = String(body.recoveryCode || '').trim().toUpperCase();
      const newPassword = String(body.newPassword || '');
      if (!accountId || !recoveryCode || newPassword.length < MIN_PASSWORD) return json({ error: 'Account ID, Recovery Code এবং নতুন password দিন।' }, 400);
      const user = await getJSON(`user:${accountId}`, null);
      if (!user || !verifyPassword(recoveryCode, user.recoveryCodeHash)) return json({ error: 'Account ID বা Recovery Code ভুল।' }, 401);
      user.passwordHash = hashPassword(newPassword);
      user.updatedAt = new Date().toISOString();
      await setJSON(`user:${accountId}`, user);
      return json({ success: true, message: 'Password পরিবর্তন হয়েছে। এখন নতুন password দিয়ে login করুন।' });
    }

    if (action === 'logout') {
      return json({ success: true }, 200, { 'set-cookie': cookieSerialize('lhr_session', '', { maxAge: 0 }) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('Auth function error:', err);
    const message = String(err?.message || err || 'Unknown error');
    return json({
      error: 'Server error. আবার চেষ্টা করুন।',
      code: 'AUTH_SERVER_ERROR',
      detail: process.env.NETLIFY_DEV === 'true' ? message : undefined,
    }, 500);
  }
};
