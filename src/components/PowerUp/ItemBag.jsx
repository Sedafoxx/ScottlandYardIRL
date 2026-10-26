import { useState } from 'react';
import { POWER_UP_CONFIG } from '../../data/powerUps';
import { consumeItem, useItem } from '../../utils/items';

/**
 * The team's item bag. Landmarks and power-up challenges drop items in here
 * instead of firing them immediately — the team picks the moment (and, for
 * sabotage, the target) themselves.
 */
export default function ItemBag({ gameCode, bigTeam, teamName, items = {}, teams = {}, disabled = false }) {
  const [busy, setBusy] = useState(null);
  const [pickingTarget, setPickingTarget] = useState(null);
  const [error, setError] = useState('');

  const owned = Object.entries(items ?? {}).filter(([, count]) => (count ?? 0) > 0);
  if (owned.length === 0) return null;

  const sabotageTargets = Object.entries(teams ?? {})
    .filter(([name, data]) => (data?.bigTeam || name) !== bigTeam)
    .map(([name]) => name);

  const spend = async (itemKey, target = null) => {
    setBusy(itemKey);
    setError('');
    try {
      const { used } = await consumeItem({ gameCode, bigTeam, itemKey });
      if (!used) { setError('That item is already gone.'); return; }
      await useItem({ gameCode, bigTeam, teamName, itemKey, teams, sabotageTarget: target });
      setPickingTarget(null);
    } catch (err) {
      console.error(err);
      setError('Could not use that item — check your connection.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', borderLeft: '4px solid #f1c40f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1rem' }}>🎒 {bigTeam} item bag</h2>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>shared by your side</span>
      </div>
      <p className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.45, margin: 0 }}>
        Rewards you collected. Nothing fires on its own — use an item whenever it helps you most.
      </p>

      {owned.map(([itemKey, count]) => {
        const cfg = POWER_UP_CONFIG[itemKey] ?? { label: itemKey, emoji: '⚡', desc: '', color: 'var(--color-accent)' };
        const isSabotage = itemKey === 'sabotage';
        return (
          <div key={itemKey} style={{
            background: 'var(--color-bg)', borderRadius: 8, padding: '0.55rem 0.7rem',
            border: `1px solid ${cfg.color}55`, display: 'flex', flexDirection: 'column', gap: '0.45rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.85rem', color: cfg.color }}>
                  {cfg.emoji} {cfg.label}
                  {count > 1 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}> ×{count}</span>}
                </p>
                <p className="text-muted" style={{ fontSize: '0.72rem', lineHeight: 1.4, margin: 0 }}>{cfg.desc}</p>
              </div>
              {!isSabotage && (
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', flexShrink: 0, padding: '0.35rem 0.8rem', fontSize: '0.78rem', borderColor: cfg.color, color: cfg.color }}
                  onClick={() => spend(itemKey)}
                  disabled={disabled || busy === itemKey}
                >
                  {busy === itemKey ? 'Using…' : 'Use'}
                </button>
              )}
            </div>

            {isSabotage && (
              pickingTarget === itemKey ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {sabotageTargets.length === 0 && (
                    <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>No rival team on the map yet.</p>
                  )}
                  {sabotageTargets.map(target => (
                    <button
                      key={target}
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderColor: cfg.color, color: cfg.color }}
                      onClick={() => spend(itemKey, target)}
                      disabled={busy === itemKey}
                    >
                      {target}
                    </button>
                  ))}
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                    onClick={() => setPickingTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', alignSelf: 'flex-start', padding: '0.35rem 0.8rem', fontSize: '0.78rem', borderColor: cfg.color, color: cfg.color }}
                  onClick={() => setPickingTarget(itemKey)}
                  disabled={disabled || busy === itemKey}
                >
                  Pick target…
                </button>
              )
            )}
          </div>
        );
      })}

      {error && <p style={{ color: 'var(--color-primary)', fontSize: '0.78rem', margin: 0 }}>{error}</p>}
    </div>
  );
}
