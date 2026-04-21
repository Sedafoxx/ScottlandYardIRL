export const STARTING_RADIUS = 2000; // metres — given after the poem challenge

export const DIFFICULTY_CONFIG = {
  easy:   { reduction: 0.10, points: 10, label: 'Easy',   color: 'var(--color-success)' },
  medium: { reduction: 0.20, points: 20, label: 'Medium', color: 'var(--color-accent)'  },
  hard:   { reduction: 0.30, points: 30, label: 'Hard',   color: 'var(--color-primary)' },
};

/**
 * Generates a zone hint circle. The fugitive's position is guaranteed to be
 * inside the circle — the centre is randomly offset by up to 85% of the radius.
 */
export function generateHint(fugitiveLat, fugitiveLng, radius) {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radius * 0.85;
  const latOffset = (distance * Math.cos(angle)) / 111320;
  const lngOffset = (distance * Math.sin(angle)) / (111320 * Math.cos(fugitiveLat * (Math.PI / 180)));
  return { lat: fugitiveLat + latOffset, lng: fugitiveLng + lngOffset, radius };
}
