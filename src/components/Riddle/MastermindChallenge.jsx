import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, get } from 'firebase/database';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../../utils/hints';

const PEG_COLORS = {
  1: '#e74c3c',
  2: '#3498db',
  3: '#2ecc71',
  4: '#e5c100',
  5: '#9b59b6',
  6: '#e67e22',
};

function evalCode(guess, secret) {
  let black = 0;
  const sLeft = [], gLeft = [];
  guess.forEach((d, i) => {
    if (d === secret[i]) { black++; }
    else { sLeft.push(secret[i]); gLeft.push(d); }
  });
  let white = 0;
  gLeft.forEach(d => {
    const idx = sLeft.indexOf(d);
    if (idx !== -1) { white++; sLeft.splice(idx, 1); }
  });
  return { black, white };
}

function CodePeg({ digit, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: digit != null ? PEG_COLORS[digit] : 'transparent',
      border: `2px solid ${digit != null ? 'transparent' : 'var(--color-border)'}`,
      boxShadow: digit != null ? `0 2px 8px ${PEG_COLORS[digit]}55` : 'none',
    }} />
  );
}

function FeedbackDots({ black, white, total }) {
  const cols = 2;
  const rows = Math.ceil(total / cols);
  const dots = [
    ...Array(black).fill('black'),
    ...Array(white).fill('white'),
    ...Array(total - black - white).fill('empty'),
  ];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 10px)`,
      gridTemplateRows: `repeat(${rows}, 10px)`,
      gap: 3, alignSelf: 'center',
    }}>
      {dots.map((t, i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: t === 'black' ? 'var(--color-success)' : t === 'white' ? 'var(--color-accent)' : 'transparent',
          border: t === 'empty' ? '1px solid var(--color-border)' : 'none',
        }} />
      ))}
    </div>
  );
}

function DifficultyPicker({ options, onSelect, doubleZone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Choose your difficulty. Harder = more points and a bigger zone reduction.
        {doubleZone && <strong style={{ color: '#f39c12' }}> ⚡ Double Zone active!</strong>}
      </p>
      {['easy', 'medium', 'hard'].map((diff) => {
        const c = DIFFICULTY_CONFIG[diff];
        const opt = options[diff];
        const r = DIFFICULTY_CONFIG[diff].reduction;
        const displayReduction = doubleZone ? Math.min(r * 2, 0.9) * 100 : r * 100;
        return (
          <button
            key={diff}
            onClick={() => onSelect(diff)}
            style={{
              background: 'var(--color-bg)',
              border: `1px solid ${c.color}`,
              borderRadius: '8px',
              padding: '0.75rem',
              textAlign: 'left',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>
                {c.label}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  -{displayReduction}% radius{doubleZone ? ' ⚡' : ''}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
                  +{opt.points} pts
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>
              {opt.codeLength} digits (1–{opt.digitRange}) · {opt.maxAttempts} attempts
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default function MastermindChallenge({ puzzle, gameCode, teamName, riddleIndex, doubleZone, zoneFreezeUntil }) {
  const [chosenDiff, setChosenDiff] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState([]);
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!chosenDiff) {
    return <DifficultyPicker options={puzzle.options} onSelect={setChosenDiff} doubleZone={doubleZone} />;
  }

  const activePuzzle = puzzle.options[chosenDiff];
  const cfg = DIFFICULTY_CONFIG[chosenDiff];
  const effectiveReduction = doubleZone ? Math.min(DIFFICULTY_CONFIG[chosenDiff].reduction * 2, 0.9) : DIFFICULTY_CONFIG[chosenDiff].reduction;
  const { codeLength, digitRange, maxAttempts } = activePuzzle;
  const secret = activePuzzle.answer.split('').map(Number);

  const addDigit = (d) => {
    if (current.length < codeLength && !won && !lost) setCurrent([...current, d]);
  };

  const removeLast = () => setCurrent(current.slice(0, -1));

  const submit = async () => {
    if (current.length !== codeLength) return;
    const { black, white } = evalCode(current, secret);
    const next = [...guesses, { code: current, black, white }];
    setGuesses(next);
    setCurrent([]);

    if (black === codeLength) {
      setWon(true);
      setSaving(true);
      try {
        const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);
        const fugRef = ref(db, `games/${gameCode}/fugitive/lastUpdate`);
        const [teamSnap, fugSnap] = await Promise.all([get(teamRef), get(fugRef)]);
        const td = teamSnap.val();
        const fug = fugSnap.val();
        const curRadius = td?.currentHint?.radius ?? STARTING_RADIUS;
        const isZoneFrozen = (zoneFreezeUntil ?? 0) > Date.now();
        const hasDoubleZone = td?.doubleZone === true;
        const effectiveReduction = hasDoubleZone ? Math.min(DIFFICULTY_CONFIG[chosenDiff].reduction * 2, 0.9) : DIFFICULTY_CONFIG[chosenDiff].reduction;
        const newRadius = Math.max(Math.round(curRadius * (1 - effectiveReduction)), 30);
        const updates = {
          currentRiddle: riddleIndex + 1,
          score: (td?.score ?? 0) + activePuzzle.points,
        };
        if (!isZoneFrozen && fug?.lat != null) updates.currentHint = generateHint(fug.lat, fug.lng, newRadius);
        if (hasDoubleZone) updates.doubleZone = null;
        await update(teamRef, updates);
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    } else if (next.length >= maxAttempts) {
      setLost(true);
    }
  };

  const attemptsLeft = maxAttempts - guesses.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
        borderRadius: 8, borderLeft: `3px solid ${cfg.color}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
          {cfg.label} Code Cracker
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
          +{activePuzzle.points} pts · -{effectiveReduction * 100}% radius{doubleZone ? ' ⚡' : ''}
        </span>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Guess the {codeLength}-digit code using digits 1–{digitRange}.{' '}
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Green</span> = right digit, right place.{' '}
        <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Amber</span> = right digit, wrong place.
      </p>

      {guesses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {guesses.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {g.code.map((d, ci) => <CodePeg key={ci} digit={d} />)}
              </div>
              <FeedbackDots black={g.black} white={g.white} total={codeLength} />
            </div>
          ))}
        </div>
      )}

      {won && (
        <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}>
          {saving ? 'Saving…' : `Code cracked! +${activePuzzle.points} pts — zone updated!`}
        </p>
      )}

      {lost && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            Out of attempts! The code was:
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            {secret.map((d, i) => <CodePeg key={i} digit={d} />)}
          </div>
          <button className="btn btn-outline" style={{ marginTop: '0.5rem' }} onClick={async () => {
            try { await update(ref(db, `games/${gameCode}/teams/${teamName}`), { currentRiddle: riddleIndex + 1 }); }
            catch (e) { console.error(e); }
          }}>
            Next challenge →
          </button>
        </div>
      )}

      {!won && !lost && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: codeLength }, (_, i) => (
                <CodePeg key={i} digit={current[i] ?? null} />
              ))}
            </div>
            {current.length > 0 && (
              <button
                onClick={removeLast}
                style={{
                  background: 'none', border: '1px solid var(--color-border)',
                  borderRadius: 8, padding: '0.3rem 0.6rem',
                  color: 'var(--color-text-muted)', cursor: 'pointer',
                  fontSize: '1rem', lineHeight: 1,
                }}
              >
                ←
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Array.from({ length: digitRange }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                onClick={() => addDigit(d)}
                disabled={current.length >= codeLength}
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: PEG_COLORS[d], border: 'none',
                  color: d === 4 ? '#1a1a2e' : '#fff',
                  fontWeight: 800, fontSize: '1rem',
                  cursor: current.length >= codeLength ? 'not-allowed' : 'pointer',
                  opacity: current.length >= codeLength ? 0.35 : 1,
                  boxShadow: `0 2px 8px ${PEG_COLORS[d]}55`,
                  transition: 'opacity 0.15s, transform 0.1s',
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
            {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
          </p>

          <button
            className="btn btn-accent"
            onClick={submit}
            disabled={current.length !== codeLength}
          >
            Submit Code
          </button>

          {guesses.length === 0 ? (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={() => setChosenDiff(null)}>
              ← Change difficulty
            </button>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={async () => {
              try { await update(ref(db, `games/${gameCode}/teams/${teamName}`), { currentRiddle: riddleIndex + 1 }); }
              catch (e) { console.error(e); }
            }}>
              Skip (no points)
            </button>
          )}
        </>
      )}
    </div>
  );
}
