export const POWER_UP_CONFIG = {
  live_feed:        { label: 'Live Feed',        emoji: '📡', desc: '2 minutes of fugitive live location on your map', color: '#e74c3c' },
  direction_beacon: { label: 'Direction Beacon', emoji: '🧭', desc: '2 minutes of direction + distance to the fugitive', color: '#e67e22' },
  double_zone:      { label: 'Double Zone',      emoji: '⚡', desc: 'Your next challenge gives 2× zone reduction', color: '#f39c12' },
  zone_freeze:      { label: 'Zone Freeze',      emoji: '❄️', desc: "All teams' zone hints pause for 3 minutes", color: '#3498db' },
  sabotage:         { label: 'Sabotage',         emoji: '💣', desc: 'Lock a rival team out for 90 seconds', color: '#9b59b6' },
  selfie_demand:    { label: 'Selfie Demand',    emoji: '📸', desc: 'Force the fugitive to send you a selfie', color: '#1abc9c' },
};

export const TRANSPORT_TYPES = [
  { key: 'ubahn',  label: 'U-Bahn',   emoji: '🚇' },
  { key: 'tram',   label: 'Tram',     emoji: '🚃' },
  { key: 'bus',    label: 'Bus',      emoji: '🚌' },
  { key: 'sbahn',  label: 'S-Bahn',   emoji: '🚆' },
  { key: 'taxi',   label: 'Taxi',     emoji: '🚕' },
  { key: 'foot',   label: 'On foot',  emoji: '🚶' },
];
