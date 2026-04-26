import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import heic2any from 'heic2any';
import { db } from '../firebase/config';
import { ref, onValue, set, update, get, remove } from 'firebase/database';
import { CHALLENGES } from '../data/challenges';
import { PUZZLES, WORDLE_WORDS, EQUATION_PUZZLES, POWER_UP_RIDDLES } from '../data/puzzles';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS } from '../utils/hints';
import { POWER_UP_CONFIG } from '../data/powerUps';
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

function randomCode(length, range) {
  return Array.from({ length }, () => Math.floor(Math.random() * range) + 1).join('');
}

function buildRiddles() {
  // 12 photo + 3 puzzle + 3 wordle + 3 mastermind + 3 equation + 1 poem = 25 riddles total
  // Each non-photo slot has easy/medium/hard options — players choose at play time.
  const photoEasy   = shuffleSlice(CHALLENGES.easy,   12);
  const photoMedium = shuffleSlice(CHALLENGES.medium, 12);
  const photoHard   = shuffleSlice(CHALLENGES.hard,   12);

  const photoSlots = Array.from({ length: 12 }, (_, i) => ({
    type: 'photo',
    options: [
      { difficulty: 'easy',   reduction: DIFFICULTY_CONFIG.easy.reduction,   ...photoEasy[i]   },
      { difficulty: 'medium', reduction: DIFFICULTY_CONFIG.medium.reduction,  ...photoMedium[i] },
      { difficulty: 'hard',   reduction: DIFFICULTY_CONFIG.hard.reduction,    ...photoHard[i]   },
    ],
  }));

  const puzzleEasy   = shuffleSlice(PUZZLES.easy,   3);
  const puzzleMedium = shuffleSlice(PUZZLES.medium, 3);
  const puzzleHard   = shuffleSlice(PUZZLES.hard,   3);

  const mkPuzzleOpt = (p, diff) => ({
    difficulty: diff,
    question: p.question,
    answer: p.answer,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const puzzleSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'puzzle',
    options: {
      easy:   mkPuzzleOpt(puzzleEasy[i],   'easy'),
      medium: mkPuzzleOpt(puzzleMedium[i], 'medium'),
      hard:   mkPuzzleOpt(puzzleHard[i],   'hard'),
    },
  }));

  const wordleEasy   = shuffleSlice(WORDLE_WORDS.easy,   3);
  const wordleMedium = shuffleSlice(WORDLE_WORDS.medium, 3);
  const wordleHard   = shuffleSlice(WORDLE_WORDS.hard,   3);

  const mkWordleOpt = (w, diff) => ({
    difficulty: diff,
    answer: w.answer,
    hint: w.hint,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const wordleSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'wordle',
    options: {
      easy:   mkWordleOpt(wordleEasy[i],   'easy'),
      medium: mkWordleOpt(wordleMedium[i], 'medium'),
      hard:   mkWordleOpt(wordleHard[i],   'hard'),
    },
  }));

  const MASTERMIND_SETTINGS = {
    easy:   { codeLength: 3, digitRange: 4, maxAttempts: 10 },
    medium: { codeLength: 4, digitRange: 6, maxAttempts: 8 },
    hard:   { codeLength: 4, digitRange: 6, maxAttempts: 6 },
  };

  const mkMastermindOpt = (diff) => {
    const s = MASTERMIND_SETTINGS[diff];
    return {
      difficulty: diff,
      answer: randomCode(s.codeLength, s.digitRange),
      codeLength: s.codeLength,
      digitRange: s.digitRange,
      maxAttempts: s.maxAttempts,
      points: DIFFICULTY_CONFIG[diff].points,
      reduction: DIFFICULTY_CONFIG[diff].reduction,
    };
  };

  const mastermindSlots = Array.from({ length: 3 }, () => ({
    type: 'mastermind',
    options: {
      easy:   mkMastermindOpt('easy'),
      medium: mkMastermindOpt('medium'),
      hard:   mkMastermindOpt('hard'),
    },
  }));

  const equationEasy   = shuffleSlice(EQUATION_PUZZLES.easy,   3);
  const equationMedium = shuffleSlice(EQUATION_PUZZLES.medium, 3);
  const equationHard   = shuffleSlice(EQUATION_PUZZLES.hard,   3);

  const mkEquationOpt = (p, diff) => ({
    difficulty: diff,
    tiles: p.tiles,
    points: DIFFICULTY_CONFIG[diff].points,
    reduction: DIFFICULTY_CONFIG[diff].reduction,
  });

  const equationSlots = Array.from({ length: 3 }, (_, i) => ({
    type: 'equation',
    options: {
      easy:   mkEquationOpt(equationEasy[i],   'easy'),
      medium: mkEquationOpt(equationMedium[i], 'medium'),
      hard:   mkEquationOpt(equationHard[i],   'hard'),
    },
  }));

  const shuffledRiddles = [...puzzleSlots, ...wordleSlots, ...mastermindSlots, ...equationSlots].sort(() => Math.random() - 0.5);
  const shuffledPhotos = [...photoSlots].sort(() => Math.random() - 0.5);

  // Alternate: riddle, photo, riddle, photo, …
  const allSlots = [];
  for (let i = 0; i < 12; i++) {
    allSlots.push(shuffledRiddles[i]);
    allSlots.push(shuffledPhotos[i]);
  }

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
  const [rejectingKey, setRejectingKey] = useState(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [powerUpType, setPowerUpType] = useState('live_feed');
  const [powerUpChallengeType, setPowerUpChallengeType] = useState('riddle');
  const [powerUpChallengeDiff, setPowerUpChallengeDiff] = useState('medium');
  const [launchingPowerUp, setLaunchingPowerUp] = useState(false);

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
  const deleteGame = async () => {
    if (!window.confirm(`Delete game ${activeGameCode}? This cannot be undone.`)) return;
    await remove(ref(db, `games/${activeGameCode}`));
    setActiveGameCode(null);
    setActiveGame(null);
  };

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

      // Photo teams already advanced currentRiddle at submission time; only poems wait for approval.
      const updates = { score: (teamData?.score ?? 0) + points };
      if (isPoem) updates.currentRiddle = riddleIndex + 1;
      if (fugitive?.lat != null) updates.currentHint = generateHint(fugitive.lat, fugitive.lng, newRadius);

      await update(ref(db, `games/${activeGameCode}/teams/${teamName}`), updates);
      await update(ref(db, `games/${activeGameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        status: 'approved',
      });
    } finally {
      setApprovingKey(null);
    }
  };

  const rejectSubmission = async (teamName, riddleIndex, reason) => {
    const key = `${teamName}-${riddleIndex}`;
    setApprovingKey(key);
    try {
      const snap = await get(ref(db, `games/${activeGameCode}/teams/${teamName}`));
      const currentScore = snap.val()?.score ?? 0;
      await update(ref(db, `games/${activeGameCode}/teams/${teamName}`), {
        score: Math.max(0, currentScore - 10),
      });
      await update(ref(db, `games/${activeGameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        status: 'rejected',
        rejectReason: reason?.trim() || 'Please make sure you are clearly visible in the photo and try again.',
      });
    } finally {
      setApprovingKey(null);
      setRejectingKey(null);
      setRejectReasonDraft('');
    }
  };

  const downloadResults = async () => {
    const sortedTeams = Object.entries(activeGame.teams ?? {})
      .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))
      .map(([name, data], i) => ({
        rank: i + 1,
        team: name,
        score: data.score ?? 0,
        riddlesCompleted: data.currentRiddle ?? 0,
        caughtFugitive: data.caughtFugitive ?? false,
        photos: Object.entries(data.submissions ?? {})
          .filter(([, s]) => s.photoUrl)
          .map(([idx, s]) => ({ challenge: idx, status: s.status, url: s.photoUrl })),
      }));

    const result = {
      gameCode: activeGameCode,
      status: activeGame.status,
      exportedAt: new Date().toISOString(),
      teams: sortedTeams,
    };

    const jsonBlob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonA = document.createElement('a');
    jsonA.href = jsonUrl;
    jsonA.download = `scotland-yard-${activeGameCode}-results.json`;
    jsonA.click();
    URL.revokeObjectURL(jsonUrl);

    // Download all submitted photos
    const allPhotos = [];
    Object.entries(activeGame.teams ?? {}).forEach(([teamName, teamData]) => {
      Object.entries(teamData.submissions ?? {}).forEach(([idx, sub]) => {
        if (sub.photoUrl) allPhotos.push({ teamName, idx, url: sub.photoUrl, status: sub.status });
      });
    });

    for (const { teamName, idx, url, status } of allPhotos) {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${teamName}_challenge${parseInt(idx) + 1}_${status}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error('Photo download failed:', teamName, idx, e);
      }
    }
  };

  const launchPowerUp = async () => {
    setLaunchingPowerUp(true);
    let challenge;
    if (powerUpChallengeType === 'riddle') {
      challenge = POWER_UP_RIDDLES[Math.floor(Math.random() * POWER_UP_RIDDLES.length)];
    } else if (powerUpChallengeType === 'puzzle') {
      const pool = PUZZLES[powerUpChallengeDiff];
      const p = pool[Math.floor(Math.random() * pool.length)];
      challenge = { question: p.question, answer: p.answer };
    } else if (powerUpChallengeType === 'wordle') {
      const pool = WORDLE_WORDS[powerUpChallengeDiff];
      const w = pool[Math.floor(Math.random() * pool.length)];
      challenge = { question: `Hint: "${w.hint}" — what is the 5-letter word?`, answer: w.answer };
    }
    await set(ref(db, `games/${activeGameCode}/powerUp`), {
      status: 'active',
      type: powerUpType,
      challenge,
      launchedAt: Date.now(),
    });
    setLaunchingPowerUp(false);
  };

  const cancelPowerUp = async () => {
    await set(ref(db, `games/${activeGameCode}/powerUp`), { status: 'idle' });
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
                <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} onClick={deleteGame}>
                  Delete
                </button>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>
              Share code <strong>{activeGameCode}</strong> with players
            </p>
          </div>

          {/* Power Ups */}
          {activeGame.status === 'active' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '1rem', color: 'var(--color-accent)' }}>⚡ Power Ups</h2>

              {activeGame.powerUp?.status === 'active' ? (
                <>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: 8, borderLeft: `4px solid ${POWER_UP_CONFIG[activeGame.powerUp.type]?.color ?? 'var(--color-accent)'}` }}>
                    <p style={{ fontWeight: 700, color: POWER_UP_CONFIG[activeGame.powerUp.type]?.color }}>
                      {POWER_UP_CONFIG[activeGame.powerUp.type]?.emoji} {POWER_UP_CONFIG[activeGame.powerUp.type]?.label} — Active
                    </p>
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                      {activeGame.powerUp.winner
                        ? `Winner: ${activeGame.powerUp.winner}`
                        : 'Alarm live — waiting for first answer…'}
                    </p>
                  </div>
                  <button className="btn btn-primary" onClick={cancelPowerUp}>
                    Cancel Power Up
                  </button>
                </>
              ) : (
                <>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                    Select a type then launch — a full-screen alarm fires on all team screens.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Object.entries(POWER_UP_CONFIG).map(([type, cfg]) => (
                      <button
                        key={type}
                        className="btn btn-outline"
                        style={{
                          textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.85rem',
                          borderColor: powerUpType === type ? cfg.color : undefined,
                          color: powerUpType === type ? cfg.color : undefined,
                        }}
                        onClick={() => setPowerUpType(type)}
                      >
                        {cfg.emoji} <strong>{cfg.label}</strong> — {cfg.desc}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Challenge type
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {[
                        { key: 'riddle', label: 'Riddle' },
                        { key: 'puzzle', label: 'Puzzle' },
                        { key: 'wordle', label: 'Wordle' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          className="btn btn-outline"
                          style={{
                            flex: 1, padding: '0.4rem', fontSize: '0.8rem',
                            borderColor: powerUpChallengeType === key ? 'var(--color-accent)' : undefined,
                            color: powerUpChallengeType === key ? 'var(--color-accent)' : undefined,
                          }}
                          onClick={() => setPowerUpChallengeType(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {powerUpChallengeType !== 'riddle' && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {['easy', 'medium', 'hard'].map(d => (
                          <button
                            key={d}
                            className="btn btn-outline"
                            style={{
                              flex: 1, padding: '0.4rem', fontSize: '0.75rem', textTransform: 'capitalize',
                              borderColor: powerUpChallengeDiff === d ? DIFFICULTY_CONFIG[d]?.color : undefined,
                              color: powerUpChallengeDiff === d ? DIFFICULTY_CONFIG[d]?.color : undefined,
                            }}
                            onClick={() => setPowerUpChallengeDiff(d)}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-accent"
                    onClick={launchPowerUp}
                    disabled={launchingPowerUp}
                  >
                    {launchingPowerUp ? 'Launching…' : '⚡ Launch Power Up'}
                  </button>
                </>
              )}
            </div>
          )}

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
                      {rejectingKey === key ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <textarea
                            placeholder="Reason for rejection (shown to team)…"
                            value={rejectReasonDraft}
                            onChange={e => setRejectReasonDraft(e.target.value)}
                            rows={2}
                            style={{
                              width: '100%', resize: 'vertical', padding: '0.5rem 0.6rem',
                              background: 'var(--color-surface)', border: '1px solid var(--color-primary)',
                              borderRadius: '6px', color: 'var(--color-text)', fontSize: '0.85rem',
                              fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-primary"
                              style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                              onClick={() => rejectSubmission(sub.teamName, sub.riddleIndex, rejectReasonDraft)}
                              disabled={isApproving}
                            >
                              {isApproving ? 'Rejecting…' : 'Confirm Reject (−10 pts)'}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                              onClick={() => { setRejectingKey(null); setRejectReasonDraft(''); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
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
                              onClick={() => setRejectingKey(key)}
                              disabled={isApproving}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}
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
                : r.type === 'photo'
                  ? 'var(--color-hunter)'
                  : 'var(--color-border)';
              return (
                <div key={i} style={{
                  padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
                  borderRadius: '8px', fontSize: '0.8rem',
                  borderLeft: `3px solid ${borderColor}`,
                }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    #{i + 1} ·{' '}
                    {r.type === 'poem' && 'Poem (admin review, +10 pts)'}
                    {r.type === 'photo' && 'Photo challenge (player choice)'}
                    {r.type === 'puzzle' && 'Puzzle (player choice, auto-checked)'}
                    {r.type === 'wordle' && 'Wordle (player choice, auto-checked)'}
                    {r.type === 'mastermind' && 'Code Cracker (player choice, auto-checked)'}
                    {r.type === 'equation' && 'Equation (player choice, auto-checked)'}
                  </p>
                  {r.type === 'photo' && r.options?.map((opt) => (
                    <p key={opt.difficulty} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[opt.difficulty]?.color }}>{opt.difficulty}</strong>: {opt.challenge}
                    </p>
                  ))}
                  {r.type === 'poem' && <p className="text-muted">{r.question}</p>}
                  {r.type === 'puzzle' && r.options && Object.entries(r.options).map(([diff, opt]) => (
                    <p key={diff} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[diff]?.color }}>{diff}</strong>: {opt.question}
                    </p>
                  ))}
                  {r.type === 'wordle' && r.options && Object.entries(r.options).map(([diff, opt]) => (
                    <p key={diff} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[diff]?.color }}>{diff}</strong>: {opt.answer} · {opt.hint}
                    </p>
                  ))}
                  {r.type === 'mastermind' && r.options && Object.entries(r.options).map(([diff, opt]) => (
                    <p key={diff} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[diff]?.color }}>{diff}</strong>: {opt.codeLength} digits (1–{opt.digitRange}) · {opt.maxAttempts} attempts
                    </p>
                  ))}
                  {r.type === 'equation' && r.options && Object.entries(r.options).map(([diff, opt]) => (
                    <p key={diff} className="text-muted" style={{ marginBottom: '0.1rem' }}>
                      <strong style={{ color: DIFFICULTY_CONFIG[diff]?.color }}>{diff}</strong>: {opt.tiles.join(' ')}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
