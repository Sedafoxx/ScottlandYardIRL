/**
 * End-to-end game test with SIMULATED GPS.
 *
 * Four "phones" run in one browser with mocked geolocation:
 *   Red 1 + Red 2 (same big team), Blue 1 (other side), Mister X.
 *
 * Verifies:
 *   1. Mister X sees the hunters on his map — and keeps seeing them while undercover
 *   2. Stars are gone from the player UI
 *   3. One shared circle per big team, radius ÷ player count, same circle on both Red phones
 *   4. Selfie demand travels Mister X ⇄ the demanding big team (real Storage upload)
 *
 * Usage: node test-game-e2e.mjs   (dev server must run on :5173)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { loadEnv, signInAnonymously } from './test-helpers.mjs';

// ── env / REST ───────────────────────────────────────────────────────────────
const env = loadEnv();
const DB_URL = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const BUCKET = (env.VITE_FIREBASE_STORAGE_BUCKET || '').replace(/\/$/, '');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
if (!DB_URL) { console.error('VITE_FIREBASE_DATABASE_URL missing in .env'); process.exit(1); }

const TOKEN = await signInAnonymously(env);
const api = (p) => `${DB_URL}/${p}.json?auth=${TOKEN}`;
const unauthApi = (p) => `${DB_URL}/${p}.json`;
const dbGet = async (p) => (await fetch(api(p))).json();
const dbPut = async (p, body) => {
  const r = await fetch(api(p), { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} → ${r.status}`);
};
const dbDelete = (p) => fetch(api(p), { method: 'DELETE' });
const dbPatch = async (p, body) => {
  const r = await fetch(api(p), { method: 'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${p} → ${r.status}`);
};
const dbPush = async (p, body) => {
  const r = await fetch(api(p), { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} → ${r.status}`);
};

function bearingDeg(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLng = (lng2 - lng1) * r;
  const y = Math.sin(dLng) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleClose(a, b, tol = 4) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs((a - b + 540) % 360 - 180) <= tol;
}

let pass = 0;
const failures = [];
const blocked = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForDb(path, predicate, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await dbGet(path);
    if (predicate(last)) return last;
    await sleep(400);
  }
  return last;
}

async function textOf(page) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

async function hasText(page, needle, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await textOf(page)).includes(needle)) return true;
    await sleep(300);
  }
  return false;
}

// ── seed ─────────────────────────────────────────────────────────────────────
const GAME = `E2E${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const PRATERSTERN = { latitude: 48.21752, longitude: 16.39025 };
const FUGITIVE_POS = { latitude: 48.19110, longitude: 16.31010 };
const RIDDLE = {
  type: 'puzzle',
  options: {
    easy:   { difficulty: 'easy',   question: 'Capital of France?', answer: 'PARIS', points: 10, reduction: 0.05 },
    medium: { difficulty: 'medium', question: 'Capital of France?', answer: 'PARIS', points: 20, reduction: 0.10 },
    hard:   { difficulty: 'hard',   question: 'Capital of France?', answer: 'PARIS', points: 30, reduction: 0.15 },
  },
};
const SEED_RIDDLE = { 0: RIDDLE };

await dbPut(`games/${GAME}`, {
  status: 'active',
  createdAt: Date.now(),
  winner: null,
  fugitive: { lastUpdate: { lat: FUGITIVE_POS.latitude, lng: FUGITIVE_POS.longitude, timestamp: Date.now() } },
  teams: {
    'Red 1':  { score: 0, currentRiddle: 0, bigTeam: 'Red' },
    'Red 2':  { score: 0, currentRiddle: 0, bigTeam: 'Red' },
    'Blue 1': { score: 0, currentRiddle: 0, bigTeam: 'Blue' },
  },
  riddleSets: { 'Red 1': SEED_RIDDLE, 'Red 2': SEED_RIDDLE, 'Blue 1': SEED_RIDDLE },
  fugitiveCodes: { TESTX: GAME },
});

const browser = await chromium.launch({ headless: true });
const consoleErrors = [];

async function device(geo) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 950 },
    geolocation: geo,
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' || /permission-denied|PERMISSION_DENIED/.test(t)) {
      consoleErrors.push(t.slice(0, 200));
    }
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return { ctx, page };
}

const url = (path) => `${APP_URL}${path}`;
const teamUrl = (name, bigTeam) =>
  url(`/team/${GAME}?name=${encodeURIComponent(name)}&bigTeam=${encodeURIComponent(bigTeam)}&subteam=1`);

console.log(`\nE2E game ${GAME} — simulated GPS\n`);

try {
  // ── phones ────────────────────────────────────────────────────────────────
  const red1 = await device(PRATERSTERN);
  const red2 = await device({ latitude: 48.21760, longitude: 16.39035 });
  const blue = await device({ latitude: 48.20000, longitude: 16.37000 });
  const misterX = await device(FUGITIVE_POS);

  for (const [label, phone, name, big] of [
    ['Red 1', red1, 'Red 1', 'Red'],
    ['Red 2', red2, 'Red 2', 'Red'],
    ['Blue 1', blue, 'Blue 1', 'Blue'],
  ]) {
    await phone.page.goto(teamUrl(name, big), { waitUntil: 'domcontentloaded' });
    // With the permission already granted the page may enable GPS by itself;
    // only tap the button when it is still offered.
    await hasText(phone.page, 'GPS', 20000);
    const enableBtn = phone.page.getByRole('button', { name: /Enable GPS/ });
    if (await enableBtn.count()) await enableBtn.first().click();
    await hasText(phone.page, 'GPS On', 20000);
  }
  console.log('  · three hunter phones joined with mocked GPS');

  const isLocal = /localhost|127\.0\.0\.1/.test(APP_URL);
  if (isLocal) {
    // Only the dev server exposes the module graph; production bundles hide it.
    const signedIn = await red1.page.evaluate(async () => {
      const { auth } = await import('/src/firebase/config.js');
      return !!auth.currentUser?.uid;
    });
    check('every device is signed in anonymously', signedIn === true);
  }
  check('unauthenticated REST read is denied', (await fetch(unauthApi(`games/${GAME}`))).status === 401);

  const locations = await waitForDb(
    `games/${GAME}/teams`,
    t => t?.['Red 1']?.location?.lat != null && t?.['Blue 1']?.location?.lat != null,
    15000
  );
  check('mocked GPS reaches the database',
    locations?.['Red 1']?.location?.lat != null && locations?.['Blue 1']?.location?.lat != null,
    JSON.stringify({
      red1: locations?.['Red 1']?.location ?? null,
      blue1: locations?.['Blue 1']?.location ?? null,
    }));

  // ── GPS permission/choice survives a page refresh ───────────────────────
  check('GPS choice is remembered on the device',
    (await red1.page.evaluate(() => localStorage.getItem('sy_gps_enabled'))) === '1');
  const locBefore = (await dbGet(`games/${GAME}/teams/Red 1/location`))?.timestamp ?? 0;
  await red1.page.reload({ waitUntil: 'domcontentloaded' });
  check('GPS switches itself back on after a refresh',
    await hasText(red1.page, 'GPS On', 20000));
  const locAfter = await waitForDb(
    `games/${GAME}/teams/Red 1/location`, l => (l?.timestamp ?? 0) > locBefore, 20000);
  check('tracking is live again without a tap', (locAfter?.timestamp ?? 0) > locBefore);

  // ── 1. Mister X map: team dots visible, and stay visible while undercover ──
  const mx = misterX.page;
  await mx.goto(url(`/fugitive/${GAME}`), { waitUntil: 'domcontentloaded' });
  check('Mister X page loads', await hasText(mx, 'You are Mister X'));
  check('Mister X GPS tracking active', await hasText(mx, 'Tracking active', 20000));

  const openMap = async () => {
    await mx.getByRole('button', { name: /Open Map/ }).click();
    await mx.locator('.leaflet-container').waitFor({ timeout: 20000 });
    await sleep(1200);
  };
  const markerCount = () => mx.locator('.leaflet-marker-icon').count();

  await openMap();
  const markersBefore = await markerCount();
  const mapHeaderBefore = await textOf(mx);
  check('Mister X sees hunters on the map (not only undercover)',
    markersBefore > 0 && /team member/.test(mapHeaderBefore), `markers=${markersBefore}`);
  await mx.getByRole('button', { name: 'Back' }).click();

  await mx.getByRole('button', { name: /Go Undercover/ }).click();
  check('undercover state shown', await hasText(mx, 'Hidden — reveals in', 10000));
  await openMap();
  const markersUndercover = await markerCount();
  check('hunters stay visible while Mister X is undercover',
    markersUndercover > 0, `markers=${markersUndercover}`);
  check('undercover does not change the marker set',
    markersUndercover === markersBefore, `${markersBefore} → ${markersUndercover}`);
  await mx.getByRole('button', { name: 'Back' }).click();
  await dbDelete(`games/${GAME}/fugitive/undercover`); // release for later steps

  // ── 2. stars are gone from the hunter UI ────────────────────────────────
  const r1 = red1.page;
  await r1.getByRole('button', { name: /How to Play/ }).click();
  const red1Text = await textOf(r1);
  check('no star rules in "How to Play"', !red1Text.includes('⭐ Stars'));
  check('no Star Clues section for players', !red1Text.includes('Star Clues'));
  check('shared-circle rule is explained', /One shared circle/.test(red1Text));

  // ── 3. solve a riddle → the whole Red side shares one shrinking circle ───
  await r1.getByRole('button', { name: /Easy/ }).first().click();
  await r1.getByPlaceholder('Your answer…').fill('PARIS');
  await r1.getByRole('button', { name: 'Submit' }).click();

  const zone = await waitForDb(`games/${GAME}/zones/Red`, z => z?.radius != null, 20000);
  const teamsAfter = await dbGet(`games/${GAME}/teams`);
  check('puzzle solved in the UI (challenge advanced)',
    await hasText(r1, 'All riddles solved', 20000) || teamsAfter['Red 1']?.currentRiddle === 1);
  check('Red has one shared zone', zone?.radius === 1950, `radius=${zone?.radius} (expected 2000 × (1 − 5%/2))`);
  check('no per-device hint written', teamsAfter['Red 1']?.currentHint === undefined);
  check('score went to the solving player only', teamsAfter['Red 1']?.score === 10 && teamsAfter['Red 2']?.score === 0);
  check('only the Red side got a circle', await dbGet(`games/${GAME}/zones/Blue`) === null);

  await r1.screenshot({ path: 'verify-screenshots/e2e-red1-solved.png' });

  // ── chat must not yank the reader to the bottom ────────────────────────
  const chat = r1.locator('[data-testid="chat-scroll"]').nth(1); // the big-team pane
  await chat.waitFor({ timeout: 20000 });
  // fill the box so it actually has scrollable history
  for (let i = 0; i < 14; i++) {
    await dbPush(`games/${GAME}/messages/bigteam/Red`, {
      from: 'Red 2',
      text: `history message ${i} — padding so the box has to scroll`,
      timestamp: Date.now() - (30 - i) * 1000,
    });
  }
  await sleep(2000);
  await chat.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await sleep(400);
  const winBefore = await r1.evaluate(() => window.scrollY);
  await dbPush(`games/${GAME}/messages/bigteam/Red`, { from: 'Red 2', text: 'first message', timestamp: Date.now() });
  await sleep(1500);
  check('reading history is not interrupted by a new message',
    (await chat.evaluate(el => el.scrollTop)) < 5,
    `scrollTop=${await chat.evaluate(el => el.scrollTop)}`);
  check('a "new messages" chip appears instead',
    (await r1.locator('[data-testid="chat-new-chip"]').count()) === 1);
  check('the page itself does not jump',
    Math.abs((await r1.evaluate(() => window.scrollY)) - winBefore) < 5);
  await r1.locator('[data-testid="chat-new-chip"]').click();
  await sleep(600);
  check('the chip jumps to the newest message',
    (await chat.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)) < 10);

  // and when already at the bottom it keeps following
  await dbPush(`games/${GAME}/messages/bigteam/Red`, { from: 'Red 2', text: 'second message', timestamp: Date.now() });
  await sleep(1200);
  check('at the bottom it keeps following new messages',
    (await chat.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)) < 10);

  // ── 3b. the other Red phone sees the very same circle ───────────────────
  await red2.page.reload({ waitUntil: 'domcontentloaded' });
  check('Red 2 sees the shared zone card', await hasText(red2.page, 'Red zone active', 20000));
  check('Red 2 shows the same radius and player count',
    await hasText(red2.page, '1950m radius · shared by all 2 players', 10000));
  await red2.page.getByRole('button', { name: /Open Map/ }).click();
  await red2.page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await sleep(1000);
  check('Red 2 map header shows the shared zone',
    await hasText(red2.page, 'Red zone — 1950m radius (shared)', 10000));
  const circleCount = await red2.page.locator('path[stroke="#f5a623"]').count();
  check('Red 2 sees exactly one zone circle', circleCount === 1, `circles=${circleCount}`);
  await red2.page.screenshot({ path: 'verify-screenshots/e2e-red2-map.png' });

  // ── 3c. Blue side has no circle ────────────────────────────────────────
  await blue.page.reload({ waitUntil: 'domcontentloaded' });
  const blueText = await textOf(blue.page);
  check('Blue does not see the Red zone card', !blueText.includes('Red zone active'));
  await blue.page.getByRole('button', { name: /Open Map/ }).click();
  await blue.page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await sleep(800);
  check('Blue map has no zone circle', (await blue.page.locator('path[stroke="#f5a623"]').count()) === 0);
  check('Blue map says no zone yet', await hasText(blue.page, 'No zone yet', 10000));
  await blue.page.getByRole('button', { name: 'Back' }).click();

  // ── 3d. real photo riddle: upload → GM approves → shared zone shrinks ──
  const PHOTO_RIDDLE = {
    0: {
      type: 'photo',
      options: [
        { difficulty: 'easy',   reduction: 0.05, challenge: 'Take a selfie with something red.', requiresText: false },
        { difficulty: 'medium', reduction: 0.10, challenge: 'Photograph a red car.', requiresText: false },
        { difficulty: 'hard',   reduction: 0.15, challenge: 'Red landmark at night.', requiresText: false },
      ],
    },
  };
  await dbPut(`games/${GAME}/riddleSets/Blue 1`, PHOTO_RIDDLE);
  await dbPut(`games/${GAME}/teams/Blue 1/currentRiddle`, 0);

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await blue.page.reload({ waitUntil: 'domcontentloaded' });
  await blue.page.getByRole('button', { name: /Easy/ }).first().click();
  await blue.page.locator('input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: tinyPng });

  const submission = await waitForDb(
    `games/${GAME}/teams/Blue 1/submissions/0`, s => s?.status === 'pending', 30000);
  check('photo riddle upload reaches the DB', submission?.status === 'pending', `status=${submission?.status}`);
  check('photo stored via Storage or database fallback',
    !!submission?.photoUrl || !!submission?.photoRef,
    JSON.stringify({ photoUrl: submission?.photoUrl, photoRef: submission?.photoRef }));
  check('photo riddle advanced the player',
    (await dbGet(`games/${GAME}/teams/Blue 1`))?.currentRiddle === 1);

  // Game Master approves it in the real admin UI. The game list lives on the GM's
  // device now, so seed it the way the dashboard would after creating the game.
  const admin = await device({ latitude: 48.2, longitude: 16.37 });
  await admin.page.addInitScript(({ code }) => {
    try {
      localStorage.setItem(`sy_admin_games:dimitriburyak`, JSON.stringify({ [code]: { status: 'active', gm: 'dimitriburyak' } }));
    } catch { /* ignore */ }
  }, { code: GAME });
  await admin.page.goto(url('/admin'), { waitUntil: 'domcontentloaded' });

  // The app renders only after the anonymous sign-in resolves.
  await admin.page.getByTestId('gm-username').waitFor({ timeout: 30000 }).catch(() => {});
  check('GM login asks for username and password',
    (await admin.page.getByTestId('gm-username').count()) === 1 && (await admin.page.getByTestId('gm-password').count()) === 1);
  await admin.page.getByTestId('gm-username').fill('dimitriburyak');
  await admin.page.getByTestId('gm-password').fill('wrong-password');
  await admin.page.getByTestId('gm-login').click();
  check('wrong GM password is rejected', await hasText(admin.page, 'Wrong username or password', 15000));

  await admin.page.getByTestId('gm-password').fill('scottlandyardirl');
  await admin.page.getByTestId('gm-login').click();
  check('Game Master dashboard opens', await hasText(admin.page, '+ New Game', 25000));
  check('GM is shown by name', await hasText(admin.page, 'Dimitri Buryak', 15000));
  await admin.page.getByRole('button', { name: new RegExp(GAME) }).first().click();
  const approveBtn = admin.page.getByRole('button', { name: 'Approve', exact: true }).first();
  await approveBtn.waitFor({ timeout: 25000 }).catch(() => {});
  await approveBtn.click().catch(() => {});

  const approved = await waitForDb(
    `games/${GAME}/teams/Blue 1/submissions/0`, s => s?.status === 'approved', 25000);
  check('GM approval accepted', approved?.status === 'approved', `status=${approved?.status}`);
  const blueZone = await waitForDb(`games/${GAME}/zones/Blue`, z => z?.radius != null, 20000);
  check('approval shrinks the shared Blue zone (2000 → 1900, solo)',
    blueZone?.radius === 1900, `radius=${blueZone?.radius}`);
  check('approval awards the points', (await dbGet(`games/${GAME}/teams/Blue 1`))?.score === 10);
  await admin.page.screenshot({ path: 'verify-screenshots/e2e-admin-approve.png' });

  // landmark reward is banked, not fired immediately
  await blue.ctx.setGeolocation({ latitude: 48.20848, longitude: 16.37317 }); // Stephansdom
  await blue.page.reload({ waitUntil: 'domcontentloaded' });
  check('landmark challenge opens on arrival', await hasText(blue.page, 'Stephansdom', 30000));
  await blue.page.getByPlaceholder('Your answer…').fill('343');
  await blue.page.getByRole('button', { name: 'Submit' }).click();
  check('landmark solved', await hasText(blue.page, 'item bag', 20000));
  check('landmark reward stored in the bag, not fired',
    (await waitForDb(`games/${GAME}/teamItems/Blue/live_feed`, v => v === 1, 15000)) === 1);
  check('no live feed fired automatically',
    !(await dbGet(`games/${GAME}/teams/Blue 1/liveFeedUntil`)));
  const continueBtn = blue.page.getByRole('button', { name: 'Continue' });
  await continueBtn.click({ timeout: 10000 }).catch(() => {});
  await continueBtn.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

  // players can download their own photos
  await blue.page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  check('an already-solved landmark does not re-open after a refresh',
    (await blue.page.getByPlaceholder('Your answer…').count()) === 0);
  const downloadPromise = blue.page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await blue.page.getByRole('button', { name: /Download our photos/ }).click();
  const download = await downloadPromise;
  check('team can download their own photos', !!download, 'no download event fired');
  if (download) {
    check('zip filename looks right', /\.zip$/i.test(download.suggestedFilename()), download.suggestedFilename());
    const savedPath = await download.path();
    const size = savedPath ? fs.statSync(savedPath).size : 0;
    check('zip is not empty', size > 200, `${size} bytes`);
  }

  // item bag: spend on demand, live compass beacon
  await dbPut(`games/${GAME}/teamItems/Red`, { direction_beacon: 1, live_feed: 1 });
  await r1.reload({ waitUntil: 'domcontentloaded' });
  check('item bag lists collected rewards', await hasText(r1, 'item bag', 20000));
  check('beacon sits in the bag unused', await hasText(r1, 'Direction Beacon', 10000));
  await r1.getByRole('button', { name: 'Use', exact: true }).first().click();
  await waitForDb(`games/${GAME}/teamItems/Red/direction_beacon`, v => (v ?? 0) === 0, 15000);
  check('used item is consumed from the bag',
    ((await dbGet(`games/${GAME}/teamItems/Red/direction_beacon`)) ?? 0) === 0);
  check('beacon applies to the whole side',
    !!(await dbGet(`games/${GAME}/teams/Red 1/directionBeaconUntil`)) &&
    !!(await dbGet(`games/${GAME}/teams/Red 2/directionBeaconUntil`)));
  check('unused live feed stays in the bag',
    ((await dbGet(`games/${GAME}/teamItems/Red/live_feed`)) ?? 0) === 1);

  const arrow = r1.locator('[data-testid="beacon-arrow"]');
  await arrow.waitFor({ timeout: 20000 }).catch(() => {});
  if ((await arrow.count()) === 0) {
    const card = r1.locator('.card', { hasText: 'Direction Beacon' });
    console.log('  DEBUG beacon cards:', await card.count());
    if (await card.count()) {
      console.log('  DEBUG beacon card text:', (await card.first().innerText()).replace(/\s+/g, ' '));
    }
    console.log('  DEBUG fugitive:', JSON.stringify(await dbGet(`games/${GAME}/fugitive/lastUpdate`)));
    console.log('  DEBUG Red 1:', JSON.stringify(await dbGet(`games/${GAME}/teams/Red 1`)));
  }
  const arrowDeg = async () => {
    const style = (await arrow.getAttribute('style')) ?? '';
    const m = style.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
    return m ? Number(m[1]) : NaN;
  };
  const setHeading = (alpha) => r1.evaluate((a) => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'alpha', { value: a });
    Object.defineProperty(e, 'absolute', { value: true });
    window.dispatchEvent(e);
  }, alpha);

  const fugNow = await dbGet(`games/${GAME}/fugitive/lastUpdate`);
  const expected0 = bearingDeg(PRATERSTERN.latitude, PRATERSTERN.longitude, fugNow.lat, fugNow.lng);
  await setHeading(0);
  await sleep(500);
  const deg0 = await arrowDeg();
  check('compass arrow points at Mister X (phone facing north)',
    angleClose(deg0, expected0), `arrow=${deg0} expected=${expected0.toFixed(1)}`);

  await setHeading(180);
  await sleep(500);
  const deg180 = await arrowDeg();
  check('arrow follows the phone orientation',
    angleClose(deg180, (expected0 + 180) % 360), `arrow=${deg180}`);

  // Mister X moves: stop his phone first so his GPS watcher cannot overwrite it
  await mx.goto('about:blank');
  await sleep(700);
  const movedFug = { lat: PRATERSTERN.latitude - 0.012, lng: PRATERSTERN.longitude + 0.004 };
  await dbPatch(`games/${GAME}/fugitive`, { lastUpdate: { ...movedFug, timestamp: Date.now() } });
  await setHeading(0);
  await sleep(1800);
  const degMoved = await arrowDeg();
  const expectedMoved = bearingDeg(PRATERSTERN.latitude, PRATERSTERN.longitude, movedFug.lat, movedFug.lng);
  check('arrow tracks Mister X moving in real time',
    angleClose(degMoved, expectedMoved, 6), `arrow=${degMoved} expected=${expectedMoved.toFixed(1)}`);
  await r1.screenshot({ path: 'verify-screenshots/e2e-beacon.png' });

  // ── 4. selfie demand round-trip ────────────────────────────────────────
  await dbPut(`games/${GAME}/selfieRequest`, {
    requestId: Date.now(),
    requestedBy: 'Red 1',
    requestedByBigTeam: 'Red',
    requestedAt: Date.now(),
    status: 'pending',
    photoUrl: null,
    fulfilledAt: null,
  });
  await mx.goto(url(`/fugitive/${GAME}`), { waitUntil: 'domcontentloaded' });
  check('Mister X receives the selfie demand', await hasText(mx, 'demands a selfie', 20000));

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await mx.locator('input[type="file"]').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: png });

  const fulfilled = await waitForDb(`games/${GAME}/selfieRequest`, r => r?.status === 'fulfilled', 30000);
  check('selfie upload completes', fulfilled?.status === 'fulfilled', `status=${fulfilled?.status}`);
  check('selfie stored somewhere (Storage URL or DB fallback)',
    !!fulfilled?.photoUrl || !!fulfilled?.photoRef,
    JSON.stringify({ photoUrl: fulfilled?.photoUrl, photoRef: fulfilled?.photoRef }));

  if (fulfilled?.photoUrl) {
    const decoded = decodeURIComponent(fulfilled.photoUrl);
    check('selfie stored under photos/{game}/_misterx (encrypted object)',
      decoded.includes('/_misterx/') && decoded.includes('.enc'), decoded.slice(0, 120));
    const img = await fetch(fulfilled.photoUrl);
    check('uploaded selfie object is downloadable', img.status === 200, `HTTP ${img.status}`);
    const bytes = new Uint8Array(await img.arrayBuffer());
    check('stored object is ciphertext, not a readable JPEG',
      !(bytes[0] === 0xFF && bytes[1] === 0xD8), `first bytes ${bytes[0]},${bytes[1]}`);
    check('stored object carries an IV + ciphertext', bytes.length > 12 + 10, `${bytes.length} bytes`);
  } else if (fulfilled?.photoRef) {
    // Storage refused the upload (the project's billing account is closed) —
    // the database fallback took over with an encrypted payload.
    const stored = await dbGet(fulfilled.photoRef);
    check('photo is encrypted at rest (no readable image in the database)',
      typeof stored?.cipher === 'string' && stored.cipher.length > 100 && !!stored.iv && !stored.dataUrl,
      JSON.stringify(Object.keys(stored ?? {})));
    console.log('  info:  Firebase Storage refused (402, billing closed) → encrypted database fallback used.');
  }

  await r1.reload({ waitUntil: 'domcontentloaded' });
  check('Red 1 (demanding side) sees the photo', await hasText(r1, 'Mister X Selfie Received', 20000));
  // The database fallback is loaded lazily, so wait for the <img> to resolve.
  const selfieImg = r1.locator('img[alt="Mister X selfie"]');
  await selfieImg.waitFor({ timeout: 20000 }).catch(() => {});
  check('selfie image rendered for the team', (await selfieImg.count()) === 1);
  await r1.screenshot({ path: 'verify-screenshots/e2e-selfie.png' });

  await mx.screenshot({ path: 'verify-screenshots/e2e-misterx.png' });

  // Game Master creates a game: 6-char code, remembered locally, no public index
  await admin.page.getByRole('button', { name: '+ New Game' }).click();
  await sleep(2500);
  const known = await admin.page.evaluate(() => JSON.parse(localStorage.getItem('sy_admin_games:dimitriburyak') ?? '{}'));
  const createdCode = Object.keys(known).find(c => c !== GAME);
  check('GM can create a game from the dashboard', !!createdCode, JSON.stringify(Object.keys(known)));
  if (createdCode) {
    check('game code is 6 characters', /^[A-Z0-9]{6}$/.test(createdCode), createdCode);
    const createdGame = await dbGet(`games/${createdCode}`);
    check('created game exists in the database', createdGame?.status === 'waiting');
    check('created game records its Game Master', createdGame?.gm === 'dimitriburyak', String(createdGame?.gm));
    if (createdGame?.fugitiveCode) await dbDelete(`fugitiveCodes/${createdGame.fugitiveCode}`);
    await dbDelete(`games/${createdCode}`);
  }
  check('live games cannot be listed publicly', (await fetch(api('games'))).status === 401);
} finally {
  // ── cleanup ───────────────────────────────────────────────────────────────
  try {
    const req = await dbGet(`games/${GAME}/selfieRequest`);
    if (req?.photoUrl) {
      const m = req.photoUrl.match(/\/o\/([^?]+)/);
      if (m) await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${m[1]}`, { method: 'DELETE' });
    }
    await dbDelete(`photos/${GAME}`);
  } catch { /* best effort */ }
  await dbDelete(`games/${GAME}`);
  await browser.close();
}

if (blocked.length) {
  console.log('\nBLOCKED by the Firebase project (not fixable in code):');
  blocked.forEach(b => console.log(`  !  ${b}`));
}
console.log(`\n${failures.length === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${failures.length} failed, ${blocked.length} blocked`);
if (consoleErrors.length) {
  console.log('\nBrowser console errors:');
  [...new Set(consoleErrors)].slice(0, 12).forEach(e => console.log('  •', e));
}
process.exit(failures.length === 0 ? 0 : 1);
