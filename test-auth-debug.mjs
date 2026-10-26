import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const allLogs = [];

page.on('console', m => allLogs.push(`[${m.type()}] ${m.text().substring(0, 300)}`));
page.on('pageerror', e => allLogs.push(`[ERROR] ${e.message.substring(0, 300)}`));

await page.goto('https://scottlandyardirl.web.app/admin');

// Wait longer for anonymous auth
await page.waitForTimeout(6000);

// Check auth state via page eval
const authState = await page.evaluate(async () => {
  // Can't access firebase directly, but check if any auth errors in console
  return { url: window.location.href, title: document.title };
});
console.log('Auth state check:', authState);

// Check all logs so far
console.log('All logs:', allLogs.join('\n'));

await browser.close();
