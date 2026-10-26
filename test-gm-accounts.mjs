/**
 * Enable Email/Password auth and provision the two Game Master accounts with a
 * `gm: true` custom claim. Prints statuses only.
 *
 * Usage: node test-gm-accounts.mjs [--dry-run]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from './test-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');
const env = loadEnv();
const PROJECT = env.VITE_FIREBASE_PROJECT_ID;
const KEY = env.VITE_FIREBASE_API_KEY;
const DOMAIN = 'scottlandyardirl.app';
const GMS = [
  { username: 'dimitriburyak', name: 'Dimitri Buryak' },
  { username: 'evasteinmetz', name: 'Eva Steinmetz' },
];
const PASSWORD = 'scottlandyardirl';

// ── admin token from the Firebase CLI session ────────────────────────────────
const conf = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: conf.tokens.refresh_token,
    grant_type: 'refresh_token',
  }),
});
const { access_token: token } = await tokenRes.json();
if (!token) { console.error('could not obtain an admin token'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const admin = (p) => `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}${p}`;

const cfg = await fetch(admin('/config'), { headers: H });
console.log('GET config →', cfg.status);
const cfgJson = cfg.ok ? await cfg.json() : {};
console.log('  signIn:', JSON.stringify(cfgJson.signIn ?? {}).slice(0, 300));

if (!dryRun) {
  const patch = await fetch(admin('/config?updateMask=signIn'), {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({
      signIn: {
        anonymous: { enabled: true },
        email: { enabled: true, passwordRequired: true },
      },
    }),
  });
  console.log('PATCH enable email/password →', patch.status, (await patch.text()).slice(0, 200));
}

// ── create accounts through the public web API ───────────────────────────────
const web = (path, body) => fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

for (const gm of GMS) {
  const email = `${gm.username}@${DOMAIN}`;
  if (dryRun) { console.log(`would create ${email}`); continue; }

  let signUp = await web('accounts:signUp', { email, password: PASSWORD, returnSecureToken: true });
  let body = await signUp.json();
  if (body?.error?.message === 'EMAIL_EXISTS') {
    signUp = await web('accounts:signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
    body = await signUp.json();
  }
  const localId = body.localId;
  console.log(`account ${email} → ${signUp.status} ${localId ? `uid=${localId.slice(0, 6)}…` : JSON.stringify(body).slice(0, 160)}`);
  if (!localId) continue;

  const update = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ localId, displayName: gm.name, customAttributes: JSON.stringify({ gm: true }) }),
  });
  console.log(`  custom claim gm=true → ${update.status} ${(await update.text()).slice(0, 120)}`);
}

// ── verify a fresh login carries the claim ───────────────────────────────────
if (!dryRun) {
  for (const gm of GMS) {
    const res = await web('accounts:signInWithPassword', {
      email: `${gm.username}@${DOMAIN}`, password: PASSWORD, returnSecureToken: true,
    });
    const json = await res.json();
    if (!json.idToken) { console.log(`verify ${gm.username} → login failed`, JSON.stringify(json).slice(0, 160)); continue; }
    const payload = JSON.parse(Buffer.from(json.idToken.split('.')[1], 'base64url').toString());
    console.log(`verify ${gm.username} → email=${payload.email} gm=${payload.gm} uid=${String(payload.user_id).slice(0, 6)}…`);
  }
}
