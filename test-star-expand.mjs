import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://scottlandyardirl.web.app/team/FJMWJ?name=TestTeam&bigTeam=Red');
await page.waitForTimeout(3000);

// Click the Star Clues header to expand
await page.click('text=Star Clues');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'star-expanded.png', fullPage: true });

const bodyText = await page.innerText('body');
const idx = bodyText.indexOf('Star Clue');
console.log('Star section:', bodyText.substring(idx, idx + 600));

await browser.close();
