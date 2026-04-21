import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import heic2any from 'heic2any';
import { db } from '../firebase/config';
import { ref, onValue, set, update, get } from 'firebase/database';
import { CHALLENGES } from '../data/challenges';
import { PUZZLES } from '../data/puzzles';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../utils/hints';
import ChatPane from '../components/Chat/ChatPane';

function HeicSafeImage({ src, alt, style }) {
  const [displaySrc, setDisplaySrc] = useState(src);

  const handleError = async () => {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      if (blob.type === 'image/heic' || blob.type === 'image/heif') {
        const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 });
        setDisplaySrc(URL.createObjectURL(converted instanceof Blob ? converted : converted[0]));
      }
    } catch {
      // leave broken image as-is
    }
  };

  return <img src={displaySrc} alt={alt} style={style} onError={handleError} />;
}

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function shuffleSlice(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function buildRiddles() {
  // 12 photo slots + 7 puzzle slots (3 easy, 3 medium, 1 hard) = 19
  const photoEasy   = shuffleSlice(CHALLENGES.easy,   12);
  const photoMedium = shuffleSlice(CHALLENGES.medium, 12);
  const photoHard   = shuffleSlice(CHALLENGES.hard,   12);

  const puzzleEasy   = shuffleSlice(PUZZLES.easy,   3);
  const puzzleMedium = shuffleSlice(PUZZLES.medium, 3);
  const puzzleHard   = shuffleSlice(PUZZLES.hard,   1);

  const photoSlots = Array.from({ length: 12 }, (_, i) => ({
    type: 'photo',
    options: [
      { difficulty: 'easy',   reduction: DIFFICULTY_CONFIG.easy.reduction,   ...photoEasy[i]   },
      { difficulty: 'medium', reduction: DIFFICULTY_CONFIG.medium.reduction,  ...photoMedium[i] },
      { difficulty: 'hard',   reduction: DIFFICULTY_CONFIG.hard.reduction,    ...photoHard[i]   },
    ],
  }));

  const mkPuzzle = (p, diff) => ({
    type: 'puzzle',
    difficulty: diff,
    question: p.question,
    answer: p.answer,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const puzzleSlots = [
    ...puzzleEasy.map(p => mkPuzzle(p, 'easy')),
    ...puzzleMedium.map(p => mkPuzzle(p, 'medium')),
    ...puzzleHard.map(p => mkPuzzle(p, 'hard')),
  ];

  const allSlots = [...photoSlots, ...puzzleSlots].sort(() => Math.random() - 0.5);

  const riddles = {
    0: { type: 'poem', question: 'Complete the poem: "Welcome to Scotland Yard, Vienna Edition…"' },
  };
  allSlots.forEach((slot, i) => { riddles[i + 1] = slot; });
  return riddles;
}

const ADMIN_PASSWORD = 'scottlandyardirl';

export default function AdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('adminAuthed') === '1');
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [games, setGames] = useState({});
  const [activeGameCode, setActiveGameCode] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [chatTarget, setChatTarget] = useState('global');
  const [approvingKey, setApprovingKey] = useState(null);

  const submitPassword = () => {
    if (pwInput === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuthed', '1');
      window.location.reload();
    } else {
      setPwError(true);
      setPwInput('');
      setTimeout(() => setPwError(false), 1500);
    }
  };

  if (!authed) {
    return (
      <div className="page" style={{ justifyContent: 'center', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: 'var(--color-admin)', fontWeight: 800 }}>Game Master</h1>
          <p className="text-muted" style={{ marginTop: '0.25rem' }}>Enter the admin password to continue</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="password"
            placeholder="Password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
            style={{ borderColor: pwError ? 'var(--color-primary)' : undefined }}
            autoFocus
          />
          {pwError && <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>Wrong password.</p>}
          <button className="btn btn-accent" onClick={submitPassword}>Enter</button>
          <button className="btn btn-outline" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    );
  } // tracks in-flight approval

  useEffect(() => {
    const unsub = onValue(ref(db, 'games'), (snap) => setGames(snap.val() ?? {}));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeGameCode) return;
    const unsub = onValue(ref(db, `games/${activeGameCode}`), (snap) => setActiveGame(snap.val()));
    return () => unsub();
  }, [activeGameCode]);

  const createGame = async () => {
    const code = generateCode();
    await set(ref(db, `games/${code}`), {
      status: 'waiting',
      createdAt: Date.now(),
      riddles: buildRiddles(),
    });
    setActiveGameCode(code);
  };

  const startGame = () => update(ref(db, `games/${activeGameCode}`), { status: 'active' });
  const endGame = () => update(ref(db, `games/${activeGameCode}`), { status: 'ended' });

  const approveSubmission = async (teamName, riddleIndex) => {
    const key = `${teamName}-${riddleIndex}`;
    setApprovingKey(key);
    try {
      const [teamSnap, fugitiveSnap] = await Promise.all([
        get(ref(db, `games/${activeGameCode}/teams/${teamName}`)),
        get(ref(db, `games/${activeGameCode}/fugitive/lastUpdate`)),
      ]);
      const teamData = teamSnap.val();
      const fugitive = fugitiveSnap.val();

      const submission = teamData?.submissions?.[riddleIndex];
      const isPoem = submission?.type === 'poem';
      const points = isPoem ? 10 : (DIFFICULTY_CONFIG[submission?.difficulty]?.points ?? 10);
      const reduction = isPoem ? 0 : (submission?.reduction ?? DIFFICULTY_CONFIG.easy.reduction);
      const currentRadius = isPoem ? STARTING_RADIUS : (teamData?.currentHint?.radius ?? STARTING_RADIUS);
      const newRadius = isPoem ? STARTING_RADIUS : Math.max(Math.round(currentRadius * (1 - reduction)), 30);

      const updates = {
        currentRiddle: riddleIndex + 1,
        score: (teamData?.score ?? 0) + points,
      };

      if (fugitive?.lat != null) {
        updates.currentHint = generateHint(fugitive.lat, fugitive.lng, newRadius);
      }

      await update(ref(db, `games/${activeGameCode}/teams/${teamName}`), updates);
      await update(ref(db, `games/${activeGameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        status: 'approved',
      });
    } finally {
      setApprovingKey(null);
    }
  };

  const rejectSubmission = async (teamName, riddleIndex, reason = '') => {
    await update(ref(db, `games/${activeGameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
      status: 'rejected',
      rejectReason: reason || 'Please make sure you are clearly visible in the photo and try again.',
    });
  };

  const downloadResults = () => {
    const sortedTeams = Object.entries(activeGame.teams ?? {})
      .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))
      .map(([name, data], i) => ({
        rank: i + 1,
        team: name,
        score: data.score ?? 0,
        riddlesCompleted: data.currentRiddle ?? 0,
        caughtFugitive: data.caughtFugitive ?? false,
      }));

    const result = {
      gameCode: activeGameCode,
      status: activeGame.status,
      exportedAt: new Date().toISOString(),
      teams: sortedTeams,
    };

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scotland-yard-${activeGameCode}-results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const awardCatch = async (teamName) => {
    const snap = await get(ref(db, `games/${activeGameCode}/teams/${teamName}`));
    const current = snap.val()?.score ?? 0;
    await update(ref(db, `games/${activeGameCode}/teams/${teamName}`), {
      score: current + 100,
      caughtFugitive: true,
    });
  };

  // Derived data
  const teams = activeGame?.teams ? Object.entries(activeGame.teams) : [];
  const riddles = activeGame?.riddles ? Object.values(activeGame.riddles) : [];
  const fugitiveLocation = activeGame?.fugitive?.lastUpdate;

  // Collect all pending submissions across teams
  const pendingSubmissions = [];
  teams.forEach(([teamName, teamData]) => {
    if (!teamData.submissions) return;
    Object.entries(teamData.submissions).forEach(([riddleIdx, sub]) => {
      if (sub.status === 'pending') {
        pendingSubmissions.push({ teamName, riddleIndex: parseInt(riddleIdx, 10), ...sub });
      }
    });
  });
  pendingSubmissions.sort((a, b) => a.submittedAt - b.submittedAt);

  return (
    <div className="page" style={{ gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: 'var(--color-admin)', fontWeight: 800 }}>Game Master</h1>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => navigate('/')}>
          Home
        </button>
      </div>

      {/* Create or select game */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Games</h2>
        <button className="btn btn-accent" onClick={createGame}>+ New Game</button>
        {Object.entries(games).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(games).map(([code, g]) => (
              <button
                key={code}
                className="btn btn-outline"
                style={{ borderColor: activeGameCode === code ? 'var(--color-admin)' : undefined }}
                onClick={() => setActiveGameCode(code)}
              >
                {code} — {g.status}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeGame && (
        <>
          {/* Game controls */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{activeGameCode}</h2>
                <p className="text-muted" style={{ textTransform: 'capitalize' }}>Status: {activeGame.status}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {activeGame.status === 'waiting' && (
                  <button className="btn btn-success" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={startGame}>Start</button>
                )}
                {activeGame.status === 'active' && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={endGame}>End Game</button>
                )}
                {activeGame.status === 'ended' && (
                  <button className="btn btn-accent" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={downloadResults}>
                    Download Results
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>
              Share code <strong>{activeGameCode}</strong> with players
            </p>
          </div>

          {/* Pending photo submissions */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem' }}>Photo Submissions</h2>
              {pendingSubmissions.length > 0 && (
                <span style={{
                  background: 'var(--color-primary)', color: 'white',
                  fontSize: '0.75rem', fontWeight: 700,
                  padding: '0.2rem 0.5rem', borderRadius: '999px',
                }}>
                  {pendingSubmissions.length} pending
                </span>
              )}
            </div>

            {pendingSubmissions.length === 0 ? (
              <p className="text-muted">No pending submissions.</p>
            ) : (
              pendingSubmissions.map((sub) => {
                const key = `${sub.teamName}-${sub.riddleIndex}`;
                const isApproving = approvingKey === key;
                return (
                  <div key={key} style={{
                    background: 'var(--color-bg)', borderRadius: '8px',
                    overflow: 'hidden', border: '1px solid var(--color-border)',
                  }}>
                    {sub.type === 'poem' ? (
                      <div style={{ padding: '0.75rem 0.75rem 0', borderLeft: '4px solid var(--color-accent)' }}>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Poem submission</p>
                        <p style={{ fontSize: '0.9rem', fontStyle: 'italic', lineHeight: 1.5 }}>"{sub.text}"</p>
                      </div>
                    ) : (
                      <HeicSafeImage
                        src={sub.photoUrl}
                        alt={`${sub.teamName} submission`}
                        style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontWeight: 700 }}>{sub.teamName}</p>
                          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                            Challenge #{sub.riddleIndex + 1} · {new Date(sub.submittedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      {sub.challenge && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          "{sub.challenge}"
                        </p>
                      )}
                      {sub.submittedText && (
                        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--color-surface)', borderRadius: '6px', borderLeft: '3px solid var(--color-accent)' }}>
                          <p style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Their answer</p>
                          <p style={{ fontSize: '0.875rem' }}>"{sub.submittedText}"</p>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-success"
                          style={{ flex: 1, padding: '0.5rem' }}
                          onClick={() => approveSubmission(sub.teamName, sub.riddleIndex)}
                          disabled={isApproving}
                        >
                          {isApproving ? 'Approving…' : 'Approve'}
                        </button>
                        {sub.type !== 'poem' && (
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '0.5rem' }}
                            onClick={() => rejectSubmission(sub.teamName, sub.riddleIndex)}
                            disabled={isApproving}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Teams / Leaderboard */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Teams ({teams.length})</h2>
            {teams.length === 0 && <p className="text-muted">No teams yet.</p>}
            {[...teams].sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0)).map(([name, data], i) => (
              <div key={name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: '8px',
                borderLeft: `3px solid ${i === 0 ? 'var(--color-accent)' : 'transparent'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: '1rem' }}>#{i + 1}</span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    {data.caughtFugitive && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>}
                    <p className="text-muted" style={{ fontSize: '0.7rem' }}>Challenge {(data.currentRiddle ?? 0) + 1} / {riddles.length}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700 }}>{data.score ?? 0} pts</span>
                  {!data.caughtFugitive && (
                    <button
                      className="btn btn-success"
                      style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => awardCatch(name)}
                    >
                      +100 Caught!
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Fugitive location */}
          {fugitiveLocation && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Fugitive Location</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: 'var(--color-success)',
                  boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-success) 30%, transparent)',
                }} />
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                  {fugitiveLocation.lat.toFixed(5)}, {fugitiveLocation.lng.toFixed(5)} · updated {new Date(fugitiveLocation.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button className="btn btn-outline" onClick={() => navigate(`/map/${activeGameCode}?admin=true`)}>
                View on Map
              </button>
            </div>
          )}

          {/* Chat */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Chat</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                style={{
                  width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                  borderColor: chatTarget === 'global' ? 'var(--color-admin)' : undefined,
                  color: chatTarget === 'global' ? 'var(--color-admin)' : undefined,
                }}
                onClick={() => setChatTarget('global')}
              >
                📢 All Teams
              </button>
              {teams.map(([name]) => (
                <button
                  key={name}
                  className="btn btn-outline"
                  style={{
                    width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem',
                    borderColor: chatTarget === name ? 'var(--color-hunter)' : undefined,
                    color: chatTarget === name ? 'var(--color-hunter)' : undefined,
                  }}
                  onClick={() => setChatTarget(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <ChatPane
              key={chatTarget}
              gameCode={activeGameCode}
              senderName="Admin"
              globalPath={chatTarget === 'global' ? 'messages/global' : null}
              privatePath={chatTarget !== 'global' ? `messages/teams/${chatTarget}` : null}
              sendPath={chatTarget === 'global' ? 'messages/global' : `messages/teams/${chatTarget}`}
            />
          </div>

          {/* Challenge list (read-only) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Challenges ({riddles.length})</h2>
            {riddles.map((r, i) => {
              const borderColor = r.type === 'poem'
                ? 'var(--color-accent)'
                : r.type === 'puzzle'
                  ? DIFFICULTY_CONFIG[r.difficulty]?.color
                  : 'var(--color-hunter)';
              return (
                <div key={i} style={{
                  padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
                  borderRadius: '8px', fontSize: '0.8rem',
                  borderLeft: `3px solid ${borderColor}`,
                }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    #{i + 1} ·{' '}
                    {r.type === 'poem' && 'Poem (admin review, +10 pts, 2000m)'}
                    {r.type === 'photo' && 'Photo challenge'}
                    {r.type === 'puzzle' && `Puzzle — ${r.difficulty} (auto-checked, +${r.points} pts)`}
                  </p>
                  {r.type === 'photo' && r.options?.map((opt) => (
                    <p key={opt.difficulty} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[opt.difficulty]?.color }}>{opt.difficulty}</strong>: {opt.challenge}
                    </p>
                  ))}
                  {r.type === 'poem' && <p className="text-muted">{r.question}</p>}
                  {r.type === 'puzzle' && <p className="text-muted">{r.question}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
