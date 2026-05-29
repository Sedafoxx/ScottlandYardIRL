/**
 * generate-summary-cards.mjs
 * Fetch game data from Firebase and render per-team summary cards to disk.
 * Usage: node generate-summary-cards.mjs <gameCode> <outputDir>
 */

import { createCanvas, loadImage } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const GAME_CODE = process.argv[2] || 'BKTNG';
const OUT_DIR   = process.argv[3] || 'C:\\Users\\dchy\\Pictures\\Scotland Yard';
const DB_URL    = 'https://scottlandyardirl-default-rtdb.europe-west1.firebasedatabase.app';

// ── helpers ──────────────────────────────────────────────────────────────────

function teamColor(bigTeam) {
  const n = (bigTeam || '').toLowerCase();
  if (n.includes('blue')) return '#3498db';
  if (n.includes('red'))  return '#e74c3c';
  return '#888888';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── fetch game ────────────────────────────────────────────────────────────────

const resp = await fetch(`${DB_URL}/games/${GAME_CODE}.json`);
const game = await resp.json();

if (!game) {
  console.error(`Game ${GAME_CODE} not found`);
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// ── load logo ─────────────────────────────────────────────────────────────────

let logo = null;
try {
  logo = await loadImage('./public/logo.png');
} catch {
  console.warn('Logo not found — skipping');
}

const dateStr = new Date(game.createdAt ?? Date.now())
  .toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });

const winner = game.winner ?? null;

// Stars by big team
const starsByBig = {};
Object.values(game.stars ?? {}).forEach(s => {
  if (s.claimedBy) starsByBig[s.claimedBy] = (starsByBig[s.claimedBy] ?? 0) + 1;
});

// Big-team scores for ranking
const bigTeamScores = {};
Object.values(game.teams ?? {}).forEach(d => {
  const bg = d.bigTeam || '';
  bigTeamScores[bg] = (bigTeamScores[bg] ?? 0) + (d.score ?? 0);
});
const rankedTeams = Object.entries(bigTeamScores).sort((a, b) => b[1] - a[1]);
function getRank(bigTeam) {
  const idx = rankedTeams.findIndex(([bg]) => bg === bigTeam);
  return idx === -1 ? rankedTeams.length : idx + 1;
}
const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

// ── render one card ───────────────────────────────────────────────────────────

async function renderCard(teamName, teamData) {
  const bigTeam    = teamData.bigTeam || teamName;
  const nickname   = teamData.nickname || teamName;
  const color      = teamColor(bigTeam);
  const isCatcher  = winner && winner === bigTeam;
  const myStars    = starsByBig[bigTeam] ?? 0;
  const rank       = getRank(bigTeam);
  const rankLabel  = ordinals[rank] ?? `#${rank}`;

  const W = 540, H = 960;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#080812';
  ctx.fillRect(0, 0, W, H);

  // Color gradient at bottom
  const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
  grad.addColorStop(0, 'rgba(8,8,18,0)');
  grad.addColorStop(1, hexToRgba(color, 0.27));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Logo
  if (logo) {
    const lw = 360, lh = logo.height * (360 / logo.width);
    ctx.drawImage(logo, (W - lw) / 2, 36, lw, lh);
  }

  // Divider
  ctx.strokeStyle = hexToRgba(color, 0.33);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 200); ctx.lineTo(W - 50, 200);
  ctx.stroke();

  // Nickname
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const nameSize = nickname.length > 14 ? 44 : nickname.length > 10 ? 52 : 60;
  ctx.font = `bold ${nameSize}px sans-serif`;
  ctx.fillText(nickname, W / 2, 272);

  // Big team
  ctx.fillStyle = color;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('Team ' + bigTeam.toUpperCase(), W / 2, 316);

  // ── Bottom section: large photo LEFT, stats column RIGHT ──────────────────

  const SEC_TOP  = 356;   // top of bottom section
  const PHOTO_SZ = 268;   // photo square size
  const PHOTO_X  = 22;
  const PHOTO_Y  = SEC_TOP + 10;
  const STAT_X   = PHOTO_X + PHOTO_SZ + 18;  // 308
  const STAT_W   = W - STAT_X - 18;          // ~214px
  const STAT_H   = 116;

  // Stats
  const stats = [
    { label: 'Points',       value: String(teamData.score ?? 0) },
    { label: 'Riddles',      value: String(teamData.currentRiddle ?? 0) },
    { label: 'Stars',        value: String(myStars) },
    isCatcher
      ? { label: 'CAUGHT MR X', value: 'YES', gold: true }
      : { label: 'Final Rank',  value: rankLabel },
  ];

  stats.forEach((s, i) => {
    const sy      = SEC_TOP + i * (STAT_H + 10);
    const isGold  = !!s.gold;

    // Card bg
    ctx.fillStyle = isGold ? hexToRgba('#f1c40f', 0.10) : 'rgba(255,255,255,0.035)';
    roundRectPath(ctx, STAT_X, sy, STAT_W, STAT_H, 12);
    ctx.fill();

    // Accent left bar
    ctx.fillStyle = isGold ? '#f1c40f' : color;
    roundRectPath(ctx, STAT_X, sy, 4, STAT_H, 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#555555';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(s.label.toUpperCase(), STAT_X + 14, sy + 26);

    // Value
    const valLen  = s.value.length;
    const valSize = valLen > 5 ? 28 : valLen > 3 ? 36 : 46;
    ctx.fillStyle = isGold ? '#f1c40f' : '#ffffff';
    ctx.font = `bold ${valSize}px sans-serif`;
    ctx.fillText(s.value, STAT_X + 14, sy + 26 + 52);
  });

  // Large photo area (left)
  ctx.fillStyle = hexToRgba(color, 0.10);
  roundRectPath(ctx, PHOTO_X, PHOTO_Y, PHOTO_SZ, PHOTO_SZ, 18);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = 2;
  roundRectPath(ctx, PHOTO_X, PHOTO_Y, PHOTO_SZ, PHOTO_SZ, 18);
  ctx.stroke();

  // Camera icon placeholder
  ctx.fillStyle = hexToRgba(color, 0.4);
  ctx.font = '64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📷', PHOTO_X + PHOTO_SZ / 2, PHOTO_Y + PHOTO_SZ / 2 + 22);

  ctx.fillStyle = '#333333';
  ctx.font = '13px sans-serif';
  ctx.fillText('Best shot', PHOTO_X + PHOTO_SZ / 2, PHOTO_Y + PHOTO_SZ - 18);

  // Date footer
  ctx.fillStyle = '#2a2a2a';
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${dateStr} · Vienna`, W / 2, H - 38);

  // Save
  const safeName = nickname.replace(/[^a-z0-9\-_äöü ]/gi, '').trim().replace(/\s+/g, '-');
  const filename = `${GAME_CODE}-${safeName}.png`;
  const outPath  = join(OUT_DIR, filename);
  const buffer   = canvas.toBuffer('image/png');
  writeFileSync(outPath, buffer);
  console.log(`✓ ${outPath}`);
}

// ── run for all teams ─────────────────────────────────────────────────────────

const teams = Object.entries(game.teams ?? {});
if (teams.length === 0) {
  console.error('No teams in game');
  process.exit(1);
}

console.log(`Generating ${teams.length} cards for game ${GAME_CODE}…`);
for (const [teamName, teamData] of teams) {
  await renderCard(teamName, teamData);
}
console.log('Done.');
