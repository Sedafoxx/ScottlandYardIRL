import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Use the game we just created in the full flow test
// Find the most recent active game
await page.goto('https://scottlandyardirl.web.app/admin');
await page.waitForTimeout(2000);
await page.fill('input', 'scottlandyardirl');
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

// Find active game
const gameBtns = await page.$$('button');
let gameCode = null;
for (const btn of gameBtns) {
  const t = await btn.innerText();
  if (t.includes('active')) {
    gameCode = t.split(' ')[0];
    break;
  }
}
console.log('Using active game:', gameCode);
await browser.close();

// Now open team page and expand star clues
const browser2 = await chromium.launch({ headless: true });
const teamPage = await browser2.newPage();
await teamPage.goto(`https://scottlandyardirl.web.app/team/${gameCode}?name=TestTeam&bigTeam=Red`);
await teamPage.waitForTimeout(3000);

// Scroll to star clues section and click to expand
await teamPage.evaluate(() => {
  const elements = document.querySelectorAll('*');
  for (const el of elements) {
    if (el.textContent.trim().startsWith('⭐ Star Clues')) {
      el.click();
      break;
    }
  }
});
await teamPage.waitForTimeout(1000);
await teamPage.screenshot({ path: 'star-section-expanded.png', fullPage: true });

const bodyText = await teamPage.innerText('body');
const starIdx = bodyText.indexOf('Star Clue');
if (starIdx >= 0) {
  console.log('Star clues section:', bodyText.substring(starIdx, starIdx + 400));
}

await browser2.close();
