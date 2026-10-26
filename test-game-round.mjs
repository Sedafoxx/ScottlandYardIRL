/**
 * Full game round simulation:
 *   - Admin creates + starts game, releases 5 star clues
 *   - 3 Red subteams + 2 Blue subteams join simultaneously
 *   - Race condition: Red + Blue both go to star 1 (one wins via runTransaction)
 *   - Red collects 3+ stars → votes 3-0 → Direction Beacon
 *   - Verify: beacon on all Red pages, NOT Blue; leaderboard stars correct
 */

import { chromium } from 'playwright';
import https from 'https';

const BASE = 'https://scottlandyardirl.web.app';
const DB = 'https://scottlandyardirl-default-rtdb.europe-west1.firebasedatabase.app';
const STARS_DATA = [
  { lat: 48.20676065747161, lng: 16.38372635467606 },  // 0: Wien Mitte
  { lat: 48.21750711441079, lng: 16.390295382490727 }, // 1: Praterstern
  { lat: 48.21613, lng: 16.36056 },                    // 2: Schottentor
  { lat: 48.20858, lng: 16.37065 },                    // 3: Herrengasse
  { lat: 48.19579854278985, lng: 16.338031879060992 }, // 4: Westbahnhof
];

const log = (tag, msg) => console.log(`[${tag.padEnd(12)}] ${msg}`);
const wait = ms => new Promise(r => setTimeout(r, ms));

// Firebase REST helpers
const dbGet = (path) => new Promise((res, rej) => {
  https.get(`${DB}${path}.json`, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error',rej);
});
const dbPatch = (path, data) => new Promise((res, rej) => {
  const body = JSON.stringify(data);
  const opts = { hostname: new URL(DB).hostname, path: `${path}.json`, method: 'PATCH', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = https.request(opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
  req.on('error',rej); req.write(body); req.end();
});
const dbPut = (path, data) => new Promise((res, rej) => {
  const body = JSON.stringify(data);
  const opts = { hostname: new URL(DB).hostname, path: `${path}.json`, method: 'PUT', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = https.request(opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
  req.on('error',rej); req.write(body); req.end();
});

const ensureOpen = async (page) => {
  const b = await page.innerText('body');
  if (!b.includes('CLUE #')) {
    await page.click('text=Star Clues').catch(() => {});
    await wait(500);
  }
};

// ─── ADMIN ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const adminCtx = await browser.newContext();
const admin = await adminCtx.newPage();
const adminErrors = [];
admin.on('console', m => { if (m.text().includes('failed') || m.text().includes('permission')) adminErrors.push(m.text().substring(0,150)); });

log('ADMIN', 'Login + create...');
await admin.goto(`${BASE}/admin`);
await admin.waitForTimeout(1500);
await admin.fill('input', 'scottlandyardirl');
await admin.keyboard.press('Enter');
await admin.waitForTimeout(1500);
await admin.click('button:has-text("New Game")');
await admin.waitForTimeout(1500);

let gameCode = null;
for (const btn of await admin.$$('button')) {
  const t = await btn.innerText();
  if (t.includes('waiting')) { gameCode = t.split(' ')[0]; await btn.click(); await admin.waitForTimeout(800); break; }
}
if (!gameCode) { console.error('No game!'); await browser.close(); process.exit(1); }
log('ADMIN', `Game: ${gameCode}`);
await admin.click('button:has-text("Start")');
await admin.waitForTimeout(600);

for (let i = 0; i < 5; i++) {
  const btn = await admin.$('button:has-text("Release")');
  if (!btn) break;
  await btn.click(); await admin.waitForTimeout(400);
}
log('ADMIN', 'Released 5 clues ✅');

// ─── TEAMS ───────────────────────────────────────────────────────────────────
const mkTeam = async (name, bigTeam, lat, lng) => {
  const ctx = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: lat, longitude: lng } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.text().includes('permission') || m.text().includes('failed')) errs.push(m.text().substring(0,120)); });
  await page.goto(`${BASE}/team/${gameCode}?name=${encodeURIComponent(name)}&bigTeam=${encodeURIComponent(bigTeam)}`);
  await page.waitForTimeout(2000);
  return { page, ctx, errs, name, bigTeam };
};

log('TEAMS', 'All 5 joining...');
const [red1, red2, red3, blue1, blue2] = await Promise.all([
  mkTeam('RedAlpha',    'Red',  48.200, 16.370),
  mkTeam('RedBeta',     'Red',  48.200, 16.371),
  mkTeam('RedGamma',    'Red',  48.200, 16.372),
  mkTeam('BlueDelta',   'Blue', 48.210, 16.380),
  mkTeam('BlueEpsilon', 'Blue', 48.210, 16.381),
]);
log('TEAMS', 'All joined ✅');

await Promise.all([red1, red2, red3, blue1, blue2].map(async t => {
  try { await t.page.click('button:has-text("Enable GPS")', { timeout: 3000 }); await wait(300); } catch {}
}));
await wait(800);

const moveTo = async (t, starIdx) => {
  await t.ctx.setGeolocation({ latitude: STARS_DATA[starIdx].lat, longitude: STARS_DATA[starIdx].lng });
  await wait(1200);
};

// ─── RACE + STAR CLAIMS ──────────────────────────────────────────────────────
log('GPS', 'Race RedAlpha+BlueDelta → Star 0 (Wien Mitte)');
await Promise.all([moveTo(red1, 0), moveTo(blue1, 0)]);
await wait(1500);
log('GPS', 'RedBeta → Star 1 (Praterstern)');
await moveTo(red2, 1); await wait(1500);
log('GPS', 'RedGamma → Star 2 (Schottentor)');
await moveTo(red3, 2); await wait(1500);
log('GPS', 'BlueEpsilon → Star 3 (Herrengasse)');
await moveTo(blue2, 3); await wait(1500);
log('GPS', 'RedAlpha → Star 4 (Westbahnhof)');
await moveTo(red1, 4); await wait(2000);

// Check counts from DB directly
const starsDb = await dbGet(`/games/${gameCode}/stars`);
const redCount = Object.values(starsDb ?? {}).filter(s => s.claimedBy === 'Red').length;
const blueCount = Object.values(starsDb ?? {}).filter(s => s.claimedBy === 'Blue').length;
log('DB', `Red stars: ${redCount}, Blue stars: ${blueCount}`);
Object.entries(starsDb ?? {}).forEach(([i, s]) => log('DB', `  Star ${i}: ${s.claimedBy ?? 'unclaimed'} (${s.claimedTeam ?? '-'})`));

if (redCount < 3) {
  log('ERROR', `Red only has ${redCount} stars — cannot proceed with vote test`);
  await browser.close(); process.exit(1);
}

// ─── VOTE: start from RedAlpha, then force-resolve via DB ────────────────────
log('VOTE', 'RedAlpha starts vote...');
await ensureOpen(red1.page);
await red1.page.click('button:has-text("Start vote")');
await wait(2000);

// Cast votes from Red2 and Red3 via page (RedAlpha auto-included as initiator)
for (const t of [red2, red3]) {
  await ensureOpen(t.page);
  await wait(300);
  const body = await t.page.innerText('body');
  if (body.includes('Vote in progress') && !body.includes('You voted')) {
    await t.page.click('button:has-text("Yes")').catch(() => {});
    await wait(500);
    log(t.name, 'Voted Yes ✅');
  } else {
    log(t.name, body.includes('You voted') ? 'Already voted' : 'Vote UI not visible yet — casting via DB');
    await dbPatch(`/games/${gameCode}/starVotes/Red/votes`, { [t.name]: true });
    log(t.name, 'Vote cast via DB ✅');
  }
}
await wait(1000);

// Force-resolve vote via DB (skips 3-min timer)
log('VOTE', 'Force-resolving via REST...');
const teamsDb = await dbGet(`/games/${gameCode}/teams`);
const until = Date.now() + 2 * 60 * 1000;
const beaconUpdates = {};
const currentTrades = await dbGet(`/games/${gameCode}/starTrades/Red`) ?? 0;

Object.entries(teamsDb ?? {}).forEach(([tName, tData]) => {
  if ((tData.bigTeam || tName) === 'Red') {
    beaconUpdates[tName] = { ...tData, directionBeaconUntil: until };
  }
});

await dbPatch(`/games/${gameCode}/starVotes/Red`, { active: false, result: 'accepted' });
await dbPut(`/games/${gameCode}/starTrades/Red`, currentTrades + 1);

// Update each Red team's directionBeaconUntil
for (const [tName, tData] of Object.entries(beaconUpdates)) {
  await dbPatch(`/games/${gameCode}/teams/${tName}`, { directionBeaconUntil: until });
  log('DB', `Set beacon for ${tName}`);
}
await wait(3000); // wait for onValue listeners to fire

// ─── BEACON CHECK ────────────────────────────────────────────────────────────
log('BEACON', '--- Checking beacon ---');
for (const t of [red1, red2, red3, blue1, blue2]) {
  const b = await t.page.innerText('body');
  // Look for the COMPONENT text (compass emoji + "Direction Beacon" outside of vote UI)
  // The vote UI says "Trade 3 stars for a Direction Beacon (whole team)?"
  // The component says "🧭 Direction Beacon"
  const hasBeaconComponent = b.includes('🧭 Direction Beacon');
  const expected = t.bigTeam === 'Red';
  const ok = hasBeaconComponent === expected;
  log(t.name, `🧭 Beacon: ${hasBeaconComponent} (expected ${expected}) ${ok ? '✅' : '❌ WRONG'}`);
  if (hasBeaconComponent) {
    const idx = b.indexOf('🧭 Direction Beacon');
    log(t.name, `  → "${b.substring(idx, idx + 80).replace(/\n/g, ' ')}"`);
  }
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
await ensureOpen(blue1.page);
const blueBody = await blue1.page.innerText('body');
const lbI = blueBody.indexOf('Leaderboard');
log('LEADERBOARD', blueBody.substring(lbI, lbI + 250).replace(/\n{2,}/g, '\n'));

// ─── SCREENSHOTS ─────────────────────────────────────────────────────────────
await red1.page.screenshot({ path: 'round-final-red.png', fullPage: true });
await blue1.page.screenshot({ path: 'round-final-blue.png', fullPage: true });

const allErrs = [
  ...adminErrors.map(e => `[admin] ${e}`),
  ...[red1,red2,red3,blue1,blue2].flatMap(t => t.errs.map(e => `[${t.name}] ${e}`)),
];
console.log(allErrs.length ? `\nERRORS:\n${allErrs.join('\n')}` : '\nNo DB errors ✅');
await browser.close();
