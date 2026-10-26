/**
 * Verifies the deployed Realtime Database security rules.
 *
 * Three identities are exercised:
 *   · anonymous player  — may play (teams, chat, zones, photos) but not administer
 *   · Game Master (gm)  — the owner of the test game
 *   · other GM          — must not be able to touch someone else's game
 *
 * Expects database.rules.json to be deployed:
 *   npx firebase-tools deploy --only database
 */
import { loadEnv, signInAnonymously, signInGmAccount } from './test-helpers.mjs';

const env = loadEnv();
const DB_URL = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');

const playerToken = await signInAnonymously(env);
const gm = await signInGmAccount(env, 'dimitriburyak');
const otherGm = await signInGmAccount(env, 'evasteinmetz');

const apiWith = (token) => (p) => `${DB_URL}/${p}.json?auth=${token}`;
const api = apiWith(gm.token);          // game owner
const playerApi = apiWith(playerToken); // anonymous player
const otherGmApi = apiWith(otherGm.token);
const unauthApi = (p) => `${DB_URL}/${p}.json`;

let pass = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const write = async (buildUrl, path, body) => {
  const r = await fetch(buildUrl(path), { method: 'PUT', body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const read = async (buildUrl, path) => (await fetch(buildUrl(path))).status;
const del = async (buildUrl, path) => (await fetch(buildUrl(path), { method: 'DELETE' })).status;

// The app generates 5-char uppercase codes, and fugitiveCodes validates them.
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
  check('unauthenticated read is denied', (await read(unauthApi, `games/${GAME}`)) === 401);
  check('unauthenticated write is denied',
    (await write(unauthApi, `games/${GAME}`, { status: 'active' })).status === 401);
  check('unauthenticated photo read is denied', (await read(unauthApi, `photos/${GAME}/x`)) === 401);

  // ── only a Game Master may create a game ─────────────────────────────────
  check('a player cannot create a game',
    (await write(playerApi, `games/${GAME}`, { status: 'waiting', createdAt: Date.now() })).status === 401);
  check('an unclaimed owner cannot be written without a gm claim',
    (await write(playerApi, `games/${GAME}/gmUid`, gm.uid)).status === 401);

  const created = await write(api, `games/${GAME}`, {
    status: 'waiting',
    createdAt: Date.now(),
    fugitiveCode: FUG,
    gm: 'dimitriburyak',
    gmUid: gm.uid,
  });
  check('game owner can create a game', created.status === 200, `${created.status} ${created.text.slice(0, 80)}`);
  check('read own game (by its code)', (await read(api, `games/${GAME}`)) === 200);
  check('reject listing every game', (await read(api, 'games')) === 401);
  check('teams of a game are readable with its code', (await read(api, `games/${GAME}/teams`)) === 200);

  // ── players may play ─────────────────────────────────────────────────────
  check('team registration (player)', (await write(playerApi, `games/${GAME}/teams/Red 1`, { score: 0, currentRiddle: 0, bigTeam: 'Red' })).status === 200);
  check('GPS location write (player)', (await write(playerApi, `games/${GAME}/teams/Red 1/location`, { lat: 48.2, lng: 16.37, timestamp: Date.now() })).status === 200);
  check('fugitive GPS write (player)', (await write(playerApi, `games/${GAME}/fugitive/lastUpdate`, { lat: 48.2, lng: 16.37, timestamp: Date.now() })).status === 200);
  check('valid shared zone (player)', (await write(playerApi, `games/${GAME}/zones/Red`, { lat: 48.2, lng: 16.37, radius: 500, updatedAt: Date.now() })).status === 200);
  check('riddle set write (player)', (await write(playerApi, `games/${GAME}/riddleSets/Red 1`, { 0: { type: 'puzzle' } })).status === 200);
  check('selfie request node (player item use)',
    (await write(playerApi, `games/${GAME}/selfieRequest`, { status: 'pending', requestedAt: Date.now() })).status === 200);
  check('zone freeze node (player item use)',
    (await write(playerApi, `games/${GAME}/zoneFreezeUntil`, Date.now() + 60000)).status === 200);
  check('chat message', (await write(playerApi, `games/${GAME}/messages/teams/Red 1/m1`, { from: 'Red 1', text: 'hi', timestamp: Date.now() })).status === 200);
  check('system message', (await write(playerApi, `games/${GAME}/messages/global/m2`, { sender: 'System', text: 'Game started', timestamp: Date.now() })).status === 200);

  // ── item bag ─────────────────────────────────────────────────────────────
  check('item bag accepts a count',
    (await write(playerApi, `games/${GAME}/teamItems/Red`, { live_feed: 2, direction_beacon: 1 })).status === 200);
  check('item bag accepts zero (fully spent)',
    (await write(playerApi, `games/${GAME}/teamItems/Red/live_feed`, 0)).status === 200);
  check('reject junk item counts',
    (await write(playerApi, `games/${GAME}/teamItems/Red/sabotage`, 'lots')).status === 401);
  check('reject absurd item counts',
    (await write(playerApi, `games/${GAME}/teamItems/Red/zone_freeze`, 500)).status === 401);

  // ── photos (encrypted payloads) ──────────────────────────────────────────
  const okCipher = 'A'.repeat(2000);
  check('encrypted photo accepted',
    (await write(playerApi, `photos/${GAME}/p1`, { cipher: okCipher, iv: 'B'.repeat(16), createdAt: Date.now(), team: 'Red 1' })).status === 200);
  check('legacy plain dataUrl still accepted',
    (await write(playerApi, `photos/${GAME}/legacy`, { dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(2000), createdAt: Date.now() })).status === 200);
  check('reject oversized photo blob',
    (await write(playerApi, `photos/${GAME}/p2`, { cipher: 'A'.repeat(600001), iv: 'B'.repeat(16), createdAt: Date.now() })).status === 401);
  check('reject junk in the photo store',
    (await write(playerApi, `photos/${GAME}/p3`, { junk: 'x', createdAt: Date.now() })).status === 401);
  check('reject cipher without iv',
    (await write(playerApi, `photos/${GAME}/p4`, { cipher: okCipher, createdAt: Date.now() })).status === 401);
  check('reject listing all photos of a game', (await read(playerApi, `photos/${GAME}`)) === 401);
  check('allowed: loading one photo by its key', (await read(playerApi, `photos/${GAME}/p1`)) === 200);

  // ── validation ───────────────────────────────────────────────────────────
  check('reject non-numeric score',
    (await write(playerApi, `games/${GAME}/teams/Red 1/score`, 'lol')).status === 401);
  check('reject negative score',
    (await write(playerApi, `games/${GAME}/teams/Red 1/score`, -5)).status === 401);
  check('reject absurd zone radius (5m)',
    (await write(playerApi, `games/${GAME}/zones/Blue`, { lat: 48.2, lng: 16.37, radius: 5 })).status === 401);
  check('reject zone without centre',
    (await write(playerApi, `games/${GAME}/zones/Blue`, { radius: 500 })).status === 401);
  check('reject out-of-range GPS',
    (await write(playerApi, `games/${GAME}/fugitive/lastUpdate`, { lat: 999, lng: 16.37, timestamp: Date.now() })).status === 401);
  check('reject unknown game status',
    (await write(api, `games/${GAME}/status`, 'pwned')).status === 401);
  check('reject message without text',
    (await write(playerApi, `games/${GAME}/messages/global/m3`, { sender: 'x', timestamp: Date.now() })).status === 401);

  // ── administration is owner-only ─────────────────────────────────────────
  check('a player cannot change the game status',
    (await write(playerApi, `games/${GAME}/status`, 'active')).status === 401);
  check('another Game Master cannot change the status of a foreign game',
    (await write(otherGmApi, `games/${GAME}/status`, 'active')).status === 401);
  check('the owning Game Master can change the status',
    (await write(api, `games/${GAME}/status`, 'active')).status === 200);
  check('a player cannot delete a game', (await del(playerApi, `games/${GAME}`)) === 401);
  check('another Game Master cannot delete a foreign game', (await del(otherGmApi, `games/${GAME}`)) === 401);
  check('the game still exists after those attempts', (await read(api, `games/${GAME}`)) === 200);

  // ── scope ────────────────────────────────────────────────────────────────
  check('reject writes to an unknown root', (await write(api, 'hacked/x', { a: 1 })).status === 401);
  check('reject writes at the database root', (await write(api, '', { boom: true })).status === 401);
  check('allowed: Mister X code resolves',
    (await write(api, `fugitiveCodes/${FUG}`, GAME)).status === 200 && (await read(api, `fugitiveCodes/${FUG}`)) === 200);
  check('reject overwriting an existing Mister X code',
    (await write(api, `fugitiveCodes/${FUG}`, 'OTHER')).status === 401);
  check('reject listing every Mister X code', (await read(api, 'fugitiveCodes')) === 401);

  console.log(`\n  info: public game list → ${await read(api, 'games') === 401 ? 'denied (good)' : 'OPEN'}`);
  console.log('  info: ownership enforced via gmUid + gm claim; players keep play-level writes.');
} finally {
  await del(api, `games/${GAME}`);
  await del(api, `fugitiveCodes/${FUG}`);
  await del(api, `photos/${GAME}`);
}

console.log(`\n${failures.length === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
