import { useState } from 'react';
import { db } from '../../firebase/config';
import { ref, update, set } from 'firebase/database';

export default function RiddleCard({ riddle, gameCode, teamName, riddleIndex, totalRiddles }) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | correct | wrong

  const submit = async () => {
    const normalized = answer.trim().toLowerCase();
    if (normalized === riddle.answer.toLowerCase()) {
      setStatus('correct');

      // Unlock hint and advance riddle
      const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);
      const hintsRef = ref(db, `games/${gameCode}/teams/${teamName}/hintsUnlocked/${riddleIndex}`);
      await set(hintsRef, riddle.hint);
      await update(teamRef, {
        currentRiddle: riddleIndex + 1,
        score: (await (await import('firebase/database')).get(teamRef)).val()?.score + 10 ?? 10,
      });
    } else {
      setStatus('wrong');
      setTimeout(() => setStatus('idle'), 1500);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          Riddle {riddleIndex + 1} of {totalRiddles}
        </p>
        {status === 'correct' && (
          <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.875rem' }}>+10 pts</span>
        )}
      </div>

      <p style={{ fontSize: '1.125rem', lineHeight: 1.6, fontWeight: 500 }}>
        {riddle.question}
      </p>

      {status === 'correct' ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-success)' }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>Correct!</p>
          <p className="text-muted" style={{ marginTop: '0.25rem' }}>Hint unlocked below</p>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Your answer..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            style={{
              borderColor: status === 'wrong' ? 'var(--color-primary)' : undefined,
            }}
          />
          {status === 'wrong' && (
            <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>
              Wrong answer. Try again!
            </p>
          )}
          <button
            className="btn btn-accent"
            onClick={submit}
            disabled={!answer.trim()}
          >
            Submit Answer
          </button>
        </>
      )}
    </div>
  );
}
