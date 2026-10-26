/** Probe which Firebase Auth sign-in providers are usable for this project. */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const KEY = env.VITE_FIREBASE_API_KEY;
const DB = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.text() };
};

console.log('project:', env.VITE_FIREBASE_PROJECT_ID);
console.log('\n1) anonymous sign-in:');
const anon = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { returnSecureToken: true });
console.log(' ', anon.status, anon.body.slice(0, 300));

console.log('\n2) email/password sign-in provider:');
const email = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
  email: `probe${Date.now()}@example.invalid`, password: 'Probe-pass-12345', returnSecureToken: true,
});
console.log(' ', email.status, email.body.slice(0, 300));

console.log('\n3) current rules (public read test):');
const rootRead = await fetch(`${DB}/games.json`);
console.log('  GET /games.json →', rootRead.status);

console.log('\n4) anonymous token vs. a code-scoped read:');
if (anon.status === 200) {
  const token = JSON.parse(anon.body).idToken;
  const scoped = await fetch(`${DB}/games/NOPE1.json?auth=${token}`);
  console.log('  GET /games/NOPE1.json (with token) →', scoped.status, (await scoped.text()).slice(0, 80));
} else {
  console.log('  skipped (anonymous auth not enabled)');
}
