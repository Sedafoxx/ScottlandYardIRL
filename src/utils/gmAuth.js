import { auth } from '../firebase/config';
import { signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';

/**
 * Game Master access — real Firebase accounts this time.
 *
 * Each GM has an Email/Password account (`<username>@scottlandyardirl.app`) with a
 * custom claim `gm: true`, granted only through the admin API. The database rules
 * use that claim (plus `gmUid` stored on the game) to decide who may create,
 * end or delete a game — the browser cannot fake it.
 *
 * The username the GM types is mapped to that email address; the password is the
 * account password.
 */

const EMAIL_DOMAIN = 'scottlandyardirl.app';
const SESSION_KEY = 'sy_gm_session';

const GM_NAMES = {
  dimitriburyak: 'Dimitri Buryak',
  evasteinmetz: 'Eva Steinmetz',
};

/** Signed-in GM for this tab, or null. */
export function readGmSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username || !parsed?.uid) return null;
    return { username: parsed.username, name: parsed.name ?? GM_NAMES[parsed.username] ?? parsed.username, uid: parsed.uid };
  } catch {
    return null;
  }
}

export function currentUid() {
  return auth.currentUser?.uid ?? null;
}

const WRONG_CREDENTIALS = /invalid-credential|wrong-password|user-not-found|invalid-login-credentials|invalid-email/i;

/** Sign in with a GM account and verify the gm claim. */
export async function signInGm(usernameInput, passwordInput) {
  const username = String(usernameInput ?? '').trim().toLowerCase();
  const password = String(passwordInput ?? '');
  if (!username || !password) return { ok: false, error: 'Enter your username and password.' };

  const email = `${username}@${EMAIL_DOMAIN}`;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdTokenResult(true);

    if (token.claims.gm !== true) {
      // Valid account, but not a Game Master — leave the device signed in as a player.
      await signOut(auth);
      await signInAnonymously(auth);
      return { ok: false, error: 'This account is not a Game Master.' };
    }

    const session = {
      username,
      name: credential.user.displayName || GM_NAMES[username] || username,
      uid: credential.user.uid,
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private mode */ }
    return { ok: true, session };
  } catch (err) {
    const code = err?.code ?? '';
    if (WRONG_CREDENTIALS.test(code)) return { ok: false, error: 'Wrong username or password.' };
    if (/too-many-requests/.test(code)) return { ok: false, error: 'Too many attempts — wait a minute and try again.' };
    return { ok: false, error: `Sign-in failed (${code || 'unknown error'}).` };
  }
}

/** End the GM session and leave the device authenticated as a player. */
export async function signOutGm() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  try {
    await signOut(auth);
    await signInAnonymously(auth); // player pages still need an authenticated device
  } catch (err) {
    console.warn('[gmAuth] sign-out fallback failed', err?.code ?? err);
  }
}

/** localStorage key for a GM's own game list. */
export function gamesStorageKey(username) {
  return `sy_admin_games:${username}`;
}

/** The single-password era used one shared key; move it into the first GM who logs in. */
export function migrateLegacyGameList(username) {
  try {
    const legacy = localStorage.getItem('sy_admin_games');
    if (!legacy) return null;
    const target = gamesStorageKey(username);
    if (!localStorage.getItem(target)) localStorage.setItem(target, legacy);
    localStorage.removeItem('sy_admin_games');
    return JSON.parse(legacy);
  } catch {
    return null;
  }
}
