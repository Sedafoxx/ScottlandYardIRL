/** Try to initialise Identity Platform (Firebase Auth) via the admin API. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT = 'scottlandyardirl';
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
if (!token) { console.error('no token'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const tryCall = async (label, url, opts = {}) => {
  const r = await fetch(url, { headers: H, ...opts });
  const body = (await r.text()).slice(0, 300);
  console.log(`${label}: ${r.status} ${body}`);
  return r.status;
};

await tryCall('initializeAuth v2', `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/identityPlatform:initializeAuth`, {
  method: 'POST', body: JSON.stringify({}),
});
await tryCall('config v2 GET', `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config`);
await tryCall('config v2 PATCH signIn', `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/config?updateMask=signIn`, {
  method: 'PATCH',
  body: JSON.stringify({ signIn: { anonymous: { enabled: true }, email: { enabled: true, passwordRequired: true } } }),
});

const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
});
const j = await signUp.json();
console.log('anonymous signUp:', signUp.status, j.localId ? `uid=${j.localId.slice(0, 6)}…` : JSON.stringify(j).slice(0, 200));
