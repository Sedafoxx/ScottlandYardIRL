/** Why does anonymous sign-in fail in the browser (but work over REST)? */
import { chromium } from 'playwright';

const APP = process.env.APP_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', m => console.log(`console.${m.type()}:`, m.text().slice(0, 300)));
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const result = await page.evaluate(async () => {
  const mod = await import('/src/firebase/config.js');
  const before = mod.auth.currentUser?.uid ?? null;
  try {
    const user = await mod.ensureAuth();
    return { before, uid: user.uid, anon: user.isAnonymous };
  } catch (err) {
    return { before, error: `${err?.code ?? ''} ${err?.message ?? err}` };
  }
});
console.log('result:', JSON.stringify(result));
await browser.close();
