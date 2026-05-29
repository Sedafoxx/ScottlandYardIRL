export default function Leaderboard({ teams, currentTeam, stars, starTrades }) {
  if (!teams || teams.length === 0) return null;

  // Group by bigTeam; fall back to team name for ungrouped entries
  const groups = {};
  teams.forEach(([name, data]) => {
    const bg = data.bigTeam || name;
    if (!groups[bg]) groups[bg] = { combined: 0, members: [], caughtFugitive: false };
    groups[bg].combined += data.score ?? 0;
    groups[bg].members.push([name, data]);
    if (data.caughtFugitive) groups[bg].caughtFugitive = true;
  });

  const sortedGroups = Object.entries(groups).sort((a, b) => b[1].combined - a[1].combined);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h2 style={{ fontSize: '1rem' }}>Leaderboard</h2>
      {sortedGroups.map(([bigTeamName, group], gi) => {
        const isMyGroup = group.members.some(([n]) => n === currentTeam);
        const multiMember = group.members.length > 1;
        const sortedMembers = [...group.members].sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0));

        const bigTeamStarCount = stars
          ? Object.values(stars).filter(s => s.claimedBy === bigTeamName).length
          : 0;
        const tradesUsed = starTrades?.[bigTeamName] ?? 0;
        const starsAvailable = bigTeamStarCount - tradesUsed * 3;

        return (
          <div key={bigTeamName} style={{ borderRadius: '8px', overflow: 'hidden' }}>
            {/* Group header row */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.4rem 0.75rem',
              background: isMyGroup
                ? 'color-mix(in srgb, var(--color-hunter) 12%, transparent)'
                : 'var(--color-bg)',
              borderLeft: `3px solid ${gi === 0 ? 'var(--color-accent)' : isMyGroup ? 'var(--color-hunter)' : 'transparent'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: '1.2rem' }}>#{gi + 1}</span>
                <span style={{ fontWeight: 700 }}>{bigTeamName}</span>
                {multiMember && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                    {group.members.length} subteams
                  </span>
                )}
                {group.caughtFugitive && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {bigTeamStarCount > 0 && (
                  <span style={{ fontSize: '0.8rem', color: '#f1c40f', fontWeight: 700 }}>
                    {'⭐'.repeat(Math.min(starsAvailable, 7))}
                    {tradesUsed > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: '0.2rem' }}>({tradesUsed}× traded)</span>}
                  </span>
                )}
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{group.combined} pts</span>
              </div>
            </div>

            {/* Individual subteam rows */}
            {multiMember && sortedMembers.map(([name, data]) => {
              const isMe = name === currentTeam;
              return (
                <div key={name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.2rem 0.75rem 0.2rem 2.75rem',
                  borderTop: '1px solid var(--color-border)',
                  background: isMe
                    ? 'color-mix(in srgb, var(--color-hunter) 7%, transparent)'
                    : 'color-mix(in srgb, var(--color-bg) 60%, transparent)',
                  borderLeft: `3px solid ${isMe ? 'var(--color-hunter)' : 'transparent'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', color: isMe ? 'var(--color-hunter)' : 'var(--color-text-muted)' }}>
                      {name}{isMe ? ' (you)' : ''}
                    </span>
                    {data.caughtFugitive && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{data.score ?? 0} pts</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
