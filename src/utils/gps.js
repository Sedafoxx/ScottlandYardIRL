/**
 * Geolocation helpers.
 *
 * The browser remembers a granted permission per origin, but a page reload
 * still loses the active `watchPosition` subscription — so players had to tap
 * "Enable GPS" again after every refresh (and often missed that they had to,
 * which silently killed tracking). We persist the player's choice and
 * auto-resume as soon as the permission is already granted.
 */

const PREF_KEY = 'sy_gps_enabled';

export function gpsPrefEnabled() {
  try { return localStorage.getItem(PREF_KEY) === '1'; } catch { return false; }
}

export function setGpsPref(enabled) {
  try {
    if (enabled) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch { /* private mode */ }
}

/** 'granted' | 'prompt' | 'denied' | 'unsupported' */
export async function geolocationPermission() {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/** Should tracking resume without a tap? Only when it is safe (no surprise prompt). */
export async function shouldAutoStartGps() {
  if (gpsPrefEnabled()) return true;
  return (await geolocationPermission()) === 'granted';
}

export function isPermissionDenied(err) {
  return err?.code === 1 || /denied|permission/i.test(err?.message ?? '');
}
