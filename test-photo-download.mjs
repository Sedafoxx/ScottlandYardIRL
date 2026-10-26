import { chromium } from 'playwright';
import { existsSync, statSync } from 'node:fs';

const SP = 'C:/Users/dchy/AppData/Local/Temp/claude/C--Users-dchy-Documents-VSCode-ScottlandYardIRL/1844150b-53e8-4dfb-9d74-3def1b774557/scratchpad';
const URL = 'http://localhost:5174/team/XLGEQ?name=' + encodeURIComponent('Blue 2') + '&bigTeam=Blue';

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 200)); });

console.log('goto', URL);
await page.goto(URL, { waitUntil: 'networkidle' });

// skip the Wrapped slideshow -> SummaryCard
const skip = page.getByRole('button', { name: /Skip/i });
await skip.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
for (let i = 0; i < 3 && (await skip.count()); i++) {
  await skip.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
}
await page.getByText(/Your Summary Card/i).waitFor({ timeout: 10000 }).catch(() => {});

const btn = page.getByRole('button', { name: /Download our photos/i });
await btn.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

const found = (await btn.count()) > 0;
console.log('download button present:', found);
await page.screenshot({ path: `${SP}/photo-dl-ui.png` });
if (!found) { console.log('FAIL: button not found'); await browser.close(); process.exit(1); }

const dlPromise = page.waitForEvent('download', { timeout: 180000 });
await btn.first().click();
console.log('clicked, watermarking photos (sequential)...');
const dl = await dlPromise;
const out = `${SP}/team-photos-test.zip`;
await dl.saveAs(out);
const ok = existsSync(out);
console.log('zip saved:', ok, ok ? statSync(out).size + ' bytes' : '');
console.log('suggested filename:', dl.suggestedFilename());

await page.screenshot({ path: `${SP}/photo-dl-done.png` });
await browser.close();
console.log(ok ? 'PASS' : 'FAIL');
