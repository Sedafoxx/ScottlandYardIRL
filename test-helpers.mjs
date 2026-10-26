/** Shared helpers for the REST-based test suites (env + anonymous auth token). */
import fs from 'node:fs';

export function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter(l => l && !l.trim().startsWith('#') && l.includes('='))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
}

/**
 * The app signs every device in anonymously; rules require `auth != null`.
 * REST calls from the test harness need the same identity.
 */
export async function signInAnonymously(env) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`anonymous sign-in failed: ${JSON.stringify(json).slice(0, 200)}`);
  return json.idToken;
}
