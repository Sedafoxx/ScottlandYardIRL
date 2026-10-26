import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
const errors = [];

page.on('console', m => {
  const t = m.text();
  if (t.includes('permission') || t.includes('WARN') || t.includes('ERROR') || t.includes('failed')) {
    logs.push(t.substring(0, 200));
  }
});
page.on('pageerror', e => errors.push(e.message.substring(0, 200)));

// Admin page
await page.goto('https://scottlandyardirl.web.app/admin');
await page.waitForTimeout(4000); // wait for anon auth

// Find password input
const pwInput = await page.$('input');
if (!pwInput) {
  console.log('No input found');
  const html = await page.content();
  console.log(html.substring(0, 800));
} else {
  await pwInput.fill('scottlandyardirl');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  // Try to create a game
  const createBtn = await page.$('button');
  const allBtns = await page.$$('button');
  console.log('Buttons:', (await Promise.all(allBtns.map(b => b.innerText()))).join(' | '));

  // Look for "Create Game" or similar
  for (const btn of allBtns) {
    const text = await btn.innerText();
    if (text.toLowerCase().includes('creat') || text.toLowerCase().includes('new')) {
      console.log('Clicking:', text);
      await btn.click();
      await page.waitForTimeout(3000);
      break;
    }
  }
}

await page.waitForTimeout(2000);
console.log('LOGS:', JSON.stringify(logs));
console.log('ERRORS:', JSON.stringify(errors));

// Screenshot
await page.screenshot({ path: 'test-admin-result.png' });
console.log('Screenshot saved: test-admin-result.png');

await browser.close();
