/**
 * Verifies the deployed Realtime Database security rules.
 * Expects the hardened rules in database.rules.json to be deployed:
 *   npx firebase deploy --only database
 *
 * Usage: node test-rules.mjs
 */
import { loadEnv, signInAnonymously } from './test-helpers.mjs';

const env = loadEnv();
const DB_URL = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const TOKEN = await signInAnonymously(env);
const api = (p) => `${DB_URL}/${p}.json?auth=${TOKEN}`;
const unauthApi = (p) => `${DB_URL}/${p}.json`;

let pass = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const write = async (path, body) => {
  const r = await fetch(api(path), { method: 'PUT', body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const read = async (path) => (await fetch(api(path))).status;
const del = (path) => fetch(api(path), { method: 'DELETE' });

// The app generates 5-char uppercase codes, and fugitiveCodes validates exactly 5.
const code5 = (prefix) => {
  let s = prefix;
  while (s.length < 5) s += Math.random().toString(36).slice(2, 3).toUpperCase();
  return s.slice(0, 5);
};
const GAME = code5('RUL');
const FUG = code5('Q');

console.log(`\nDatabase rules test — ${GAME}\n`);

try {
  // ── no identity, no access ────────────────────────────────────────────────
  check('unauthenticated read is denied', (await fetch(unauthApi(`games/${GAME}`))).status === 401);
  check('unauthenticated write is denied',
    (await fetch(unauthApi(`games/${GAME}`), { method: 'PUT', body: JSON.stringify({ status: 'active' }) })).status === 401);
  check('unauthenticated photo read is denied', (await fetch(unauthApi(`photos/${GAME}/x`))).status === 401);

  // ── legitimate shapes must still work ─────────────────────────────────────
  const created = await write(`games/${GAME}`, { status: 'waiting', createdAt: Date.now(), fugitiveCode: FUG });
  check('create a game', created.status === 200, `${created.status}`);

  check('team registration', (await write(`games/${GAME}/teams/Red 1`, { score: 0, currentRiddle: 0, bigTeam: 'Red' })).status === 200);
  check('GPS location write', (await write(`games/${GAME}/teams/Red 1/location`, { lat: 48.2, lng: 16.37, timestamp: Date.now() })).status === 200);
  check('fugitive GPS write', (await write(`games/${GAME}/fugitive/lastUpdate`, { lat: 48.2, lng: 16.37, timestamp: Date.now() })).status === 200);
  check('status → active', (await write(`games/${GAME}/status`, 'active')).status === 200);
  check('valid shared zone (radius 500)', (await write(`games/${GAME}/zones/Red`, { lat: 48.2, lng: 16.37, radius: 500, updatedAt: Date.now() })).status === 200);
  check('chat message', (await write(`games/${GAME}/messages/teams/Red 1/m1`, { from: 'Red 1', text: 'hi', timestamp: Date.now() })).status === 200);
  check('system message', (await write(`games/${GAME}/messages/global/m2`, { sender: 'System', text: 'Game started', timestamp: Date.now() })).status === 200);
  check('read own game (by its code)', (await read(`games/${GAME}`)) === 200);
  check('reject listing every game', (await read('games')) === 401);
  check('teams of a game are readable with its code', (await read(`games/${GAME}/teams`)) === 200);

  // ── garbage must be rejected ─────────────────────────────────────────────
  check('reject non-numeric score',
    (await write(`games/${GAME}/teams/Red 1/score`, 'lol')).status === 401);
  check('reject negative score',
    (await write(`games/${GAME}/teams/Red 1/score`, -5)).status === 401);
  check('reject absurd zone radius (5m)',
    (await write(`games/${GAME}/zones/Blue`, { lat: 48.2, lng: 16.37, radius: 5 })).status === 401);
  check('reject zone without centre',
    (await write(`games/${GAME}/zones/Blue`, { radius: 500 })).status === 401);
  check('reject out-of-range GPS',
    (await write(`games/${GAME}/fugitive/lastUpdate`, { lat: 999, lng: 16.37, timestamp: Date.now() })).status === 401);
  check('reject unknown game status',
    (await write(`games/${GAME}/status`, 'pwned')).status === 401);
  check('reject message without text',
    (await write(`games/${GAME}/messages/global/m3`, { sender: 'x', timestamp: Date.now() })).status === 401);

  // ── team item bag ───────────────────────────────────────────────────────
  check('item bag accepts a count',
    (await write(`games/${GAME}/teamItems/Red`, { live_feed: 2, direction_beacon: 1 })).status === 200);
  check('item bag accepts zero (fully spent)',
    (await write(`games/${GAME}/teamItems/Red/live_feed`, 0)).status === 200);
  check('reject junk item counts',
    (await write(`games/${GAME}/teamItems/Red/sabotage`, 'lots')).status === 401);
  check('reject absurd item counts',
    (await write(`games/${GAME}/teamItems/Red/zone_freeze`, 500)).status === 401);

  // ── photo fallback storage ──────────────────────────────────────────────
  const okCipher = 'A'.repeat(2000);
  check('encrypted photo accepted',
    (await write(`photos/${GAME}/p1`, { cipher: okCipher, iv: 'B'.repeat(16), createdAt: Date.now(), team: 'Red 1' })).status === 200);
  check('legacy plain dataUrl still accepted',
    (await write(`photos/${GAME}/legacy`, { dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(2000), createdAt: Date.now() })).status === 200);
  check('reject oversized photo blob',
    (await write(`photos/${GAME}/p2`, { cipher: 'A'.repeat(600001), iv: 'B'.repeat(16), createdAt: Date.now() })).status === 401);
  check('reject junk in the photo store',
    (await write(`photos/${GAME}/p3`, { junk: 'not-an-image', createdAt: Date.now() })).status === 401);
  check('reject cipher without iv',
    (await write(`photos/${GAME}/p4`, { cipher: okCipher, createdAt: Date.now() })).status === 401);
  check('reject listing all photos of a game', (await read(`photos/${GAME}`)) === 401);
  check('allowed: loading one photo by its key', (await read(`photos/${GAME}/p1`)) === 200);

  // ── scope: nothing outside the game tree ────────────────────────────────
  check('reject writes to an unknown root', (await write('hacked/x', { a: 1 })).status === 401);
  check('reject writes at the database root', (await write('', { boom: true })).status === 401);
  check('allowed: Mister X code resolves',
    (await write(`fugitiveCodes/${FUG}`, GAME)).status === 200 && (await read(`fugitiveCodes/${FUG}`)) === 200);
  check('reject overwriting an existing Mister X code',
    (await write(`fugitiveCodes/${FUG}`, 'OTHER')).status === 401);
  check('reject listing every Mister X code', (await read('fugitiveCodes')) === 401);

  console.log(`\n  info: public game list → ${await read('games') === 401 ? 'denied (good)' : 'OPEN'}`);
  console.log('  note: reads are scoped by game code; real identity-level privacy still');
  console.log('        needs Firebase Auth (enable Authentication → Anonymous).');
} finally {
  await del(`games/${GAME}`);
  await del(`fugitiveCodes/${FUG}`);
  await del(`photos/${GAME}`);
}

console.log(`\n${failures.length === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
