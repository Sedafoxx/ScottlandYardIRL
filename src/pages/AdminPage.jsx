import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import heic2any from 'heic2any';
import { db } from '../firebase/config';
import { ref, onValue, set, update, get, remove, push } from 'firebase/database';
import { PUZZLES, WORDLE_WORDS, POWER_UP_RIDDLES } from '../data/puzzles';
import { generateHint, DIFFICULTY_CONFIG, STARTING_RADIUS, haversineDistance } from '../utils/hints';
import { POWER_UP_CONFIG, TRANSPORT_TYPES } from '../data/powerUps';
import { RIDDLE_COUNT } from '../utils/riddles';
import ChatPane from '../components/Chat/ChatPane';

const TRANSPORT_MAP = Object.fromEntries(TRANSPORT_TYPES.map(t => [t.key, t]));

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

  // Inline Mister X controls
  const [iAmFugitive, setIAmFugitive] = useState(false);
  const [fugAdminLastPos, setFugAdminLastPos] = useState(null);
  const [fugAdminGpsError, setFugAdminGpsError] = useState('');
  const [fugAdminTransportType, setFugAdminTransportType] = useState('ubahn');
  const [fugAdminTransportStops, setFugAdminTransportStops] = useState(1);
  const [fugAdminAnnouncing, setFugAdminAnnouncing] = useState(false);
  const fugAdminWatchRef = useRef(null);
  const activeGameRef = useRef(null);

  // Per-team chat unread tracking
  const [chatUnreadMap, setChatUnreadMap] = useState({});
  const chatTargetRef = useRef(chatTarget);

  // Keep chatTargetRef in sync for use inside Firebase listeners
  useEffect(() => { chatTargetRef.current = chatTarget; }, [chatTarget]);

  // Reset fugitive mode when game changes
  useEffect(() => {
    setIAmFugitive(false);
    setFugAdminLastPos(null);
    setFugAdminGpsError('');
  }, [activeGameCode]);

  // Admin GPS tracking when "I am Mister X" is active
  useEffect(() => {
    if (!iAmFugitive || !activeGameCode) {
      if (fugAdminWatchRef.current != null) {
        navigator.geolocation.clearWatch(fugAdminWatchRef.current);
        fugAdminWatchRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) {
      setFugAdminGpsError('Geolocation not supported on this device.');
      return;
    }
    fugAdminWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const timestamp = Date.now();
        setFugAdminLastPos({ lat, lng, timestamp });
        setFugAdminGpsError('');
        set(ref(db, `games/${activeGameCode}/fugitive/lastUpdate`), { lat, lng, timestamp });
        // Update hint circles if fugitive moved outside any team's zone
        const teamsSnap = activeGameRef.current?.teams;
        if (teamsSnap) {
          const updates = {};
          Object.entries(teamsSnap).forEach(([tName, tData]) => {
            const hint = tData.currentHint;
            if (!hint) return;
            if (haversineDistance(lat, lng, hint.lat, hint.lng) > hint.radius) {
              updates[`${tName}/currentHint`] = generateHint(lat, lng, hint.radius);
            }
          });
          if (Object.keys(updates).length > 0) {
            update(ref(db, `games/${activeGameCode}/teams`), updates);
          }
        }
      },
      (err) => setFugAdminGpsError(`GPS error: ${err.message}`),
      { enableHighAccuracy: true }
    );
    return () => {
      if (fugAdminWatchRef.current != null) {
        navigator.geolocation.clearWatch(fugAdminWatchRef.current);
        fugAdminWatchRef.current = null;
      }
    };
  }, [iAmFugitive, activeGameCode]);

  // Per-team unread message tracking (background listener)
  useEffect(() => {
    if (!activeGameCode) return;
    let initialized = false;
    const latestPerTeam = {};

    const unsub = onValue(ref(db, `games/${activeGameCode}/messages/teams`), (snap) => {
      const allTeamMsgs = snap.val() ?? {};
      const newLatest = {};
      Object.entries(allTeamMsgs).forEach(([teamName, msgs]) => {
        const timestamps = Object.values(msgs).map(m => m.timestamp ?? 0);
        newLatest[teamName] = Math.max(...timestamps, 0);
      });

      if (!initialized) {
        Object.assign(latestPerTeam, newLatest);
        initialized = true;
        return;
      }

      Object.entries(newLatest).forEach(([teamName, ts]) => {
        if (ts > (latestPerTeam[teamName] ?? 0) && chatTargetRef.current !== teamName) {
          setChatUnreadMap(m => ({ ...m, [teamName]: true }));
        }
        latestPerTeam[teamName] = ts;
      });
    });

    return () => unsub();
  }, [activeGameCode]);

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
    const unsub = onValue(ref(db, `games/${activeGameCode}`), (snap) => {
      const val = snap.val();
      setActiveGame(val);
      activeGameRef.current = val;
    });
    return () => unsub();
  }, [activeGameCode]);

  const createGame = async () => {
    const code = generateCode();
    const fugCode = generateCode();
    await Promise.all([
      set(ref(db, `games/${code}`), {
        status: 'waiting',
        createdAt: Date.now(),
        fugitiveCode: fugCode,
      }),
      set(ref(db, `fugitiveCodes/${fugCode}`), code),
    ]);
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
      const reduction = isPoem ? 0 : (DIFFICULTY_CONFIG[submission?.difficulty]?.reduction ?? DIFFICULTY_CONFIG.easy.reduction);
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

  const [exporting, setExporting] = useState(false);

  const downloadResults = async () => {
    setExporting(true);
    try {
      const zip = new JSZip();

      const sortedTeams = Object.entries(activeGame.teams ?? {})
        .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))
        .map(([name, data], i) => ({
          rank: i + 1,
          team: name,
          score: data.score ?? 0,
          riddlesCompleted: data.currentRiddle ?? 0,
          caughtFugitive: data.caughtFugitive ?? false,
        }));

      zip.file('results.json', JSON.stringify({
        gameCode: activeGameCode,
        status: activeGame.status,
        exportedAt: new Date().toISOString(),
        teams: sortedTeams,
      }, null, 2));

      // Add each submitted photo into a per-team folder
      const fetchJobs = [];
      Object.entries(activeGame.teams ?? {}).forEach(([teamName, teamData]) => {
        Object.entries(teamData.submissions ?? {}).forEach(([idx, sub]) => {
          if (!sub.photoUrl) return;
          const folder = zip.folder(teamName);
          const label = `challenge${String(parseInt(idx) + 1).padStart(2, '0')}_${sub.status}`;
          fetchJobs.push(
            fetch(sub.photoUrl)
              .then(r => r.blob())
              .then(blob => {
                const ext = blob.type.includes('png') ? 'png' : 'jpg';
                folder.file(`${label}.${ext}`, blob);
              })
              .catch(() => {
                folder.file(`${label}_failed.txt`, `Could not fetch: ${sub.photoUrl}`);
              })
          );
        });
      });

      await Promise.all(fetchJobs);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scotland-yard-${activeGameCode}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const refreshZoneHints = async () => {
    const fugSnap = await get(ref(db, `games/${activeGameCode}/fugitive/lastUpdate`));
    const fug = fugSnap.val();
    if (!fug?.lat) { alert('Mister X has no GPS signal yet. Make sure the Mister X page is open and tracking.'); return; }
    const teamsSnap = await get(ref(db, `games/${activeGameCode}/teams`));
    const allTeams = teamsSnap.val() ?? {};
    const updates = {};
    Object.entries(allTeams).forEach(([tName, tData]) => {
      const radius = tData.currentHint?.radius ?? STARTING_RADIUS;
      updates[`${tName}/currentHint`] = generateHint(fug.lat, fug.lng, radius);
    });
    await update(ref(db, `games/${activeGameCode}/teams`), updates);
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

  const announceAdminTransport = async () => {
    setFugAdminAnnouncing(true);
    const t = TRANSPORT_MAP[fugAdminTransportType];
    const announcedAt = Date.now();
    const stops = fugAdminTransportType === 'foot' ? null : fugAdminTransportStops;
    await set(ref(db, `games/${activeGameCode}/fugitive/lastTransport`), {
      type: fugAdminTransportType, stops, announcedAt,
    });
    const label = stops != null
      ? `${t.emoji} Mister X: ${t.label} — ${stops} stop${stops !== 1 ? 's' : ''}`
      : `${t.emoji} Mister X: ${t.label}`;
    await push(ref(db, `games/${activeGameCode}/messages/global`), {
      text: label, sender: 'Mister X', timestamp: announcedAt,
    });
    setFugAdminAnnouncing(false);
  };

  // Derived data
  const teams = activeGame?.teams ? Object.entries(activeGame.teams) : [];
  const riddles = []; // riddle sets are now per-subteam, stored in game.riddleSets
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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {activeGame.status === 'waiting' && (
                  <button className="btn btn-success" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={startGame}>Start</button>
                )}
                {activeGame.status === 'active' && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={endGame}>End Game</button>
                )}
                {activeGame.status === 'active' && (
                  <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }} onClick={refreshZoneHints}>
                    Refresh Zones
                  </button>
                )}
                {activeGame.status === 'ended' && (
                  <button className="btn btn-accent" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={downloadResults} disabled={exporting}>
                    {exporting ? 'Building ZIP…' : 'Download Results'}
                  </button>
                )}
                <button className="btn btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} onClick={deleteGame}>
                  Delete
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-hunter)' }}>
                Teams: <strong>{activeGameCode}</strong>
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-fugitive)' }}>
                Mister X: <strong>{activeGame.fugitiveCode ?? '…'}</strong>
              </p>
            </div>
            <button
              className="btn btn-outline"
              style={{
                borderColor: iAmFugitive ? 'var(--color-fugitive)' : undefined,
                color: iAmFugitive ? 'var(--color-fugitive)' : undefined,
              }}
              onClick={() => setIAmFugitive(v => !v)}
            >
              {iAmFugitive ? '🏃 Mister X Active — tap to stop' : 'I am Mister X'}
            </button>
          </div>

          {/* Inline Mister X panel */}
          {iAmFugitive && (() => {
            const nearbyTeams = fugAdminLastPos && activeGame?.teams
              ? Object.entries(activeGame.teams)
                  .filter(([, t]) => t.location)
                  .map(([name, t]) => ({
                    name,
                    distance: Math.round(haversineDistance(fugAdminLastPos.lat, fugAdminLastPos.lng, t.location.lat, t.location.lng)),
                  }))
                  .filter(t => t.distance <= 50)
                  .sort((a, b) => a.distance - b.distance)
              : [];
            return (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '4px solid var(--color-fugitive)' }}>
                <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>You are Mister X</h2>

                {nearbyTeams.length > 0 && (
                  <div style={{ background: '#e74c3c', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <p style={{ fontWeight: 800, color: '#fff' }}>🚨 DANGER — Team Close!</p>
                    {nearbyTeams.map(t => (
                      <p key={t.name} style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem' }}>
                        {t.name} is {t.distance}m away
                      </p>
                    ))}
                  </div>
                )}

                {fugAdminGpsError ? (
                  <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{fugAdminGpsError}</p>
                ) : fugAdminLastPos ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-success) 30%, transparent)' }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-success)' }}>
                      Tracking · {new Date(fugAdminLastPos.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ) : (
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>Acquiring GPS signal…</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Announce Movement</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {TRANSPORT_TYPES.map(t => (
                      <button
                        key={t.key}
                        className="btn btn-outline"
                        style={{
                          padding: '0.3rem 0.6rem', fontSize: '0.78rem',
                          borderColor: fugAdminTransportType === t.key ? 'var(--color-fugitive)' : undefined,
                          color: fugAdminTransportType === t.key ? 'var(--color-fugitive)' : undefined,
                        }}
                        onClick={() => setFugAdminTransportType(t.key)}
                      >
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                  {fugAdminTransportType !== 'foot' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Stops:</label>
                      <input
                        type="number"
                        min="1" max="20"
                        value={fugAdminTransportStops}
                        onChange={e => setFugAdminTransportStops(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{ width: '4rem' }}
                      />
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    style={{ background: 'var(--color-fugitive)', borderColor: 'var(--color-fugitive)' }}
                    onClick={announceAdminTransport}
                    disabled={fugAdminAnnouncing}
                  >
                    {fugAdminAnnouncing ? 'Announcing…' : 'Announce to Detectives'}
                  </button>
                </div>
              </div>
            );
          })()}

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
            {(() => {
              const groups = {};
              teams.forEach(([name, data]) => {
                const bg = data.bigTeam || name;
                if (!groups[bg]) groups[bg] = { combined: 0, members: [] };
                groups[bg].combined += data.score ?? 0;
                groups[bg].members.push([name, data]);
              });
              return Object.entries(groups)
                .sort((a, b) => b[1].combined - a[1].combined)
                .map(([bgName, group], gi) => {
                  const multi = group.members.length > 1;
                  const sortedMembers = [...group.members].sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0));
                  return (
                    <div key={bgName} style={{ borderRadius: '8px', overflow: 'hidden' }}>
                      {/* Group header */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
                        borderLeft: `3px solid ${gi === 0 ? 'var(--color-accent)' : 'transparent'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: '1rem' }}>#{gi + 1}</span>
                          <span style={{ fontWeight: 700 }}>{bgName}</span>
                          {multi && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{group.members.length} subteams</span>}
                          {group.members.some(([, d]) => d.caughtFugitive) && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700 }}>{group.combined} pts</span>
                      </div>
                      {/* Individual rows */}
                      {sortedMembers.map(([name, data]) => (
                        <div key={name} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: multi ? '0.4rem 0.75rem 0.4rem 2.5rem' : '0.5rem 0.75rem',
                          background: 'var(--color-bg)',
                          borderTop: multi ? '1px solid var(--color-border)' : undefined,
                          borderLeft: '3px solid transparent',
                        }}>
                          <div>
                            <span style={{ fontWeight: multi ? 400 : 600, fontSize: multi ? '0.85rem' : undefined }}>{name}</span>
                            {data.caughtFugitive && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 700 }}>CAUGHT!</span>
                            )}
                            <p className="text-muted" style={{ fontSize: '0.7rem' }}>
                              Challenge {(data.currentRiddle ?? 0) + 1} / {RIDDLE_COUNT}
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: multi ? 400 : 700, fontSize: multi ? '0.85rem' : undefined }}>{data.score ?? 0} pts</span>
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
                  );
                });
            })()}
          </div>

          {/* Fugitive location */}
          {fugitiveLocation && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Mister X Location</h2>
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
                onClick={() => { setChatTarget('global'); setChatUnreadMap(m => ({ ...m, global: false })); }}
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
                    position: 'relative',
                  }}
                  onClick={() => { setChatTarget(name); setChatUnreadMap(m => ({ ...m, [name]: false })); }}
                >
                  {name}
                  {chatUnreadMap[name] && (
                    <span style={{
                      position: 'absolute', top: '-4px', right: '-4px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--color-primary)',
                    }} />
                  )}
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

        </>
      )}
    </div>
  );
}
