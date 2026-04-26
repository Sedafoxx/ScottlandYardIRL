import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, get } from 'firebase/database';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../../utils/hints';

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

export default function PuzzleChallenge({ puzzle, gameCode, teamName, riddleIndex, doubleZone, zoneFreezeUntil }) {
  const [chosenDiff, setChosenDiff] = useState(null);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | wrong | submitting | correct

  if (!chosenDiff) {
    return <DifficultyPicker options={puzzle.options} onSelect={setChosenDiff} doubleZone={doubleZone} />;
  }

  const activePuzzle = puzzle.options[chosenDiff];
  const cfg = DIFFICULTY_CONFIG[chosenDiff];
  const effectiveReduction = doubleZone ? Math.min(activePuzzle.reduction * 2, 0.9) : activePuzzle.reduction;

  const submit = async () => {
    const normalized = answer.trim().toUpperCase();
    if (!normalized) return;

    if (normalized !== activePuzzle.answer.toUpperCase()) {
      setStatus('wrong');
      return;
    }

    setStatus('submitting');
    try {
      const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);
      const fugitiveRef = ref(db, `games/${gameCode}/fugitive/lastUpdate`);
      const [teamSnap, fugitiveSnap] = await Promise.all([get(teamRef), get(fugitiveRef)]);

      const teamData = teamSnap.val();
      const fugitive = fugitiveSnap.val();
      const currentRadius = teamData?.currentHint?.radius ?? STARTING_RADIUS;
      const isZoneFrozen = (zoneFreezeUntil ?? 0) > Date.now();
      const hasDoubleZone = teamData?.doubleZone === true;
      const effectiveReduction = hasDoubleZone ? Math.min(activePuzzle.reduction * 2, 0.9) : activePuzzle.reduction;
      const newRadius = Math.max(Math.round(currentRadius * (1 - effectiveReduction)), 30);

      const updates = {
        currentRiddle: riddleIndex + 1,
        score: (teamData?.score ?? 0) + activePuzzle.points,
      };

      if (!isZoneFrozen && fugitive?.lat != null) {
        updates.currentHint = generateHint(fugitive.lat, fugitive.lng, newRadius);
      }
      if (hasDoubleZone) updates.doubleZone = null;

      await update(teamRef, updates);
      setStatus('correct');
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  if (status === 'correct') {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-success)' }}>
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>Correct! +{activePuzzle.points} pts</p>
        <p className="text-muted" style={{ marginTop: '0.25rem' }}>Zone updated — check the map!</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '0.5rem 0.75rem',
        background: 'var(--color-bg)',
        borderRadius: '8px',
        borderLeft: `3px solid ${cfg.color}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase' }}>
          {cfg.label} Puzzle
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
          +{activePuzzle.points} pts · -{effectiveReduction * 100}% radius{doubleZone ? ' ⚡' : ''}
        </span>
      </div>

      <p style={{ fontSize: '1.15rem', lineHeight: 1.7, fontWeight: 500, letterSpacing: '0.01em' }}>
        {activePuzzle.question}
      </p>

      <input
        type="text"
        placeholder="Your answer…"
        value={answer}
        onChange={(e) => { setAnswer(e.target.value); if (status === 'wrong') setStatus('idle'); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ borderColor: status === 'wrong' ? 'var(--color-primary)' : undefined }}
        autoCapitalize="characters"
      />

      {status === 'wrong' && (
        <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>
          Not quite — try again.
        </p>
      )}

      <button
        className="btn btn-accent"
        onClick={submit}
        disabled={!answer.trim() || status === 'submitting'}
      >
        {status === 'submitting' ? 'Checking…' : 'Submit Answer'}
      </button>

      {status === 'idle' && (
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
    </div>
  );
}
