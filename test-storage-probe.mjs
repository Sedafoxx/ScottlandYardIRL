/**
 * Probe Firebase Storage: unauthenticated writes must be refused, authenticated
 * writes to photos/{game}/… must succeed, and everything outside that path must
 * stay closed. Uploads are deleted again.
 */
import { loadEnv, signInAnonymously } from './test-helpers.mjs';

const env = loadEnv();
const BUCKET = env.VITE_FIREBASE_STORAGE_BUCKET;
const TOKEN = await signInAnonymously(env);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const uploadUrl = (name) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`;

async function upload(name, withAuth) {
  const headers = { 'Content-Type': 'application/octet-stream' };
  if (withAuth) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(uploadUrl(name), { method: 'POST', headers, body: png });
  const body = await res.text();
  console.log(`${res.status} ${res.statusText}  ←  ${withAuth ? 'auth ' : 'anon '}${name}`);
  if (res.status >= 400) console.log(`   ${body.slice(0, 200)}\n`);
  return { status: res.status, body };
}

console.log(`bucket: ${BUCKET}\n`);
const anon = await upload('photos/PROBE/_misterx/probe.png', false);
const authed = await upload('photos/PROBE/_misterx/probe.png.enc', true);
const outside = await upload('random/whatever.txt', true);

console.log('\nsummary:');
console.log('  anonymous upload   →', anon.status, anon.status === 403 ? '(denied, good)' : '(CHECK RULES)');
console.log('  authenticated photo→', authed.status, authed.status === 200 ? '(allowed, good)' : '(CHECK RULES)');
console.log('  outside photos/    →', outside.status, outside.status === 403 ? '(denied, good)' : '(CHECK RULES)');

if (authed.status === 200) {
  const meta = JSON.parse(authed.body);
  await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(meta.name)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  console.log('  probe object deleted');
}
