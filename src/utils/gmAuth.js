/**
 * Game Master access.
 *
 * This is a client-side gate (the bundle ships password hashes, not passwords),
 * not a server-side identity — the Realtime Database still only knows that a
 * device is an anonymous signed-in user. It keeps other players out of /admin
 * and gives each GM their own game list.
 *
 * Hashes are SHA-256 of `username:password:syirl-gm-v1`.
 */

const SALT = 'syirl-gm-v1';
const SESSION_KEY = 'sy_gm_session';

const GM_USERS = {
  dimitriburyak: {
    hash: '5711d63e35edfa4d12dcc43ba54d4d8ef2d60d09fb02e472396c6868f36bb4ad',
    name: 'Dimitri Buryak',
  },
  evasteinmetz: {
    hash: 'a65ab17af89ffb53a258c0a2222519b486c2a4e2943bb4b81408dedc4d567401',
    name: 'Eva Steinmetz',
  },
};

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Signed-in GM for this tab, or null. */
export function readGmSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = GM_USERS[parsed?.username];
    return user ? { username: parsed.username, name: user.name } : null;
  } catch {
    return null;
  }
}

export function signOutGm() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Verify credentials and start a session for this tab. */
export async function signInGm(usernameInput, passwordInput) {
  const username = String(usernameInput ?? '').trim().toLowerCase();
  const password = String(passwordInput ?? '');
  const user = GM_USERS[username];

  // Hash even for unknown users so the timing does not reveal valid usernames.
  const hash = await sha256Hex(`${username}:${password}:${SALT}`);
  const expected = user?.hash ?? '0'.repeat(64);

  if (!user || !timingSafeEqual(hash, expected)) {
    return { ok: false, error: 'Wrong username or password.' };
  }

  const session = { username, name: user.name, since: Date.now() };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  return { ok: true, session: { username, name: user.name } };
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
