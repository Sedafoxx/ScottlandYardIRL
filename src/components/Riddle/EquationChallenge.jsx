import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, get } from 'firebase/database';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../../utils/hints';

const OPERATORS = new Set(['+', '-', '×', '÷']);

function evalTokens(tokens) {
  const nums = [], ops = [];
  for (const t of tokens) {
    if (OPERATORS.has(t)) {
      ops.push(t);
    } else {
      const n = Number(t);
      if (isNaN(n)) return null;
      nums.push(n);
    }
  }
  if (nums.length !== ops.length + 1) return null;

  let i = 0;
  while (i < ops.length) {
    if (ops[i] === '×' || ops[i] === '÷') {
      const r = ops[i] === '×' ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1];
      nums.splice(i, 2, r);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }

  let result = nums[0];
  for (let j = 0; j < ops.length; j++) {
    result = ops[j] === '+' ? result + nums[j + 1] : result - nums[j + 1];
  }
  return result;
}

function isValidEquation(placed) {
  const tiles = placed.map(p => p.tile);
  const eqIdx = tiles.indexOf('=');
  if (eqIdx < 1 || eqIdx >= tiles.length - 1) return false;
  const lhs = evalTokens(tiles.slice(0, eqIdx));
  const rhs = evalTokens(tiles.slice(eqIdx + 1));
  return lhs !== null && rhs !== null && Math.abs(lhs - rhs) < 0.0001;
}

function Tile({ item, onClick, disabled }) {
  const isOp = OPERATORS.has(item.tile);
  const isEq = item.tile === '=';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 44, height: 44, padding: isOp || isEq ? '0' : '0 10px',
        borderRadius: 8, fontWeight: 700, fontSize: '1.1rem',
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none', flexShrink: 0,
        background: isEq
          ? 'var(--color-accent)'
          : isOp ? 'var(--color-surface)' : 'var(--color-bg)',
        color: isEq ? '#1a1a2e' : isOp ? 'var(--color-accent)' : 'var(--color-text)',
        border: isEq ? 'none' : `2px solid ${isOp ? 'var(--color-accent)' : 'var(--color-border)'}`,
        transition: 'transform 0.1s',
      }}
    >
      {item.tile}
    </button>
  );
}

function DifficultyPicker({ options, onSelect, doubleZone }) {
  const descriptions = {
    easy: '2 operations',
    medium: '3 operations',
    hard: '4 operations',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Arrange tiles to form a valid equation. Choose your difficulty.
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
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>
              {descriptions[diff]} · {opt.tiles.length} tiles
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default function EquationChallenge({ puzzle, gameCode, teamName, riddleIndex, doubleZone, zoneFreezeUntil }) {
  const [chosenDiff, setChosenDiff] = useState(null);
  const [placed, setPlaced] = useState([]);
  const [available, setAvailable] = useState([]);
  const [won, setWon] = useState(false);
  const [incorrect, setIncorrect] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!chosenDiff) {
    return <DifficultyPicker options={puzzle.options} doubleZone={doubleZone} onSelect={(diff) => {
      setChosenDiff(diff);
      setPlaced([]);
      setAvailable(
        [...puzzle.options[diff].tiles]
          .sort(() => Math.random() - 0.5)
          .map((tile, i) => ({ id: i, tile }))
      );
    }} />;
  }

  const activePuzzle = puzzle.options[chosenDiff];
  const cfg = DIFFICULTY_CONFIG[chosenDiff];
  const effectiveReduction = doubleZone ? Math.min(activePuzzle.reduction * 2, 0.9) : activePuzzle.reduction;

  const addTile = (item) => {
    if (won) return;
    setAvailable(prev => prev.filter(t => t.id !== item.id));
    setPlaced(prev => [...prev, item]);
  };

  const removeTile = (item) => {
    if (won) return;
    setPlaced(prev => prev.filter(t => t.id !== item.id));
    setAvailable(prev => [...prev, item]);
  };

  const reset = () => {
    setPlaced([]);
    setAvailable(prev => {
      const all = [...placed, ...prev].sort((a, b) => a.id - b.id);
      return all;
    });
  };

  const allPlaced = available.length === 0;

  const check = async () => {
    if (!allPlaced) return;
    if (!isValidEquation(placed)) {
      setIncorrect(true);
      setTimeout(() => setIncorrect(false), 800);
      return;
    }
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
        borderRadius: 8, borderLeft: `3px solid ${cfg.color}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
          {cfg.label} Equation
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
          +{activePuzzle.points} pts · -{effectiveReduction * 100}% radius{doubleZone ? ' ⚡' : ''}
        </span>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Arrange all tiles to form a valid equation.
        Tap a tile to place it — tap a placed tile to take it back.
      </p>

      <div style={{
        minHeight: 56, padding: '0.5rem 0.75rem',
        background: 'var(--color-bg)', borderRadius: 8,
        border: `2px solid ${incorrect ? 'var(--color-primary)' : won ? 'var(--color-success)' : 'var(--color-border)'}`,
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        transition: 'border-color 0.2s',
      }}>
        {placed.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            Tap tiles below to build your equation…
          </span>
        ) : (
          placed.map(item => (
            <Tile key={item.id} item={item} onClick={() => removeTile(item)} disabled={won} />
          ))
        )}
      </div>

      {!won && (
        <>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
            padding: '0.5rem', background: 'var(--color-surface)', borderRadius: 8, minHeight: 56,
          }}>
            {available.map(item => (
              <Tile key={item.id} item={item} onClick={() => addTile(item)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-accent"
              style={{ flex: 1 }}
              onClick={check}
              disabled={!allPlaced}
            >
              Check Equation
            </button>
            {placed.length > 0 && (
              <button
                className="btn btn-outline"
                style={{ width: 'auto', padding: '0 1rem' }}
                onClick={reset}
              >
                Reset
              </button>
            )}
          </div>
          {placed.length === 0 && (
            <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={() => setChosenDiff(null)}>
              ← Change difficulty
            </button>
          )}
          <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={async () => {
            try { await update(ref(db, `games/${gameCode}/teams/${teamName}`), { currentRiddle: riddleIndex + 1 }); }
            catch (e) { console.error(e); }
          }}>
            Skip (no points)
          </button>
        </>
      )}

      {won && (
        <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}>
          {saving ? 'Saving…' : `Correct! +${activePuzzle.points} pts — zone updated!`}
        </p>
      )}
    </div>
  );
}
