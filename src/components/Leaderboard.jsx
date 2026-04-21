export default function Leaderboard({ teams, currentTeam }) {
  if (!teams || teams.length === 0) return null;

  const sorted = [...teams].sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0));

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h2 style={{ fontSize: '1rem' }}>Leaderboard</h2>
      {sorted.map(([name, data], i) => {
        const isMe = name === currentTeam;
        return (
          <div
            key={name}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.4rem 0.75rem',
              background: isMe ? 'color-mix(in srgb, var(--color-hunter) 12%, transparent)' : 'var(--color-bg)',
              borderRadius: '8px',
              borderLeft: `3px solid ${i === 0 ? 'var(--color-accent)' : isMe ? 'var(--color-hunter)' : 'transparent'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: '1.2rem' }}>#{i + 1}</span>
              <span style={{ fontWeight: isMe ? 700 : 400 }}>{name}{isMe ? ' (you)' : ''}</span>
              {data.caughtFugitive && (
                <span style={{ fontSize: '0.65rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>
              )}
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{data.score ?? 0} pts</span>
          </div>
        );
      })}
    </div>
  );
}
