import { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { ref, update, runTransaction } from 'firebase/database';
import { POWER_UP_CONFIG } from '../../data/powerUps';

function Overlay({ color, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(8, 8, 18, 0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', gap: '0.75rem',
      borderTop: `4px solid ${color}`,
    }}>
      {children}
    </div>
  );
}

export default function PowerUpOverlay({ powerUp, gameCode, teamName, teams }) {
  const [answer, setAnswer] = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle | submitting | wrong
  const [sabotageTarget, setSabotageTarget] = useState(null);
  const [sabotaging, setSabotaging] = useState(false);
  const [loserDismissed, setLoserDismissed] = useState(false);

  useEffect(() => {
    setAnswer('');
    setSubmitStatus('idle');
    setSabotageTarget(null);
    setSabotaging(false);
    setLoserDismissed(false);
  }, [powerUp?.launchedAt]);

  // Auto-dismiss "someone else won" screen after 4 seconds
  const someoneElseWon = powerUp?.winner && powerUp.winner !== teamName;
  useEffect(() => {
    if (!someoneElseWon) return;
    const t = setTimeout(() => setLoserDismissed(true), 4000);
    return () => clearTimeout(t);
  }, [someoneElseWon]);

  if (!powerUp || (powerUp.status !== 'active' && powerUp.status !== 'claimed')) return null;
  if (loserDismissed) return null;

  const cfg = POWER_UP_CONFIG[powerUp.type] ?? POWER_UP_CONFIG.live_feed;
  const weWon = powerUp.winner === teamName;

  const applyEffect = async () => {
    const now = Date.now();
    const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);
    switch (powerUp.type) {
      case 'live_feed':
        await update(teamRef, { liveFeedUntil: now + 2 * 60 * 1000 });
        break;
      case 'direction_beacon':
        await update(teamRef, { directionBeaconUntil: now + 2 * 60 * 1000 });
        break;
      case 'double_zone':
        await update(teamRef, { doubleZone: true });
        break;
      case 'zone_freeze':
        await update(ref(db, `games/${gameCode}`), { zoneFreezeUntil: now + 3 * 60 * 1000 });
        break;
      case 'selfie_demand':
        await update(ref(db, `games/${gameCode}`), {
          selfieRequest: { requestedBy: teamName, requestedAt: now, status: 'pending' },
        });
        break;
      // sabotage: applied separately after target is picked
    }
  };

  const submit = async () => {
    const normalized = answer.trim().toUpperCase();
    if (!normalized) return;
    if (normalized !== powerUp.challenge?.answer?.toUpperCase()) {
      setSubmitStatus('wrong');
      return;
    }
    setSubmitStatus('submitting');
    try {
      const powerUpRef = ref(db, `games/${gameCode}/powerUp`);
      const result = await runTransaction(powerUpRef, (current) => {
        if (!current || current.winner) return; // abort — someone already won
        return { ...current, winner: teamName, claimedAt: Date.now(), status: 'claimed' };
      });
      if (result.committed) {
        if (powerUp.type !== 'sabotage') await applyEffect();
        // status will update via Firebase listener — no need to setSubmitStatus here
      } else {
        setSubmitStatus('idle'); // someone beat us — Firebase update will show their win
      }
    } catch (e) {
      console.error(e);
      setSubmitStatus('idle');
    }
  };

  const pickSabotageTarget = async (target) => {
    setSabotaging(true);
    try {
      setSabotageTarget(target);
      await update(ref(db, `games/${gameCode}/teams/${target}`), {
        sabotagedUntil: Date.now() + 90 * 1000,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSabotaging(false);
    }
  };

  // ── Someone else won ──────────────────────────────────────────────────────
  if (someoneElseWon) {
    return (
      <Overlay color={cfg.color}>
        <p style={{ fontSize: '2.5rem', textAlign: 'center' }}>{cfg.emoji}</p>
        <p style={{ fontSize: '1.3rem', fontWeight: 800, color: cfg.color, textAlign: 'center' }}>
          {powerUp.winner} claimed it!
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
          They won {cfg.label}
        </p>
        <button
          onClick={() => setLoserDismissed(true)}
          style={{
            marginTop: '0.5rem', padding: '0.75rem 2rem', borderRadius: 8,
            fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
            background: 'var(--color-surface)', color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          Continue
        </button>
      </Overlay>
    );
  }

  // ── We won — sabotage target picker ──────────────────────────────────────
  if (weWon && powerUp.type === 'sabotage' && !sabotageTarget) {
    const otherTeams = teams.filter(t => t !== teamName);
    return (
      <Overlay color={cfg.color}>
        <p style={{ fontSize: '2.5rem', textAlign: 'center' }}>💣</p>
        <p style={{ fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', color: cfg.color }}>
          You got it! Pick your target.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: 320 }}>
          {otherTeams.map(t => (
            <button
              key={t}
              className="btn btn-primary"
              style={{ background: cfg.color, borderColor: cfg.color }}
              onClick={() => pickSabotageTarget(t)}
              disabled={sabotaging}
            >
              {t}
            </button>
          ))}
        </div>
      </Overlay>
    );
  }

  // ── We won ────────────────────────────────────────────────────────────────
  if (weWon) {
    return (
      <Overlay color={cfg.color}>
        <p style={{ fontSize: '3rem', textAlign: 'center' }}>🏆</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800, color: cfg.color, textAlign: 'center' }}>
          You got it!
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
          {cfg.desc}
          {sabotageTarget && ` — ${sabotageTarget} is locked out for 90 seconds!`}
        </p>
        <button
          onClick={() => setLoserDismissed(true)}
          style={{
            marginTop: '0.5rem', padding: '0.75rem 2rem', borderRadius: 8,
            fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
            background: cfg.color, color: '#fff', border: 'none',
          }}
        >
          Continue
        </button>
      </Overlay>
    );
  }

  // ── Active challenge ──────────────────────────────────────────────────────
  return (
    <Overlay color={cfg.color}>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.15em',
          color: cfg.color, textTransform: 'uppercase',
        }}>
          ⚡ Power Up Alarm
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
          {cfg.emoji} {cfg.label}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem', lineHeight: 1.5 }}>
          First to answer wins: <strong style={{ color: cfg.color }}>{cfg.desc}</strong>
        </p>
      </div>

      <div style={{
        background: 'var(--color-surface)', borderRadius: 10, padding: '1rem',
        border: `1px solid ${cfg.color}44`, width: '100%', maxWidth: 360,
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <p style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.6 }}>
          {powerUp.challenge?.question}
        </p>
        <input
          type="text"
          placeholder="Your answer…"
          value={answer}
          autoFocus
          onChange={e => { setAnswer(e.target.value); if (submitStatus === 'wrong') setSubmitStatus('idle'); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ borderColor: submitStatus === 'wrong' ? 'var(--color-primary)' : cfg.color }}
          autoCapitalize="characters"
        />
        {submitStatus === 'wrong' && (
          <p style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>Not quite — try again!</p>
        )}
        <button
          onClick={submit}
          disabled={!answer.trim() || submitStatus === 'submitting'}
          style={{
            padding: '0.75rem', borderRadius: 8, fontWeight: 700,
            fontSize: '1rem', cursor: 'pointer', border: 'none',
            background: cfg.color, color: '#fff',
            opacity: (!answer.trim() || submitStatus === 'submitting') ? 0.5 : 1,
          }}
        >
          {submitStatus === 'submitting' ? 'Claiming…' : 'Submit Answer'}
        </button>
      </div>
    </Overlay>
  );
}
