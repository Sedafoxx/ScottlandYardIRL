import { db } from '../firebase/config';
import { ref, update, runTransaction, push } from 'firebase/database';
import { POWER_UP_CONFIG } from '../data/powerUps';

/**
 * Team item bag.
 *
 * Rewards are no longer triggered the instant you earn them: they are stored in
 * `games/{code}/teamItems/{bigTeam}/{itemKey}` and the team decides when to
 * spend them. The bag is shared by the whole big team (same side, same chat).
 */

export const ITEM_KEYS = Object.keys(POWER_UP_CONFIG);

export function itemPath(gameCode, bigTeam, itemKey) {
  return `games/${gameCode}/teamItems/${bigTeam}/${itemKey}`;
}

export async function addItem({ gameCode, bigTeam, itemKey, count = 1 }) {
  if (!gameCode || !bigTeam || !itemKey) return;
  await runTransaction(ref(db, itemPath(gameCode, bigTeam, itemKey)), (current) => {
    const n = current ?? 0;
    return Math.min(n + count, 99);
  });
}

/** Take one item out of the bag. `used` is false when the bag was empty. */
export async function consumeItem({ gameCode, bigTeam, itemKey }) {
  let remaining = 0;
  const result = await runTransaction(ref(db, itemPath(gameCode, bigTeam, itemKey)), (current) => {
    const n = current ?? 0;
    if (n <= 0) return; // abort
    remaining = n - 1;
    return remaining;
  });
  return { used: result.committed, remaining };
}

async function announce(gameCode, text) {
  await push(ref(db, `games/${gameCode}/messages/global`), {
    text,
    sender: 'System',
    timestamp: Date.now(),
  });
}

/** Fire an item's effect for the whole big team. */
export async function useItem({ gameCode, bigTeam, teamName, itemKey, teams = {}, sabotageTarget = null }) {
  const now = Date.now();
  const memberNames = Object.entries(teams)
    .filter(([name, data]) => (data?.bigTeam || name) === bigTeam)
    .map(([name]) => name);
  const teamUpdates = {};

  switch (itemKey) {
    case 'live_feed':
      memberNames.forEach(name => { teamUpdates[`${name}/liveFeedUntil`] = now + 2 * 60 * 1000; });
      break;
    case 'direction_beacon':
      memberNames.forEach(name => { teamUpdates[`${name}/directionBeaconUntil`] = now + 2 * 60 * 1000; });
      break;
    case 'zone_freeze':
      await update(ref(db, `games/${gameCode}`), { zoneFreezeUntil: now + 3 * 60 * 1000 });
      break;
    case 'selfie_demand':
      await update(ref(db, `games/${gameCode}`), {
        selfieRequest: {
          requestId: now,
          requestedBy: teamName,
          requestedByBigTeam: bigTeam,
          requestedAt: now,
          status: 'pending',
          photoUrl: null,
          photoRef: null,
          fulfilledAt: null,
        },
      });
      break;
    case 'double_zone':
      // Applies to the player who spends it — their next challenge shrinks twice.
      teamUpdates[`${teamName}/doubleZone`] = true;
      break;
    case 'sabotage':
      if (sabotageTarget) teamUpdates[`${sabotageTarget}/sabotagedUntil`] = now + 90 * 1000;
      break;
    default:
      break;
  }

  if (Object.keys(teamUpdates).length > 0) {
    await update(ref(db, `games/${gameCode}/teams`), teamUpdates);
  }

  const cfg = POWER_UP_CONFIG[itemKey] ?? { emoji: '⚡', label: itemKey };
  const targetText = itemKey === 'sabotage' && sabotageTarget ? ` → ${sabotageTarget}` : '';
  await announce(gameCode, `${cfg.emoji} ${bigTeam} used ${cfg.label}${targetText}`);

  return cfg;
}
