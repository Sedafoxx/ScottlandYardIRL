import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, get } from 'firebase/database';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../../utils/hints';

const MAX_GUESSES = 6;
const WORD_LEN = 5;

function evalGuess(guess, target) {
  const result = Array(WORD_LEN).fill('absent');
  const tArr = target.split('');
  const gArr = guess.split('');
  gArr.forEach((l, i) => {
    if (l === tArr[i]) { result[i] = 'correct'; tArr[i] = null; gArr[i] = null; }
  });
  gArr.forEach((l, i) => {
    if (l == null) return;
    const j = tArr.indexOf(l);
    if (j !== -1) { result[i] = 'present'; tArr[j] = null; }
  });
  return result;
}

const TILE_COLOR = { correct: '#538d4e', present: '#b59f3b', absent: '#3a3a3c' };

function Tile({ letter, state, isCurrent }) {
  const bg = state ? TILE_COLOR[state] : 'transparent';
  const border = isCurrent && !state ? '2px solid var(--color-accent)' : state ? '2px solid transparent' : '2px solid var(--color-border)';
  return (
    <div style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg, border, borderRadius: 6,
      fontSize: '1.2rem', fontWeight: 800,
      color: state ? '#fff' : 'var(--color-text)',
      userSelect: 'none',
    }}>
      {letter !== ' ' ? letter : ''}
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
        const displayReduction = doubleZone ? Math.min(opt.reduction * 2, 0.9) * 100 : opt.reduction * 100;
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
          </button>
        );
      })}
    </div>
  );
}

export default function WordleChallenge({ puzzle, gameCode, teamName, riddleIndex, doubleZone, zoneFreezeUntil }) {
  const [chosenDiff, setChosenDiff] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState('');
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!chosenDiff) {
    return <DifficultyPicker options={puzzle.options} onSelect={setChosenDiff} doubleZone={doubleZone} />;
  }

  const activePuzzle = puzzle.options[chosenDiff];
  const cfg = DIFFICULTY_CONFIG[chosenDiff];
  const effectiveReduction = doubleZone ? Math.min(activePuzzle.reduction * 2, 0.9) : activePuzzle.reduction;
  const target = activePuzzle.answer.toUpperCase();

  const submit = async () => {
    const guess = current.toUpperCase().trim();
    if (guess.length !== WORD_LEN) {
      setError(`Enter a ${WORD_LEN}-letter word.`);
      return;
    }
    setError('');
    const result = evalGuess(guess, target);
    const next = [...guesses, { word: guess, result }];
    setGuesses(next);
    setCurrent('');

    if (guess === target) {
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
        const effectiveReduction = hasDoubleZone ? Math.min(activePuzzle.reduction * 2, 0.9) : activePuzzle.reduction;
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
    } else if (next.length >= MAX_GUESSES) {
      setLost(true);
    }
  };

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => {
    if (i < guesses.length) return guesses[i];
    if (i === guesses.length && !won && !lost) {
      return { word: current.toUpperCase().padEnd(WORD_LEN, ' '), result: null, isCurrent: true };
    }
    return { word: '     ', result: null };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
      <div style={{
        width: '100%', padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
        borderRadius: 8, borderLeft: `3px solid ${cfg.color}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
          {cfg.label} Wordle
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
          +{activePuzzle.points} pts · -{effectiveReduction * 100}% radius{doubleZone ? ' ⚡' : ''}
        </span>
      </div>

      {activePuzzle.hint && (
        <p style={{ width: '100%', fontSize: '0.875rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Hint: {activePuzzle.hint}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: WORD_LEN }, (_, ci) => (
              <Tile
                key={ci}
                letter={row.word[ci] ?? ' '}
                state={row.result?.[ci] ?? null}
                isCurrent={!!row.isCurrent}
              />
            ))}
          </div>
        ))}
      </div>

      {won && (
        <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}>
          {saving ? 'Saving…' : `Correct! +${activePuzzle.points} pts — zone updated!`}
        </p>
      )}

      {lost && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <p style={{ color: 'var(--color-primary)', fontWeight: 600, textAlign: 'center' }}>
            Out of guesses! The word was <strong>{target}</strong>.
          </p>
          <button className="btn btn-outline" onClick={async () => {
            try { await update(ref(db, `games/${gameCode}/teams/${teamName}`), { currentRiddle: riddleIndex + 1 }); }
            catch (e) { console.error(e); }
          }}>
            Next challenge →
          </button>
        </div>
      )}

      {!won && !lost && (
        <>
          <input
            type="text"
            value={current}
            onChange={e => {
              setCurrent(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, WORD_LEN).toUpperCase());
              setError('');
            }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="GUESS"
            autoCapitalize="characters"
            style={{
              textTransform: 'uppercase', letterSpacing: '0.25em',
              textAlign: 'center', fontSize: '1.2rem', width: '100%',
            }}
            maxLength={WORD_LEN}
          />
          {error && <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{error}</p>}
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
            {MAX_GUESSES - guesses.length} guess{MAX_GUESSES - guesses.length !== 1 ? 'es' : ''} remaining
          </p>
          <button
            className="btn btn-accent"
            onClick={submit}
            disabled={current.length !== WORD_LEN}
            style={{ width: '100%' }}
          >
            Guess
          </button>
          {guesses.length === 0 ? (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', width: '100%' }} onClick={() => setChosenDiff(null)}>
              ← Change difficulty
            </button>
          ) : (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', width: '100%' }} onClick={async () => {
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
