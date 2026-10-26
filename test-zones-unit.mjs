/**
 * Integration test for the shared big-team zone engine — runs the REAL
 * src/utils/zones.js against the REAL Firebase database (via the Vite dev
 * server, so module resolution matches production).
 *
 * Usage:  node test-zones-unit.mjs            (dev server must run on :5173)
 *         APP_URL=http://localhost:5173 node test-zones-unit.mjs
 */
import { chromium } from 'playwright';
import { loadEnv, signInAnonymously } from './test-helpers.mjs';

// ── env / REST helpers ───────────────────────────────────────────────────────
const env = loadEnv();
const DB_URL = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const BUCKET = env.VITE_FIREBASE_STORAGE_BUCKET || '';
if (!DB_URL) { console.error('VITE_FIREBASE_DATABASE_URL missing in .env'); process.exit(1); }

const TOKEN = await signInAnonymously(env);
const api = (path) => `${DB_URL}/${path}.json?auth=${TOKEN}`;
const dbGet = async (path) => (await fetch(api(path))).json();
const dbPut = async (path, body) => {
  const r = await fetch(api(path), { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${await r.text()}`);
};
const dbPatch = async (path, body) => {
  const r = await fetch(api(path), { method: 'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${await r.text()}`);
};
const dbDelete = async (path) => fetch(api(path), { method: 'DELETE' });

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── tiny assert harness ──────────────────────────────────────────────────────
let pass = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const round = (n) => Math.round(n);

// ── test ─────────────────────────────────────────────────────────────────────
const GAME = `ZNT${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const FUG = { lat: 48.2082, lng: 16.3738 };
const FAR = { lat: 48.2175, lng: 16.3903 };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));

await page.goto(APP_URL, { waitUntil: 'networkidle' });
// Rules require an authenticated device; make sure this page has one before we
// exercise the real zone engine through it.
const authState = await page.evaluate(async () => {
  const { ensureAuth, auth } = await import('/src/firebase/config.js');
  try {
    await ensureAuth();
    return { uid: auth.currentUser?.uid ?? null };
  } catch (err) {
    return { error: `${err?.code ?? ''} ${err?.message ?? err}` };
  }
});
console.log('browser auth:', JSON.stringify(authState));
if (!authState.uid) {
  console.error('Browser could not sign in — aborting.');
  await browser.close();
  process.exit(1);
}

// Load the production modules inside the browser (Vite resolves their imports).
await page.evaluate(async () => {
  window.__zones = await import('/src/utils/zones.js');
  window.__stars = await import('/src/data/stars.js');
  window.__hints = await import('/src/utils/hints.js');
});


console.log(`\nIntegration test — game ${GAME} (${NEW_LABEL()})`);
function NEW_LABEL() { return 'real Firebase, real src/utils/zones.js'; }

try {
  // ── seed ───────────────────────────────────────────────────────────────────
  await dbPut(`games/${GAME}`, {
    status: 'active',
    createdAt: Date.now(),
    fugitive: { lastUpdate: { lat: FUG.lat, lng: FUG.lng, timestamp: Date.now() } },
    teams: {
      'Red 1': { score: 0, currentRiddle: 0, bigTeam: 'Red' },
      'Red 2': { score: 0, currentRiddle: 0, bigTeam: 'Red' },
      'Blue 1': { score: 0, currentRiddle: 0, bigTeam: 'Blue' },
    },
  });

  // 1. first solve, Red has 2 players → 5% / 2 = 2.5%
  const r1 = await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Red', baseReduction: 0.05, fugitive: { lat: 48.2082, lng: 16.3738 }, updatedBy: 'Red 1',
  }), { game: GAME });
  let zones = await dbGet(`games/${GAME}/zones`);
  check('first solve writes a shared zone', r1 === true && !!zones?.Red);
  check('radius 2000 → 1950 (easy 5% ÷ 2 players)', zones?.Red?.radius === 1950, `got ${zones?.Red?.radius}`);
  check('only ONE zone node for 2 players', Object.keys(zones ?? {}).length === 1);
  check('no per-device currentHint leaked',
    Object.values(await dbGet(`games/${GAME}/teams`) ?? {}).every(t => t.currentHint === undefined));

  // 2. third player joins → hard = 15% / 3 = 5%
  await dbPatch(`games/${GAME}/teams`, { 'Red 3': { score: 0, currentRiddle: 0, bigTeam: 'Red' } });
  await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Red', baseReduction: 0.15, fugitive: { lat: 48.2082, lng: 16.3738 }, updatedBy: 'Red 2',
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  const expected2 = round(1950 * 0.95);
  check(`radius 1950 → ${expected2} (hard 15% ÷ 3 players)`, zones?.Red?.radius === expected2, `got ${zones?.Red?.radius}`);

  // 3. solo Blue side shrinks at full rate, independent node
  await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Blue', baseReduction: 0.05, fugitive: { lat: 48.2082, lng: 16.3738 }, updatedBy: 'Blue 1',
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  check('solo team gets the full 5% (2000 → 1900)', zones?.Blue?.radius === 1900, `got ${zones?.Blue?.radius}`);
  check('Red and Blue have separate circles', zones?.Red?.radius !== zones?.Blue?.radius);

  // 4. zone freeze
  const frozen = await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Red', baseReduction: 0.15, freezeUntil: Date.now() + 60_000,
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  check('zone freeze blocks the shrink', frozen === false && zones?.Red?.radius === expected2);

  // 5. double zone: 5% × 2 = 10% ÷ 3 players
  await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Red', baseReduction: 0.05, doubleZone: true, fugitive: { lat: 48.2082, lng: 16.3738 },
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  const expected5 = round(expected2 * (1 - 0.10 / 3));
  check(`double zone 10% ÷ 3 → ${expected5}`, zones?.Red?.radius === expected5, `got ${zones?.Red?.radius}`);

  // 6. centre must always contain Mister X
  const d6 = haversine(FUG.lat, FUG.lng, zones.Red.lat, zones.Red.lng);
  check('zone centre is offset but contains Mister X', d6 <= zones.Red.radius * 0.86, `${round(d6)}m vs r=${zones.Red.radius}`);

  // 7. admin force radius
  await page.evaluate(({ game }) => window.__zones.setBigTeamZoneRadius({
    gameCode: game, bigTeam: 'Red', radius: 777, fugitive: { lat: 48.2082, lng: 16.3738 },
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  check('admin can force an exact radius', zones?.Red?.radius === 777, `got ${zones?.Red?.radius}`);

  // 8. Mister X moved 3km away → recenterAllZones keeps radii
  await page.evaluate(({ game, far }) => window.__zones.recenterAllZones({ gameCode: game, lat: far.lat, lng: far.lng }),
    { game: GAME, far: FAR });
  zones = await dbGet(`games/${GAME}/zones`);
  const dRed = haversine(FAR.lat, FAR.lng, zones.Red.lat, zones.Red.lng);
  const dBlue = haversine(FAR.lat, FAR.lng, zones.Blue.lat, zones.Blue.lng);
  check('recentre keeps Red radius', zones?.Red?.radius === 777);
  check('recentre keeps Blue radius', zones?.Blue?.radius === 1900);
  check('recentre puts Red circle around the new position', dRed <= 777 * 0.86, `${round(dRed)}m`);
  check('recentre puts Blue circle around the new position', dBlue <= 1900 * 0.86, `${round(dBlue)}m`);

  // 9. no GPS + no zone → nothing is invented
  await dbPut(`games/${GAME}/teams/Fresh 1`, { score: 0, bigTeam: 'Fresh' });
  const noGps = await page.evaluate(({ game }) => window.__zones.shrinkBigTeamZone({
    gameCode: game, bigTeam: 'Fresh', baseReduction: 0.15,
  }), { game: GAME });
  zones = await dbGet(`games/${GAME}/zones`);
  check('no GPS + no zone ⇒ no zone created', noGps === false && zones?.Fresh === undefined);

  // 10. resolveZone fallback for legacy games
  const resolve = await page.evaluate(() => ({
    shared: window.__zones.resolveZone({ zones: { Red: { lat: 1, lng: 2, radius: 3 } } }, 'Red', null),
    legacy: window.__zones.resolveZone({}, 'Red', { currentHint: { lat: 9, lng: 8, radius: 7 } }),
    missing: window.__zones.resolveZone({}, 'Red', null),
  }));
  check('resolveZone prefers the shared zone', resolve.shared?.radius === 3);
  check('resolveZone falls back to legacy currentHint', resolve.legacy?.radius === 7);
  check('resolveZone returns null when unknown', resolve.missing === null);

  // 11. member counting
  const counts = await page.evaluate(() => ({
    none: window.__zones.countBigTeamMembers(null, 'Red'),
    red: window.__zones.countBigTeamMembers({
      a: { bigTeam: 'Red' }, b: { bigTeam: 'Red' }, c: { bigTeam: 'Blue' },
    }, 'Red'),
  }));
  check('team size defaults to 1', counts.none === 1);
  check('team size counts only that side (2 of 3)', counts.red === 2, `got ${counts.red}`);

  // 12. stars are off
  const starsEnabled = await page.evaluate(() => window.__stars.STARS_ENABLED);
  check('STARS_ENABLED is false', starsEnabled === false);
} finally {
  await dbDelete(`games/${GAME}`);
  await browser.close();
}

console.log(`\n${failures.length === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${failures.length} failed`);
if (consoleErrors.length) {
  console.log('\nBrowser console errors during test:');
  [...new Set(consoleErrors)].forEach(e => console.log('  •', e));
}
process.exit(failures.length === 0 ? 0 : 1);
