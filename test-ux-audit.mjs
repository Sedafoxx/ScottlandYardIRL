/**
 * UX audit — screenshot every key screen a real player sees
 */
import { chromium } from 'playwright';
import https from 'https';

const BASE = 'https://scottlandyardirl.web.app';
const DB = 'https://scottlandyardirl-default-rtdb.europe-west1.firebasedatabase.app';

const dbGet = (path) => new Promise((res, rej) => {
  https.get(`${DB}${path}.json`, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error',rej);
});
const encPath = p => p.split('/').map((s,i) => i===0 ? s : encodeURIComponent(s)).join('/');
const dbPatch = (path, data) => new Promise((res, rej) => {
  const body = JSON.stringify(data);
  const opts = { hostname: new URL(DB).hostname, path: `${encPath(path)}.json`, method: 'PATCH', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = https.request(opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
  req.on('error',rej); req.write(body); req.end();
});
const dbPut = (path, data) => new Promise((res, rej) => {
  const body = JSON.stringify(data);
  const opts = { hostname: new URL(DB).hostname, path: `${encPath(path)}.json`, method: 'PUT', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
  const req = https.request(opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
  req.on('error',rej); req.write(body); req.end();
});
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });

// Setup game
const adminCtx = await browser.newContext();
const admin = await adminCtx.newPage();
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

// Get fugitive code
const fcodes = await dbGet('/fugitiveCodes');
let fugCode = null;
for (const [code, gcode] of Object.entries(fcodes ?? {})) {
  if (gcode === gameCode) { fugCode = code; break; }
}

console.log(`Game: ${gameCode}, FugCode: ${fugCode}`);

// ── SCREEN 1: Home page ───────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14 size
const page = await ctx.newPage();
await page.goto(BASE);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'ux-01-home.png', fullPage: true });

// ── SCREEN 2: Home with team name filled (subteam field visible) ──────────
await page.fill('input[placeholder="Big team name (e.g. Red, Blue)"]', 'Red');
await page.waitForTimeout(400);
await page.screenshot({ path: 'ux-02-home-filled.png', fullPage: true });

// ── SCREEN 3: Home with everything filled ────────────────────────────────
await page.fill('input[placeholder="Game code (from admin)"]', gameCode);
await page.fill('input[placeholder="Subteam number (optional)"]', '1');
await page.waitForTimeout(300);
await page.screenshot({ path: 'ux-03-home-ready.png', fullPage: true });

// ── SCREEN 4: Waiting room (game not started yet) ─────────────────────────
await page.click('button:has-text("Join Hunt")');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'ux-04-waiting.png', fullPage: true });

// Start game + release 3 clues
await admin.click('button:has-text("Start")');
await admin.waitForTimeout(600);
for (let i = 0; i < 3; i++) {
  const btn = await admin.$('button:has-text("Release")');
  if (btn) { await btn.click(); await admin.waitForTimeout(400); }
}

await page.waitForTimeout(2000);
// ── SCREEN 5: Active team page (top) ─────────────────────────────────────
await page.screenshot({ path: 'ux-05-team-active-top.png' });

// ── SCREEN 6: How to Play expanded ───────────────────────────────────────
await page.click('text=How to Play');
await page.waitForTimeout(300);
await page.screenshot({ path: 'ux-06-how-to-play.png', fullPage: true });
await page.click('text=How to Play'); // close

// ── SCREEN 7: Star clues section expanded ────────────────────────────────
await page.click('text=Star Clues');
await page.waitForTimeout(400);
await page.screenshot({ path: 'ux-07-star-clues.png', fullPage: true });

// ── SCREEN 8: Leaderboard ─────────────────────────────────────────────────
// Add a blue team so leaderboard is interesting
const blueCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const bluePage = await blueCtx.newPage();
await bluePage.goto(`${BASE}/team/${gameCode}?name=Blue 1&bigTeam=Blue`);
await bluePage.waitForTimeout(2000);
// Give Blue a star + score
await dbPatch(`/games/${gameCode}/stars/0`, { claimedBy: 'Blue', claimedTeam: 'Blue 1', claimedAt: Date.now(), released: true, releasedAt: Date.now() });
await dbPatch(`/games/${gameCode}/teams/Blue 1`, { score: 30, bigTeam: 'Blue' });
await dbPatch(`/games/${gameCode}/teams/Red 1`, { score: 10, bigTeam: 'Red' });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'ux-08-leaderboard.png', fullPage: true });

// ── SCREEN 9: Star claimed popup (inject via DB) ──────────────────────────
await dbPatch(`/games/${gameCode}/stars/1`, { claimedBy: 'Red', claimedTeam: 'Red 1', claimedAt: Date.now(), released: true, releasedAt: Date.now() });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'ux-09-star-popup.png', fullPage: true });

// ── SCREEN 10: Vote UI (give Red 3 stars, open vote) ─────────────────────
await dbPatch(`/games/${gameCode}/stars/2`, { claimedBy: 'Red', claimedTeam: 'Red 1', claimedAt: Date.now(), released: true, releasedAt: Date.now() });
await page.waitForTimeout(1500);
await page.click('text=Star Clues').catch(() => {});
await page.waitForTimeout(400);
const canVote = (await page.innerText('body')).includes('Start vote');
if (canVote) {
  await page.click('button:has-text("Start vote")');
  await page.waitForTimeout(1500);
}
await page.click('text=Star Clues').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: 'ux-10-vote-ui.png', fullPage: true });

// ── SCREEN 11: Direction Beacon active ───────────────────────────────────
const until = Date.now() + 5 * 60 * 1000;
await dbPatch(`/games/${gameCode}/teams/Red 1`, { directionBeaconUntil: until });
// Set fugitive position so beacon shows direction
await dbPut(`/games/${gameCode}/fugitive/lastUpdate`, { lat: 48.2175, lng: 16.3903, timestamp: Date.now() });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'ux-11-beacon.png', fullPage: true });

// ── SCREEN 12: Fugitive page ──────────────────────────────────────────────
const fugCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation'],
  geolocation: { latitude: 48.2100, longitude: 16.3700 }
});
const fugPage = await fugCtx.newPage();
await fugPage.goto(`${BASE}/fugitive/${gameCode}`);
await fugPage.waitForTimeout(3000);
await fugPage.screenshot({ path: 'ux-12-fugitive.png', fullPage: true });

// ── SCREEN 13: Admin page (game active) ──────────────────────────────────
await admin.screenshot({ path: 'ux-13-admin.png', fullPage: true });

// ── SCREEN 14: Map page ───────────────────────────────────────────────────
const mapCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation'],
  geolocation: { latitude: 48.2100, longitude: 16.3700 }
});
const mapPage = await mapCtx.newPage();
await mapPage.goto(`${BASE}/map/${gameCode}?name=Red 1&bigTeam=Red`);
await mapPage.waitForTimeout(3000);
await mapPage.screenshot({ path: 'ux-14-map.png', fullPage: true });

console.log('All screenshots saved.');
await browser.close();
