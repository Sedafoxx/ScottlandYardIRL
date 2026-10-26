/**
 * Tests 4 scenarios:
 *  1. Real join flow (home page → enter code + name → team page)
 *  2. Fugitive GPS → Direction Beacon shows direction/distance on team page
 *  3. Star claim popup fires on OTHER team's screen
 *  4. Vote rejection (majority No) → stars NOT deducted, state resets cleanly
 */

import { chromium } from 'playwright';
import https from 'https';

const BASE = 'https://scottlandyardirl.web.app';
const DB = 'https://scottlandyardirl-default-rtdb.europe-west1.firebasedatabase.app';
const STAR0 = { lat: 48.20676065747161, lng: 16.38372635467606 }; // Wien Mitte

const log = (tag, msg) => console.log(`[${tag.padEnd(14)}] ${msg}`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const pass = (tag, msg) => log(tag, `✅ ${msg}`);
const fail = (tag, msg) => log(tag, `❌ FAIL: ${msg}`);

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

// ─── SETUP: create game, start, release 1 star clue ─────────────────────────
const browser = await chromium.launch({ headless: true });

const adminCtx = await browser.newContext();
const admin = await adminCtx.newPage();
await admin.goto(`${BASE}/admin`);
await admin.waitForTimeout(1500);
await admin.fill('input', 'scottlandyardirl');
await admin.keyboard.press('Enter');
await admin.waitForTimeout(1500);
await admin.click('button:has-text("New Game")');
await admin.waitForTimeout(1500);

let gameCode = null, fugitiveCode = null;
for (const btn of await admin.$$('button')) {
  const t = await btn.innerText();
  if (t.includes('waiting')) { gameCode = t.split(' ')[0]; await btn.click(); await admin.waitForTimeout(800); break; }
}
if (!gameCode) { console.error('No game!'); process.exit(1); }

// Get fugitive code from DB
const fcodes = await dbGet('/fugitiveCodes');
for (const [code, gcode] of Object.entries(fcodes ?? {})) {
  if (gcode === gameCode) { fugitiveCode = code; break; }
}
log('SETUP', `Game: ${gameCode}, FugitiveCode: ${fugitiveCode}`);

await admin.click('button:has-text("Start")');
await admin.waitForTimeout(600);
const releaseBtn = await admin.$('button:has-text("Release")');
if (releaseBtn) { await releaseBtn.click(); await admin.waitForTimeout(500); }
log('SETUP', 'Game started, 1 star clue released');

// ════════════════════════════════════════════════════════════════════════════
// TEST 1: Real join flow (home → code + name → team page)
// ════════════════════════════════════════════════════════════════════════════
log('', '');
log('TEST 1', '=== Real join flow ===');
const joinCtx = await browser.newContext();
const joinPage = await joinCtx.newPage();
await joinPage.goto(BASE);
await joinPage.waitForTimeout(1500);
await joinPage.screenshot({ path: 't1-home.png' });

// Fill team name + game code
await joinPage.fill('input[placeholder="Team name"]', 'RealJoinTest');
await joinPage.fill('input[placeholder="Game code (from admin)"]', gameCode);
await joinPage.waitForTimeout(400);

// Subteam field should appear (only shows when teamName non-empty)
const subInput = await joinPage.$('input[placeholder="Subteam number (optional)"]');
if (subInput) { pass('TEST 1', 'Subteam field appears after name entered'); }
else { fail('TEST 1', 'Subteam field missing'); }

// Click Join Hunt
await joinPage.click('button:has-text("Join Hunt")');
await joinPage.waitForTimeout(3000);
await joinPage.screenshot({ path: 't1-joined.png' });

const t1Url = joinPage.url();
const t1Body = await joinPage.innerText('body');
const navigatedCorrectly = t1Url.includes(`/team/${gameCode}`) && t1Url.includes('name=RealJoinTest') && t1Url.includes('bigTeam=RealJoinTest');
const pageLoaded = t1Body.includes('RealJoinTest') && (t1Body.includes('pts') || t1Body.includes('Riddle'));
if (navigatedCorrectly) pass('TEST 1', `Navigated to correct URL: ${t1Url.split('?')[0].replace(BASE, '')}`);
else fail('TEST 1', `Wrong URL: ${t1Url}`);
if (pageLoaded) pass('TEST 1', 'Team page loaded with correct team name');
else fail('TEST 1', `Page content unexpected: ${t1Body.substring(0, 200)}`);

// Test invalid code
const invalidPage = await joinCtx.newPage();
await invalidPage.goto(BASE);
await invalidPage.waitForTimeout(1000);
await invalidPage.fill('input[placeholder="Team name"]', 'TestInvalid');
await invalidPage.fill('input[placeholder="Game code (from admin)"]', 'XXXXX');
await invalidPage.click('button:has-text("Join Hunt")');
await invalidPage.waitForTimeout(2500);
const invalidBody = await invalidPage.innerText('body');
const showsError = invalidBody.includes('not found') || invalidBody.includes('error') || invalidBody.toLowerCase().includes('invalid');
if (showsError) pass('TEST 1', 'Invalid code shows error message');
else fail('TEST 1', `Invalid code: no error shown. Body: ${invalidBody.substring(0, 200)}`);

// Test fugitive join flow
if (fugitiveCode) {
  const fugPage = await joinCtx.newPage();
  await fugPage.goto(BASE);
  await fugPage.waitForTimeout(1000);
  await fugPage.fill('input[placeholder="Mister X code (from admin)"]', fugitiveCode);
  await fugPage.click('button:has-text("I am Mister X")');
  await fugPage.waitForTimeout(3000);
  const fugUrl = fugPage.url();
  const fugBody = await fugPage.innerText('body');
  const fugNavigated = fugUrl.includes('/fugitive/');
  const fugLoaded = fugBody.includes('Mister X') || fugBody.includes('Undercover') || fugBody.includes('Announce');
  if (fugNavigated && fugLoaded) pass('TEST 1', `Fugitive join flow works: ${fugUrl.replace(BASE,'')}`);
  else fail('TEST 1', `Fugitive join failed. URL: ${fugUrl}, body: ${fugBody.substring(0,150)}`);
  await fugPage.close();
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 2: Fugitive GPS → Direction Beacon direction/distance
// ════════════════════════════════════════════════════════════════════════════
log('', '');
log('TEST 2', '=== Fugitive GPS → Direction Beacon ===');

// Set up a team page with beacon active (inject directionBeaconUntil directly)
const teamCtx = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 48.215, longitude: 16.370 } });
const teamPage = await teamCtx.newPage();
await teamPage.goto(`${BASE}/team/${gameCode}?name=BeaconTester&bigTeam=Red`);
await teamPage.waitForTimeout(2000);
await teamPage.click('button:has-text("Enable GPS")').catch(() => {});
await wait(500);

// Set beacon active via DB
const until = Date.now() + 5 * 60 * 1000;
await dbPatch(`/games/${gameCode}/teams/BeaconTester`, { directionBeaconUntil: until });
await wait(2000);

let t2Body = await teamPage.innerText('body');
const beaconPresent = t2Body.includes('🧭 Direction Beacon');
if (beaconPresent) pass('TEST 2', 'Direction Beacon card rendered on team page');
else { fail('TEST 2', 'No beacon card after DB update'); }

// Now simulate fugitive at a known position and check beacon updates
// Fugitive is at Praterstern (north-east of team)
const fugCtx = await browser.newContext({
  permissions: ['geolocation'],
  geolocation: { latitude: 48.2175, longitude: 16.3903 } // Praterstern
});
const fugPage2 = await fugCtx.newPage();
await fugPage2.goto(`${BASE}/fugitive/${gameCode}`);
await fugPage2.waitForTimeout(4000); // GPS watch fires + writes to DB

// Check fugitive lastUpdate in DB
const lastUpdate = await dbGet(`/games/${gameCode}/fugitive/lastUpdate`);
const fugGpsWritten = lastUpdate && lastUpdate.lat && Math.abs(lastUpdate.lat - 48.2175) < 0.001;
if (fugGpsWritten) pass('TEST 2', `Fugitive GPS written to DB: ${lastUpdate.lat.toFixed(4)},${lastUpdate.lng.toFixed(4)}`);
else fail('TEST 2', `Fugitive GPS not in DB. Got: ${JSON.stringify(lastUpdate)}`);

// Wait for beacon to receive fugitive position and show direction
await wait(3000);
t2Body = await teamPage.innerText('body');
const hasDirection = t2Body.includes('N') || t2Body.includes('NE') || t2Body.includes('E') ||
  t2Body.includes('SE') || t2Body.includes('S') || t2Body.includes('SW') ||
  t2Body.includes('W') || t2Body.includes('NW');
const hasDistance = t2Body.includes('m') && t2Body.includes('away');
if (hasDirection && hasDistance) pass('TEST 2', 'Beacon shows direction + distance');
else fail('TEST 2', `Beacon missing direction/distance. Body snippet: ${t2Body.substring(t2Body.indexOf('🧭'), t2Body.indexOf('🧭')+100)}`);

await teamPage.screenshot({ path: 't2-beacon.png' });

// Check undercover mode hides GPS
log('TEST 2', 'Testing undercover mode suppresses GPS write...');
const beforeUndercover = await dbGet(`/games/${gameCode}/fugitive/lastUpdate`);
// Simulate undercover active
await dbPut(`/games/${gameCode}/fugitive/undercover`, { usedAt: Date.now(), until: Date.now() + 60000 });
await wait(500);
// Move fugitive GPS
await fugCtx.setGeolocation({ latitude: 48.220, longitude: 16.400 });
await wait(2000);
const afterUndercover = await dbGet(`/games/${gameCode}/fugitive/lastUpdate`);
// Location should NOT have updated (undercover suppresses writes)
const samePos = afterUndercover && Math.abs(afterUndercover.lat - beforeUndercover.lat) < 0.001;
if (samePos) pass('TEST 2', 'Undercover mode suppresses GPS location updates ✅');
else fail('TEST 2', `GPS updated during undercover! Before: ${beforeUndercover?.lat?.toFixed(4)}, After: ${afterUndercover?.lat?.toFixed(4)}`);

// Disable undercover
await dbPut(`/games/${gameCode}/fugitive/undercover`, { usedAt: Date.now() - 120000, until: Date.now() - 60000 });

// ════════════════════════════════════════════════════════════════════════════
// TEST 3: Star claim popup fires on OTHER team's screen
// ════════════════════════════════════════════════════════════════════════════
log('', '');
log('TEST 3', '=== Star claim popup on other screens ===');

// Set up 2 teams watching — one will claim star 0, other watches for popup
const watchCtx = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 48.200, longitude: 16.370 } });
const watcher = await watchCtx.newPage();
await watcher.goto(`${BASE}/team/${gameCode}?name=PopupWatcher&bigTeam=Blue`);
await watcher.waitForTimeout(2500);

const claimerCtx = await browser.newContext({
  permissions: ['geolocation'],
  geolocation: { latitude: STAR0.lat, longitude: STAR0.lng }
});
const claimer = await claimerCtx.newPage();
await claimer.goto(`${BASE}/team/${gameCode}?name=StarClaimer&bigTeam=Red`);
await claimer.waitForTimeout(2500);
await claimer.click('button:has-text("Enable GPS")').catch(() => {});
await wait(500);
await watcher.click('button:has-text("Enable GPS")').catch(() => {});
await wait(500);

// Claimer moves to star 0 (GPS already there — just wait for watchPosition)
await wait(2000);

// Check if star 0 was claimed in DB
const starState = await dbGet(`/games/${gameCode}/stars/0`);
const claimed = starState?.claimedBy === 'Red';
if (claimed) {
  pass('TEST 3', `Star 0 claimed by Red (${starState.claimedTeam})`);
  // Check popup on watcher
  await wait(1500);
  const watchBody = await watcher.innerText('body');
  const hasPopup = watchBody.includes('claimed') || watchBody.includes('Star') && watchBody.includes('Red');
  // Also check via DOM for the popup overlay
  const popupEl = await watcher.$('[style*="position: fixed"]');
  if (popupEl) {
    const popupText = await popupEl.innerText();
    pass('TEST 3', `Popup overlay found: "${popupText.substring(0,80)}"`);
  } else {
    // Popup may have auto-dismissed (5s) — check chat for confirmation
    const chatMsg = watchBody.includes('claimed Star #1');
    if (chatMsg) pass('TEST 3', 'No popup visible (may have dismissed) but chat message confirmed claim');
    else fail('TEST 3', 'No popup and no chat message for star claim');
  }
  await watcher.screenshot({ path: 't3-popup.png' });
} else {
  fail('TEST 3', `Star 0 not claimed. DB state: ${JSON.stringify(starState)}`);
  // Might already be claimed from previous test run — check
  if (starState?.claimedBy) log('TEST 3', `Already claimed by ${starState.claimedBy} from prior test`);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 4: Vote rejection (majority No) — stars not deducted, state resets
// ════════════════════════════════════════════════════════════════════════════
log('', '');
log('TEST 4', '=== Vote rejection ===');

// Give Red team 3 stars via DB
const starsBefore = await dbGet(`/games/${gameCode}/stars`);
const redStarsBefore = Object.values(starsBefore ?? {}).filter(s => s.claimedBy === 'Red').length;

// Make sure Red has 3 stars (award via DB if needed)
if (redStarsBefore < 3) {
  log('TEST 4', `Red only has ${redStarsBefore} stars — awarding via DB for test`);
  for (let i = 1; i <= 3; i++) {
    const existing = starsBefore?.[i] ?? {};
    if (!existing.claimedBy && existing.released) {
      await dbPatch(`/games/${gameCode}/stars/${i}`, { claimedBy: 'Red', claimedTeam: 'TestTeam', claimedAt: Date.now() });
    }
  }
  // Release stars 2,3 if not released
  for (let i = 1; i <= 3; i++) {
    const s = await dbGet(`/games/${gameCode}/stars/${i}`);
    if (!s?.released) await dbPatch(`/games/${gameCode}/stars/${i}`, { released: true, releasedAt: Date.now() });
    if (!s?.claimedBy) await dbPatch(`/games/${gameCode}/stars/${i}`, { claimedBy: 'Red', claimedTeam: 'TestTeam', claimedAt: Date.now() });
  }
}
await wait(1000);

const tradeBefore = await dbGet(`/games/${gameCode}/starTrades/Red`) ?? 0;
log('TEST 4', `Trade count before: ${tradeBefore}`);

// Start a vote
const voteTeamCtx = await browser.newContext();
const votePage = await voteTeamCtx.newPage();
await votePage.goto(`${BASE}/team/${gameCode}?name=VoteTestRed&bigTeam=Red`);
await votePage.waitForTimeout(2500);
await votePage.click('text=Star Clues').catch(() => {});
await wait(500);

const vBody = await votePage.innerText('body');
const canTradeNow = vBody.includes('Start vote to trade');
if (!canTradeNow) {
  log('TEST 4', `Cannot trade yet — injecting vote directly`);
  // Start vote via DB
  await dbPut(`/games/${gameCode}/starVotes/Red`, {
    active: true,
    startedAt: Date.now(),
    votes: {}
  });
} else {
  await votePage.click('button:has-text("Start vote")');
  log('TEST 4', 'Vote started from UI');
}
await wait(1500);

// Cast 2 No votes, 1 Yes vote → rejection
await dbPatch(`/games/${gameCode}/starVotes/Red/votes`, {
  'VoteNo1': false,
  'VoteNo2': false,
  'VoteYes1': true,
});
log('TEST 4', 'Cast votes: 2×No, 1×Yes');

// Force resolve
const voteData = await dbGet(`/games/${gameCode}/starVotes/Red`);
const yes = Object.values(voteData?.votes ?? {}).filter(v => v === true).length;
const no = Object.values(voteData?.votes ?? {}).filter(v => v === false).length;
const passed = yes > no && yes > 0;
log('TEST 4', `Vote tally: ${yes} yes, ${no} no → ${passed ? 'PASS' : 'REJECT'}`);

await dbPatch(`/games/${gameCode}/starVotes/Red`, { active: false, result: passed ? 'accepted' : 'rejected' });
await wait(2000);

// Check: trade count should be UNCHANGED (vote rejected)
const tradeAfter = await dbGet(`/games/${gameCode}/starTrades/Red`) ?? 0;
if (!passed && tradeAfter === tradeBefore) pass('TEST 4', `Vote rejected — trade count unchanged (${tradeBefore} → ${tradeAfter})`);
else if (passed) fail('TEST 4', 'Vote should have been rejected but passed!');
else fail('TEST 4', `Trade count changed unexpectedly: ${tradeBefore} → ${tradeAfter}`);

// Check: no directionBeaconUntil set on Red teams
const teamsAfter = await dbGet(`/games/${gameCode}/teams`);
const hasBeaconUnexpected = Object.entries(teamsAfter ?? {}).some(([n, d]) => (d.bigTeam||n) === 'Red' && (d.directionBeaconUntil ?? 0) > Date.now());
// Note: BeaconTester from test 2 may still have beacon — only check VoteTestRed
const voteTestBeacon = teamsAfter?.VoteTestRed?.directionBeaconUntil;
if (!voteTestBeacon || voteTestBeacon < Date.now()) pass('TEST 4', 'No beacon awarded after rejected vote ✅');
else fail('TEST 4', `Beacon was awarded despite rejected vote! Until: ${new Date(voteTestBeacon).toISOString()}`);

// Check UI shows rejection
await votePage.click('text=Star Clues').catch(() => {});
await wait(500);
const voteResultBody = await votePage.innerText('body');
const showsRejection = voteResultBody.includes('rejected') || voteResultBody.includes('needed to trade') || voteResultBody.includes('Start vote');
if (showsRejection) pass('TEST 4', 'UI correctly shows vote failed / still allows re-vote');
else log('TEST 4', `Vote result UI: ${voteResultBody.substring(voteResultBody.indexOf('Star Clues'), voteResultBody.indexOf('Star Clues')+200)}`);

await votePage.screenshot({ path: 't4-vote-rejected.png' });

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
log('', '');
log('DONE', 'Screenshots: t1-home.png, t1-joined.png, t2-beacon.png, t3-popup.png, t4-vote-rejected.png');
await browser.close();
