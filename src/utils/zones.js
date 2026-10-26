import { ref, get, set, update, runTransaction } from 'firebase/database';
import { db } from '../firebase/config';
import { STARTING_RADIUS } from './hints';

/**
 * Shared "zone" (Mister X search circle) model.
 *
 * One zone exists per BIG team (e.g. "Red"), stored at
 *   games/{gameCode}/zones/{bigTeam} = { lat, lng, radius, updatedAt, updatedBy }
 *
 * Every player of that big team sees the exact same circle on their map.
 * Each solved challenge shrinks that circle by `baseReduction / memberCount`,
 * so a big team has to solve roughly one challenge per player to keep pace
 * with a solo player.
 */

export const MIN_ZONE_RADIUS = 30;
export const MAX_ZONE_RADIUS = STARTING_RADIUS;

const METERS_PER_DEG_LAT = 111320;

export function zonesPath(gameCode) {
  return `games/${gameCode}/zones`;
}

export function zonePath(gameCode, bigTeam) {
  return `games/${gameCode}/zones/${bigTeam}`;
}

/** Number of devices that have joined this big team. Always >= 1. */
export function countBigTeamMembers(teams, bigTeam) {
  if (!teams || !bigTeam) return 1;
  const count = Object.entries(teams)
    .filter(([name, d]) => (d?.bigTeam || name) === bigTeam)
    .length;
  return Math.max(1, count);
}

/** Per-solve reduction for one player: base reduction split across the team. */
export function reductionShare(baseReduction, memberCount) {
  return baseReduction / Math.max(1, memberCount);
}

export function shrinkRadius(radius, share) {
  const base = radius ?? STARTING_RADIUS;
  return Math.max(Math.round(base * (1 - share)), MIN_ZONE_RADIUS);
}

/**
 * The zone for a big team. Falls back to the legacy per-device `currentHint`
 * so games that were created before the shared-zone change still render.
 */
export function resolveZone(game, bigTeam, teamData = null) {
  const zone = bigTeam ? game?.zones?.[bigTeam] : null;
  if (zone?.lat != null) return zone;
  return teamData?.currentHint ?? null;
}

function offsetCenter(lat, lng, radius, angle, fraction) {
  const distance = fraction * radius * 0.85;
  return {
    lat: lat + (distance * Math.cos(angle)) / METERS_PER_DEG_LAT,
    lng: lng + (distance * Math.sin(angle)) / (METERS_PER_DEG_LAT * Math.cos(lat * (Math.PI / 180))),
  };
}

/**
 * Shrink a big team's zone by one player's share of the reduction.
 * Returns true when the zone was written.
 */
export async function shrinkBigTeamZone({
  gameCode,
  bigTeam,
  baseReduction,
  doubleZone = false,
  freezeUntil = null,
  fugitive = null,
  updatedBy = null,
}) {
  if (!gameCode || !bigTeam) return false;
  if ((freezeUntil ?? 0) > Date.now()) return false;

  const teamsSnap = await get(ref(db, `games/${gameCode}/teams`));
  const memberCount = countBigTeamMembers(teamsSnap.val(), bigTeam);
  const reduction = doubleZone ? Math.min(baseReduction * 2, 0.9) : baseReduction;
  const share = reductionShare(reduction, memberCount);

  // Randomised centre offset is fixed before the transaction so retries stay deterministic.
  const hasFugitive = fugitive?.lat != null && fugitive?.lng != null;
  const angle = Math.random() * 2 * Math.PI;
  const fraction = Math.random();

  const result = await runTransaction(ref(db, zonePath(gameCode, bigTeam)), (current) => {
    const nextRadius = shrinkRadius(current?.radius, share);
    let lat = current?.lat;
    let lng = current?.lng;
    if (hasFugitive) {
      const centre = offsetCenter(fugitive.lat, fugitive.lng, nextRadius, angle, fraction);
      lat = centre.lat;
      lng = centre.lng;
    }
    if (lat == null || lng == null) return; // no known centre yet — abort
    return {
      lat,
      lng,
      radius: nextRadius,
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? null,
    };
  });

  return result.committed;
}

/**
 * Force a big team's zone to an exact radius (poem start, admin corrections).
 * Recentres on Mister X's live GPS when known, otherwise keeps the old centre.
 */
export async function setBigTeamZoneRadius({ gameCode, bigTeam, radius, fugitive = null }) {
  if (!gameCode || !bigTeam) return false;
  const r = Math.max(MIN_ZONE_RADIUS, Math.min(MAX_ZONE_RADIUS, Math.round(radius ?? STARTING_RADIUS)));

  const current = (await get(ref(db, zonePath(gameCode, bigTeam)))).val();
  const hasFugitive = fugitive?.lat != null && fugitive?.lng != null;

  if (hasFugitive) {
    const centre = offsetCenter(fugitive.lat, fugitive.lng, r, Math.random() * 2 * Math.PI, Math.random());
    await set(ref(db, zonePath(gameCode, bigTeam)), { ...centre, radius: r, updatedAt: Date.now() });
    return true;
  }
  if (current?.lat == null) return false;
  await set(ref(db, zonePath(gameCode, bigTeam)), { ...current, radius: r, updatedAt: Date.now() });
  return true;
}

/** Pure helper: a copy of `zone` re-centred near (lat, lng) with the same radius. */
export function recentredZone(zone, lat, lng) {
  const radius = zone?.radius ?? STARTING_RADIUS;
  const centre = offsetCenter(lat, lng, radius, Math.random() * 2 * Math.PI, Math.random());
  return { ...zone, ...centre, radius, updatedAt: Date.now() };
}

/** Re-centre every big team's zone on a position, keeping each radius. */
export async function recenterAllZones({ gameCode, lat, lng }) {
  if (!gameCode || lat == null || lng == null) return 0;
  const snap = await get(ref(db, zonesPath(gameCode)));
  const zones = snap.val() ?? {};
  const updates = {};
  Object.entries(zones).forEach(([bigTeam, zone]) => {
    updates[bigTeam] = recentredZone(zone, lat, lng);
  });
  const count = Object.keys(updates).length;
  if (count > 0) await update(ref(db, zonesPath(gameCode)), updates);
  return count;
}

