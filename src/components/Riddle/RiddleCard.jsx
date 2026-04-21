import { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { ref, set, onValue } from 'firebase/database';
import PhotoChallenge from './PhotoChallenge';
import PuzzleChallenge from './PuzzleChallenge';

export default function RiddleCard({ riddle, gameCode, teamName, riddleIndex, totalRiddles }) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | waiting | error
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    if (riddle.type !== 'poem') return;
    return onValue(
      ref(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`),
      (snap) => { if (snap.exists()) setSubmission(snap.val()); }
    );
  }, [gameCode, teamName, riddleIndex, riddle.type]);

  const submitPoem = async () => {
    if (!answer.trim()) return;
    setStatus('submitting');
    try {
      await set(ref(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        type: 'poem',
        text: answer.trim(),
        status: 'pending',
        submittedAt: Date.now(),
      });
      setStatus('waiting');
    } catch (err) {
      console.error('Poem submission failed:', err);
      setStatus('error');
    }
  };

  // ── Poem ─────────────────────────────────────────────────────────────────────
  if (riddle.type === 'poem') {
    const isPending = submission?.status === 'pending' || status === 'waiting';
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          Challenge {riddleIndex + 1} of {totalRiddles}
        </p>

        <div>
          <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Complete the poem:</p>
          <p style={{ fontSize: '1.1rem', fontStyle: 'italic', lineHeight: 1.7, color: 'var(--color-accent)' }}>
            "Welcome to Scotland Yard,<br />
            Vienna Edition…"
          </p>
        </div>

        {isPending ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: '#f5a623', boxShadow: '0 0 0 3px color-mix(in srgb, #f5a623 30%, transparent)' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Poem submitted — waiting for admin approval…</p>
          </div>
        ) : (
          <>
            <textarea
              placeholder="Continue the poem any way you like…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              style={{
                width: '100%', resize: 'vertical', padding: '0.6rem 0.75rem',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)', fontSize: '0.9rem',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {status === 'error' && (
              <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>
                Something went wrong. Check your connection and try again.
              </p>
            )}
            <button
              className="btn btn-accent"
              onClick={submitPoem}
              disabled={!answer.trim() || status === 'submitting'}
            >
              {status === 'submitting' ? 'Sending…' : 'Submit Poem'}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Puzzle ────────────────────────────────────────────────────────────────────
  if (riddle.type === 'puzzle') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          Challenge {riddleIndex + 1} of {totalRiddles}
        </p>
        <PuzzleChallenge
          puzzle={riddle}
          gameCode={gameCode}
          teamName={teamName}
          riddleIndex={riddleIndex}
        />
      </div>
    );
  }

  // ── Photo challenge ───────────────────────────────────────────────────────────
  if (riddle.type === 'photo') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          Challenge {riddleIndex + 1} of {totalRiddles}
        </p>
        <PhotoChallenge
          riddle={riddle}
          gameCode={gameCode}
          teamName={teamName}
          riddleIndex={riddleIndex}
        />
      </div>
    );
  }

  return null;
}
