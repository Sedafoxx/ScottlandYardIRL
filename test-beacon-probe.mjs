/** Focused probe: why is the compass arrow not rendering? */
import fs from 'node:fs';
import { chromium } from 'playwright';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const DB_URL = (env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const api = (p) => `${DB_URL}/${p}.json`;
const put = (p, b) => fetch(api(p), { method: 'PUT', body: JSON.stringify(b) });
const del = (p) => fetch(api(p), { method: 'DELETE' });
const APP = process.env.APP_URL || 'http://localhost:5173';

const GAME = `BCN${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const POS = { latitude: 48.21752, longitude: 16.39025 };
await put(`games/${GAME}`, {
  status: 'active',
  createdAt: Date.now(),
  fugitive: { lastUpdate: { lat: 48.1911, lng: 16.3101, timestamp: Date.now() } },
  teams: {
    'Red 1': {
      score: 0, currentRiddle: 0, bigTeam: 'Red',
      location: { lat: POS.latitude, lng: POS.longitude, timestamp: Date.now() },
      directionBeaconUntil: Date.now() + 120_000,
    },
  },
  riddleSets: {
    'Red 1': {
      0: {
        type: 'puzzle',
        options: {
          easy: { difficulty: 'easy', question: 'Capital of France?', answer: 'PARIS', points: 10, reduction: 0.05 },
          medium: { difficulty: 'medium', question: 'Capital of France?', answer: 'PARIS', points: 20, reduction: 0.10 },
          hard: { difficulty: 'hard', question: 'Capital of France?', answer: 'PARIS', points: 30, reduction: 0.15 },
        },
      },
    },
  },
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, geolocation: POS, permissions: ['geolocation'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => logs.push(`pageerror: ${e}`));

await page.goto(`${APP}/team/${GAME}?name=${encodeURIComponent('Red 1')}&bigTeam=Red`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const texts = await page.$$eval('.card', els => els.map(e => e.innerText.replace(/\s+/g, ' ')).filter(t => t.includes('Direction') || t.includes('Getting')));
console.log('cards mentioning direction:', JSON.stringify(texts, null, 2));
console.log('arrow count:', await page.locator('[data-testid="beacon-arrow"]').count());
console.log('gps button:', await page.getByRole('button', { name: /GPS/ }).first().innerText().catch(() => 'n/a'));
console.log('console:', logs.slice(0, 15).join('\n'));

await browser.close();
await del(`games/${GAME}`);
