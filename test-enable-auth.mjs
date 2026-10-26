/**
 * Enables Firebase Auth (anonymous + email/password) for the project using the
 * already-authorised Firebase CLI session, then verifies anonymous sign-in.
 * Prints statuses only — never the credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT = 'scottlandyardirl';
const CONF = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

if (!fs.existsSync(CONF)) {
  console.error('firebase-tools config not found — is the CLI logged in?');
  process.exit(1);
}
const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
const refreshToken = conf?.tokens?.refresh_token;
if (!refreshToken) {
  console.error('No refresh token in the CLI config — run: npx firebase-tools login');
  process.exit(1);
}

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLI_CLIENT_ID,
    client_secret: CLI_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }),
});
const tokenJson = await tokenRes.json();
if (!tokenRes.ok) {
  console.error('Token exchange failed:', tokenRes.status, JSON.stringify(tokenJson).slice(0, 300));
  process.exit(1);
}
const accessToken = tokenJson.access_token;
console.log('access token acquired:', !!accessToken);

const authHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}`;

const before = await fetch(`${base}/config`, { headers: authHeaders });
console.log('GET /config →', before.status, (await before.text()).slice(0, 200));

const patch = await fetch(`${base}/config?updateMask=signIn`, {
  method: 'PATCH',
  headers: authHeaders,
  body: JSON.stringify({
    signIn: {
      anonymous: { enabled: true },
      email: { enabled: true, passwordRequired: true },
    },
  }),
});
console.log('PATCH signIn →', patch.status, (await patch.text()).slice(0, 400));

const after = await fetch(`${base}/config`, { headers: authHeaders });
console.log('GET /config after →', after.status, (await after.text()).slice(0, 400));

// verify anonymous sign-in with the public web API key
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ returnSecureToken: true }),
});
const signJson = await signUp.json();
console.log('anonymous signUp →', signUp.status, signJson.localId ? `uid=${signJson.localId.slice(0, 6)}…` : JSON.stringify(signJson).slice(0, 300));
