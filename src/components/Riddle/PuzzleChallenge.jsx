import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, get } from 'firebase/database';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../../utils/hints';

export default function PuzzleChallenge({ puzzle, gameCode, teamName, riddleIndex }) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | wrong | submitting | correct

  const cfg = DIFFICULTY_CONFIG[puzzle.difficulty] ?? DIFFICULTY_CONFIG.easy;

  const submit = async () => {
    const normalized = answer.trim().toUpperCase();
    if (!normalized) return;

    if (normalized !== puzzle.answer.toUpperCase()) {
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
      const newRadius = Math.max(Math.round(currentRadius * (1 - puzzle.reduction)), 30);

      const updates = {
        currentRiddle: riddleIndex + 1,
        score: (teamData?.score ?? 0) + puzzle.points,
      };

      if (fugitive?.lat != null) {
        updates.currentHint = generateHint(fugitive.lat, fugitive.lng, newRadius);
      }

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
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>Correct! +{puzzle.points} pts</p>
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
          {cfg.label} puzzle
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>
          +{puzzle.points} pts · -{puzzle.reduction * 100}% radius
        </span>
      </div>

      <p style={{ fontSize: '1.15rem', lineHeight: 1.7, fontWeight: 500, letterSpacing: '0.01em' }}>
        {puzzle.question}
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
    </div>
  );
}
