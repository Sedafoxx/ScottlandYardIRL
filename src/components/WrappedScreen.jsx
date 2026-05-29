import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { ref, update } from 'firebase/database';

// ── helpers ──────────────────────────────────────────────────────────────────

function teamColor(bigTeam) {
  const n = (bigTeam || '').toLowerCase();
  if (n.includes('blue')) return '#3498db';
  if (n.includes('red')) return '#e74c3c';
  return '#888';
}

function buildSlides(game) {
  const slides = [];
  const teamsArr = Object.entries(game?.teams ?? {});

  const groups = {};
  teamsArr.forEach(([name, data]) => {
    const bg = data.bigTeam || name;
    if (!groups[bg]) groups[bg] = { score: 0 };
    groups[bg].score += data.score ?? 0;
  });
  const sortedGroups = Object.entries(groups).sort((a, b) => b[1].score - a[1].score);

  let riddle = { name: '', count: 0 };
  teamsArr.forEach(([name, data]) => {
    if ((data.currentRiddle ?? 0) > riddle.count)
      riddle = { name: data.nickname || name, count: data.currentRiddle ?? 0 };
  });

  const starsByBig = {};
  Object.values(game?.stars ?? {}).forEach(s => {
    if (s.claimedBy) starsByBig[s.claimedBy] = (starsByBig[s.claimedBy] ?? 0) + 1;
  });
  const starLeader = Object.entries(starsByBig).sort((a, b) => b[1] - a[1])[0];

  const totalPhotos = teamsArr.reduce((sum, [, d]) =>
    sum + Object.values(d.submissions ?? {}).filter(s => s.status === 'approved' && s.photoUrl).length, 0);

  const winner = game?.winner ?? null;
  const dateStr = new Date(game?.createdAt ?? Date.now())
    .toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });

  slides.push({ type: 'intro', dateStr });
  slides.push({ type: 'winner', winner });

  if (sortedGroups.length > 0)
    slides.push({ type: 'standings', groups: sortedGroups, winner });

  if (sortedGroups.length > 0)
    slides.push({ type: 'stat', emoji: '🏆', label: 'MOST POINTS', value: `${sortedGroups[0][1].score} pts`, team: sortedGroups[0][0] });

  if (riddle.count > 0)
    slides.push({ type: 'stat', emoji: '🧩', label: 'MOST RIDDLES SOLVED', value: `${riddle.count} riddles`, team: riddle.name });

  if (starLeader)
    slides.push({ type: 'stat', emoji: '⭐', label: 'STAR COLLECTOR', value: `${starLeader[1]} star${starLeader[1] !== 1 ? 's' : ''}`, team: starLeader[0] });

  if (totalPhotos > 0)
    slides.push({ type: 'stat', emoji: '📸', label: 'PHOTOS TAKEN', value: `${totalPhotos} photos`, team: 'All teams combined' });

  slides.push({
    type: 'stat', emoji: winner ? '🎯' : '🕶️',
    label: winner ? 'THE CATCHER' : 'MISTER X',
    value: winner ? 'Caught Mister X!' : 'Escaped the hunt!',
    team: winner ?? 'Mister X',
  });

  const allPhotos = [];
  teamsArr.forEach(([, data]) => {
    const label = data.nickname || data.bigTeam || 'Team';
    Object.values(data.submissions ?? {}).forEach(sub => {
      if (sub.photoUrl && sub.status === 'approved')
        allPhotos.push({ url: sub.photoUrl, team: label });
    });
  });
  allPhotos.sort(() => Math.random() - 0.5);
  allPhotos.forEach(p => slides.push({ type: 'photo', ...p }));

  slides.push({ type: 'credits', dateStr });

  return slides;
}

// ── Slide components ──────────────────────────────────────────────────────────

function IntroSlide({ dateStr }) {
  return (
    <div style={{ textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
      <img src="/logo.png" alt="Scotland Yard IRL" style={{ width: '260px', maxWidth: '80vw' }} />
      <div>
        <p style={{ fontSize: '0.75rem', letterSpacing: '0.3em', color: '#666', textTransform: 'uppercase' }}>The Hunt Is Over</p>
        <p style={{ fontSize: '1rem', color: '#444', marginTop: '0.5rem' }}>{dateStr}</p>
      </div>
    </div>
  );
}

function WinnerSlide({ winner }) {
  return (
    <div style={{ textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <p style={{ fontSize: '5rem', lineHeight: 1 }}>{winner ? '🎯' : '🕶️'}</p>
      <p style={{ fontSize: '0.7rem', letterSpacing: '0.3em', color: '#666', textTransform: 'uppercase' }}>
        {winner ? 'Mister X was caught by' : 'Result'}
      </p>
      <p style={{ fontSize: '3rem', fontWeight: 900, color: winner ? '#f1c40f' : '#aaa', lineHeight: 1.1, textAlign: 'center' }}>
        {winner ?? 'Mister X Escaped!'}
      </p>
    </div>
  );
}

function StandingsSlide({ groups, winner }) {
  return (
    <div style={{ color: '#fff', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ textAlign: 'center', fontSize: '0.7rem', letterSpacing: '0.3em', color: '#666', textTransform: 'uppercase' }}>Final Standings</p>
      {groups.map(([bgName, group], gi) => (
        <div key={bgName} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1rem',
          background: gi === 0 ? 'rgba(241,196,15,0.08)' : 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          borderLeft: `4px solid ${gi === 0 ? '#f1c40f' : teamColor(bgName)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ color: '#555', fontSize: '0.85rem', width: '1.2rem' }}>#{gi + 1}</span>
            <div>
              <p style={{ fontWeight: 700 }}>{bgName}</p>
              {bgName === winner && <p style={{ fontSize: '0.7rem', color: '#f1c40f', marginTop: 2 }}>🎯 Caught Mister X</p>}
            </div>
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{group.score} pts</span>
        </div>
      ))}
    </div>
  );
}

function StatSlide({ emoji, label, value, team }) {
  return (
    <div style={{ textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <p style={{ fontSize: '4.5rem', lineHeight: 1 }}>{emoji}</p>
      <p style={{ fontSize: '0.7rem', letterSpacing: '0.3em', color: '#666', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ fontSize: '3.2rem', fontWeight: 900, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: '1.3rem', color: '#f1c40f', fontWeight: 700 }}>{team}</p>
    </div>
  );
}

function PhotoSlide({ url, team }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <img src={url} alt={team} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
        padding: '3rem 1.5rem 2rem',
      }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.6rem' }}>{team}</p>
      </div>
    </div>
  );
}

function CreditsSlide({ dateStr }) {
  return (
    <div style={{ textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
      <img src="/logo.png" alt="Scotland Yard IRL" style={{ width: '220px', maxWidth: '80vw' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ fontSize: '1.2rem', color: '#aaa' }}>Thank you for playing</p>
        <p style={{ fontSize: '0.8rem', color: '#444', letterSpacing: '0.1em' }}>{dateStr} · Vienna</p>
        <p style={{ fontSize: '0.75rem', color: '#2a2a2a', marginTop: '0.25rem', letterSpacing: '0.05em' }}>See you next time</p>
      </div>
    </div>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

// roundRect polyfill for older browsers
function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
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
}

function SummaryCard({ game, teamName, bigTeam, nickname }) {
  const isMrX = !teamName;
  const teamData = game?.teams?.[teamName] ?? {};
  const displayName = nickname || teamName || 'Mister X';
  const color = isMrX ? '#e94560' : teamColor(bigTeam);
  const winner = game?.winner ?? null;
  const isCatcher = winner && winner === bigTeam;
  const myStars = bigTeam
    ? Object.values(game?.stars ?? {}).filter(s => s.claimedBy === bigTeam).length
    : 0;
  const dateStr = new Date(game?.createdAt ?? Date.now())
    .toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });

  const myPhotos = Object.entries(teamData.submissions ?? {})
    .filter(([, s]) => s.photoUrl && s.status === 'approved')
    .map(([idx, s]) => ({ idx: parseInt(idx), url: s.photoUrl }));

  const [selectedIdx, setSelectedIdx] = useState(myPhotos[0]?.idx ?? null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef();

  const stats = isMrX
    ? [
        { emoji: winner ? '🎯' : '🕶️', label: 'Result', value: winner ? 'CAUGHT' : 'ESCAPED' },
        { emoji: '👥', label: 'Teams hunting', value: Object.keys(game?.teams ?? {}).length },
      ]
    : [
        { emoji: '🎯', label: 'Points', value: teamData.score ?? 0 },
        { emoji: '🧩', label: 'Riddles', value: teamData.currentRiddle ?? 0 },
        { emoji: '⭐', label: 'Stars', value: myStars },
        ...(isCatcher ? [{ emoji: '🏆', label: 'Caught Mister X!', value: '🎯' }] : []),
      ];

  const download = async () => {
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const W = 540, H = 960;

      // Background
      ctx.fillStyle = '#080812';
      ctx.fillRect(0, 0, W, H);

      // Team color gradient at bottom
      const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
      grad.addColorStop(0, 'rgba(8,8,18,0)');
      grad.addColorStop(1, color + '44');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Logo
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      await new Promise(r => { logo.onload = r; logo.onerror = r; logo.src = '/logo.png'; });
      if (logo.naturalWidth) {
        const lw = 240, lh = logo.naturalHeight * (240 / logo.naturalWidth);
        ctx.drawImage(logo, (W - lw) / 2, 50, lw, lh);
      }

      // Divider
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 195); ctx.lineTo(W - 60, 195);
      ctx.stroke();

      // Nickname
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      const nameSize = displayName.length > 14 ? 48 : displayName.length > 10 ? 56 : 64;
      ctx.font = `bold ${nameSize}px sans-serif`;
      ctx.fillText(displayName, W / 2, 275);

      // Big team
      if (bigTeam) {
        ctx.fillStyle = color;
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('Team ' + bigTeam.toUpperCase(), W / 2, 325);
      } else if (isMrX) {
        ctx.fillStyle = color;
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('MISTER X', W / 2, 325);
      }

      // Stats — 2 columns
      const visibleStats = stats.slice(0, 4);
      const cols = visibleStats.length <= 2 ? visibleStats.length : 2;
      const colW = W / cols;
      let baseY = 390;

      visibleStats.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = colW * col + colW / 2;
        const y = baseY + row * 130;

        ctx.fillStyle = '#444';
        ctx.font = '17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${s.emoji} ${s.label.toUpperCase()}`, x, y);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 50px sans-serif`;
        ctx.fillText(String(s.value), x, y + 58);
      });

      // Thumbnail (bottom-right)
      const selectedSub = myPhotos.find(p => p.idx === selectedIdx);
      if (selectedSub) {
        try {
          const resp = await fetch(selectedSub.url);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const thumb = new Image();
          await new Promise((res, rej) => { thumb.onload = res; thumb.onerror = rej; thumb.src = blobUrl; });
          URL.revokeObjectURL(blobUrl);

          const tSize = 170, tX = W - tSize - 28, tY = H - tSize - 90;

          // Cover-crop draw
          const ar = thumb.naturalWidth / thumb.naturalHeight;
          let sw, sh, ox, oy;
          if (ar >= 1) { sh = tSize; sw = tSize * ar; ox = tX - (sw - tSize) / 2; oy = tY; }
          else { sw = tSize; sh = tSize / ar; ox = tX; oy = tY - (sh - tSize) / 2; }

          ctx.save();
          ctx.beginPath();
          roundRect(ctx, tX, tY, tSize, tSize, 14);
          ctx.clip();
          ctx.drawImage(thumb, ox, oy, sw, sh);
          ctx.restore();

          // Border
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          roundRect(ctx, tX, tY, tSize, tSize, 14);
          ctx.stroke();
        } catch {
          // photo unavailable — colored placeholder
          ctx.fillStyle = color + '33';
          ctx.beginPath();
          roundRect(ctx, W - 198, H - 258, 170, 170, 14);
          ctx.fill();
        }
      }

      // Date
      ctx.fillStyle = '#2a2a2a';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dateStr + ' · Vienna', W / 2, H - 38);

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scotland-yard-${displayName.replace(/\s+/g, '-')}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setGenerating(false);
      }, 'image/png');
    } catch (err) {
      console.error('Summary card failed:', err);
      setGenerating(false);
    }
  };

  return (
    <div className="page" style={{ gap: '1.25rem', paddingTop: '1rem' }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/logo.png" alt="Scotland Yard IRL" style={{ width: '180px', maxWidth: '65vw' }} />
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: '1rem', color: color }}>Your Summary Card</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{dateStr}</span>
        </div>

        {/* Stats preview */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              flex: '1 1 calc(50% - 0.25rem)', background: 'var(--color-bg)',
              borderRadius: 8, padding: '0.5rem 0.75rem', textAlign: 'center',
              borderBottom: `2px solid ${color}44`,
            }}>
              <p style={{ fontSize: '1.4rem', lineHeight: 1 }}>{s.emoji}</p>
              <p style={{ fontWeight: 700, fontSize: '1.2rem', marginTop: '0.2rem' }}>{s.value}</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: '0.1rem' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Photo picker */}
        {myPhotos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Highlight photo for your card:</p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {myPhotos.map(p => (
                <img
                  key={p.idx}
                  src={p.url}
                  alt={`Challenge ${p.idx + 1}`}
                  onClick={() => setSelectedIdx(p.idx)}
                  style={{
                    width: 72, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'pointer',
                    border: `3px solid ${selectedIdx === p.idx ? color : 'transparent'}`,
                    transition: 'border-color 0.15s',
                  }}
                />
              ))}
              <div
                onClick={() => setSelectedIdx(null)}
                title="No photo"
                style={{
                  width: 72, height: 72, borderRadius: 8, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-bg)', fontSize: '1.4rem',
                  border: `3px solid ${selectedIdx === null ? color : 'transparent'}`,
                  transition: 'border-color 0.15s',
                  color: 'var(--color-text-muted)',
                }}
              >
                ✕
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} width={540} height={960} style={{ display: 'none' }} />

        <button className="btn btn-accent" onClick={download} disabled={generating}>
          {generating ? '⏳ Generating…' : '⬇️ Download Summary Card'}
        </button>
      </div>
    </div>
  );
}

// ── WrappedScreen (main export) ───────────────────────────────────────────────

export default function WrappedScreen({ game, teamName, bigTeam, nickname, gameCode }) {
  const [slides] = useState(() => buildSlides(game));
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  const goNext = () => {
    if (done) return;
    clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => {
      if (idx >= slides.length - 1) {
        setDone(true);
      } else {
        setIdx(i => i + 1);
      }
      setVisible(true);
    }, 220);
  };

  useEffect(() => {
    if (done) return;
    const duration = slides[idx]?.type === 'photo' ? 2800 : 4200;
    timerRef.current = setTimeout(goNext, duration);
    return () => clearTimeout(timerRef.current);
  }, [idx, done]); // eslint-disable-line

  if (done) {
    return (
      <SummaryCard
        game={game}
        teamName={teamName}
        bigTeam={bigTeam}
        nickname={nickname}
        gameCode={gameCode}
      />
    );
  }

  const slide = slides[idx];
  const progress = (idx + 1) / slides.length;
  const isPhoto = slide?.type === 'photo';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: '#080812',
        display: 'flex', flexDirection: 'column',
        cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
      }}
      onClick={goNext}
    >
      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#ffffff15', zIndex: 10 }}>
        <div style={{ height: '100%', background: '#ffffffbb', width: `${progress * 100}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Skip button */}
      <div style={{ position: 'absolute', top: '1.1rem', right: '1rem', zIndex: 10 }} onClick={e => e.stopPropagation()}>
        <button
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#888', fontSize: '0.78rem', padding: '0.35rem 0.8rem',
            borderRadius: '999px', cursor: 'pointer',
          }}
          onClick={() => setDone(true)}
        >
          Skip →
        </button>
      </div>

      {/* Slide */}
      <div
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          padding: isPhoto ? 0 : '2.5rem 1.5rem',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {slide?.type === 'intro' && <IntroSlide {...slide} />}
        {slide?.type === 'winner' && <WinnerSlide {...slide} />}
        {slide?.type === 'standings' && <StandingsSlide {...slide} />}
        {slide?.type === 'stat' && <StatSlide {...slide} />}
        {slide?.type === 'photo' && <PhotoSlide {...slide} />}
        {slide?.type === 'credits' && <CreditsSlide {...slide} />}
      </div>

      {/* Tap hint on first slide */}
      {idx === 0 && (
        <p style={{ textAlign: 'center', color: '#ffffff22', fontSize: '0.75rem', paddingBottom: '1.5rem', flexShrink: 0 }}>
          Tap to advance
        </p>
      )}
    </div>
  );
}

// ── NicknameInput — exported helper used by TeamPage ─────────────────────────

export function NicknameInput({ gameCode, teamName, currentNickname }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = async () => {
    const trimmed = draft.trim();
    await update(ref(db, `games/${gameCode}/teams/${teamName}`), { nickname: trimmed || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          maxLength={20}
          placeholder="Team nickname…"
          style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem', width: '130px' }}
        />
        <button
          onClick={save}
          style={{ background: 'none', border: 'none', color: 'var(--color-success)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0.15rem' }}
        >✓</button>
        <button
          onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 0.15rem' }}
        >✗</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(currentNickname || ''); setEditing(true); }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: '0.78rem',
        color: currentNickname ? 'var(--color-text-muted)' : 'var(--color-accent)',
        textDecoration: currentNickname ? 'none' : 'underline',
      }}
    >
      {currentNickname ? `🎭 ${currentNickname}` : '+ Add nickname'}
    </button>
  );
}
