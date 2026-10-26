/**
 * Push the Vite/Firebase config from .env into the linked Vercel project.
 * These values are the public Firebase web config (they ship in the bundle).
 *
 * Usage: node scripts/vercel-env.mjs [production|preview|all]
 */
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../test-helpers.mjs';

const target = process.argv[2] ?? 'all';
const environments = target === 'all' ? ['production', 'preview'] : [target];
const env = loadEnv();

let failed = 0;
for (const environment of environments) {
  for (const [key, value] of Object.entries(env)) {
    const res = spawnSync('vercel', ['env', 'add', key, environment, '--force'], {
      input: value,
      shell: true,
      encoding: 'utf8',
    });
    const ok = res.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${key} → ${environment}${ok ? '' : ` :: ${(res.stderr || res.stdout || '').trim().slice(0, 160)}`}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
