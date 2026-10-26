import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const errors = [];

// ---- ADMIN: create & start game, release star clue ----
const adminPage = await browser.newPage();
adminPage.on('console', m => {
  const t = m.text();
  if (t.includes('permission') || t.includes('failed') || t.includes('ERROR')) errors.push(t.substring(0, 200));
});

await adminPage.goto('https://scottlandyardirl.web.app/admin');
await adminPage.waitForTimeout(2000);
await adminPage.fill('input', 'scottlandyardirl');
await adminPage.keyboard.press('Enter');
await adminPage.waitForTimeout(2000);

// Create game
await adminPage.click('button:has-text("New Game")');
await adminPage.waitForTimeout(2000);

// Find the new "waiting" game and click it
const gameBtns = await adminPage.$$('button');
let gameCode = null;
for (const btn of gameBtns) {
  const t = await btn.innerText();
  if (t.includes('waiting')) {
    gameCode = t.split(' ')[0];
    await btn.click();
    await adminPage.waitForTimeout(1000);
    break;
  }
}
console.log('Game code:', gameCode);
if (!gameCode) { console.log('No game code found!'); await browser.close(); process.exit(1); }

// Start the game
await adminPage.screenshot({ path: 'flow-01-before-start.png' });
const startBtn = await adminPage.$('button:has-text("Start")');
if (startBtn) {
  await startBtn.click();
  await adminPage.waitForTimeout(1500);
  console.log('Game started');
}

// Release star clue #1
const releaseBtn = await adminPage.$('button:has-text("Release")');
if (releaseBtn) {
  await releaseBtn.click();
  await adminPage.waitForTimeout(1500);
  console.log('Released first star clue');
} else {
  // scroll down and look for star section
  await adminPage.keyboard.press('End');
  await adminPage.waitForTimeout(500);
  const pageText = await adminPage.innerText('body');
  const idx = pageText.indexOf('Star');
  console.log('Star section at index:', idx, '| snippet:', pageText.substring(Math.max(0, idx-10), idx+100));
}

await adminPage.screenshot({ path: 'flow-02-after-release.png' });

// ---- TEAM PAGE ----
const teamPage = await browser.newPage();
teamPage.on('console', m => {
  const t = m.text();
  if (t.includes('permission') || t.includes('failed') || t.includes('ERROR')) errors.push(`[team] ${t.substring(0, 200)}`);
});
await teamPage.goto(`https://scottlandyardirl.web.app/team/${gameCode}?name=RedHunters&bigTeam=Red`);
await teamPage.waitForTimeout(3000);
await teamPage.screenshot({ path: 'flow-03-team-page.png' });

const bodyText = await teamPage.innerText('body');
console.log('Team page body (first 600):', bodyText.substring(0, 600));
const hasStars = bodyText.includes('Star') || bodyText.includes('⭐') || bodyText.includes('Clue');
const hasLeaderboard = bodyText.includes('Leaderboard');
console.log('Has star content:', hasStars);
console.log('Has leaderboard:', hasLeaderboard);

// ---- LEADERBOARD CHECK ----
const leaderboardPage = await browser.newPage();
await leaderboardPage.goto(`https://scottlandyardirl.web.app/team/${gameCode}?name=BlueHunters&bigTeam=Blue`);
await leaderboardPage.waitForTimeout(3000);
await leaderboardPage.screenshot({ path: 'flow-04-blue-team.png' });

const blueBody = await leaderboardPage.innerText('body');
const hasLeaderboardBlue = blueBody.includes('Leaderboard');
console.log('Blue team leaderboard:', hasLeaderboardBlue);
if (hasLeaderboardBlue) {
  const lbIdx = blueBody.indexOf('Leaderboard');
  console.log('Leaderboard section:', blueBody.substring(lbIdx, lbIdx + 300));
}

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
