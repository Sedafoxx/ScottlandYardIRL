import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import heic2any from 'heic2any';
import { db, storage } from '../firebase/config';
import { ref, onValue, set, get, update, remove } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import RiddleCard from '../components/Riddle/RiddleCard';
import ChatPane from '../components/Chat/ChatPane';
import Leaderboard from '../components/Leaderboard';
import { DIFFICULTY_CONFIG, haversineDistance } from '../utils/hints';
import PowerUpOverlay from '../components/PowerUp/PowerUpOverlay';
import LiveFeedCard from '../components/PowerUp/LiveFeedCard';
import DirectionBeacon from '../components/PowerUp/DirectionBeacon';
import { TRANSPORT_TYPES, POWER_UP_CONFIG } from '../data/powerUps';
import { LANDMARKS, LANDMARK_TRIGGER_RADIUS } from '../data/landmarks';

const TRANSPORT_MAP = Object.fromEntries(TRANSPORT_TYPES.map(t => [t.key, t]));

function RejectedPhotoCard({ submission, riddleIndex, gameCode, teamName }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef();

  const skip = () =>
    update(ref(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`), { status: 'skipped' });

  const handleFile = async (e) => {
    let file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      if (
        file.type === 'image/heic' || file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
      ) {
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        file = new File([blob instanceof Blob ? blob : blob[0]], 'photo.jpg', { type: 'image/jpeg' });
      }
      const path = `photos/${gameCode}/${teamName}/${riddleIndex}_retake_${Date.now()}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await update(ref(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        photoUrl: url,
        status: 'pending',
        submittedAt: Date.now(),
        rejectReason: null,
      });
    } catch {
      setUploadError('Upload failed. Check your connection and try again.');
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '4px solid var(--color-primary)' }}>
      <div>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
          Photo Rejected — Challenge #{riddleIndex + 1}
        </p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', lineHeight: 1.5 }}>{submission.rejectReason}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>−10 points deducted</p>
      </div>
      <img
        src={submission.photoUrl}
        alt="Rejected"
        style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '180px', opacity: 0.45 }}
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Do you want to retake this photo?</p>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {uploadError && <p style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>{uploadError}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn btn-accent"
          style={{ flex: 1 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Retake Photo'}
        </button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={skip} disabled={uploading}>
          Move On
        </button>
      </div>
    </div>
  );
}

function LandmarkChallenge({ landmark, gameCode, teamName, teamScore, onClose }) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('idle');
  const rewardCfg = POWER_UP_CONFIG[landmark.powerUpReward];

  const submit = async () => {
    const norm = answer.trim().toUpperCase();
    const correct = [landmark.answer, ...(landmark.altAnswers ?? [])];
    if (!correct.includes(norm)) { setStatus('wrong'); return; }
    setStatus('submitting');
    const now = Date.now();
    const updates = {
      score: (teamScore ?? 0) + 30,
      [`visitedLandmarks/${landmark.id}`]: true,
    };
    switch (landmark.powerUpReward) {
      case 'live_feed':        updates.liveFeedUntil = now + 2 * 60 * 1000; break;
      case 'direction_beacon': updates.directionBeaconUntil = now + 2 * 60 * 1000; break;
      case 'zone_freeze':
        await update(ref(db, `games/${gameCode}`), { zoneFreezeUntil: now + 3 * 60 * 1000 });
        break;
      case 'selfie_demand':
        await update(ref(db, `games/${gameCode}`), {
          selfieRequest: { requestedBy: teamName, requestedAt: now, status: 'pending' },
        });
        break;
      default: updates.doubleZone = true;
    }
    await update(ref(db, `games/${gameCode}/teams/${teamName}`), updates);
    setStatus('solved');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(8, 8, 18, 0.97)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', gap: '0.75rem',
      borderTop: '4px solid var(--color-accent)',
    }}>
      {status === 'solved' ? (
        <>
          <p style={{ fontSize: '3rem' }}>🏆</p>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-accent)', textAlign: 'center' }}>
            Landmark unlocked!
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
            +30 pts · Reward: {rewardCfg?.emoji} {rewardCfg?.label}
          </p>
          <button className="btn btn-accent" style={{ marginTop: '0.5rem' }} onClick={onClose}>Continue</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '2.5rem', textAlign: 'center' }}>{landmark.emoji}</p>
          <p style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.15em', color: 'var(--color-accent)', textTransform: 'uppercase' }}>
            Landmark Bonus
          </p>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, textAlign: 'center' }}>{landmark.name}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>{landmark.description}</p>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 10, padding: '1rem',
            border: '1px solid var(--color-accent)44', width: '100%', maxWidth: 360,
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
          }}>
            <p style={{ fontWeight: 600, lineHeight: 1.6 }}>{landmark.question}</p>
            <input
              type="text"
              placeholder="Your answer…"
              value={answer}
              autoFocus
              onChange={e => { setAnswer(e.target.value); if (status === 'wrong') setStatus('idle'); }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ borderColor: status === 'wrong' ? 'var(--color-primary)' : 'var(--color-accent)' }}
              autoCapitalize="characters"
            />
            {status === 'wrong' && <p style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>Not quite — try again!</p>}
            <button
              className="btn btn-accent"
              onClick={submit}
              disabled={!answer.trim() || status === 'submitting'}
            >
              Submit
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Reward: {rewardCfg?.emoji} {rewardCfg?.label} · +30 pts
          </p>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={onClose}>Skip</button>
        </>
      )}
    </div>
  );
}

function PastChallengeCard({ riddle, submission }) {
  const diffCfg = DIFFICULTY_CONFIG[riddle.difficulty] ?? DIFFICULTY_CONFIG.easy;
  const typeLabel = { photo: 'Photo', poem: 'Poem', puzzle: 'Puzzle', wordle: 'Wordle', mastermind: 'Code Cracker', equation: 'Equation' }[riddle.type] ?? riddle.type;

  if (riddle.type === 'photo' && submission) {
    const c = DIFFICULTY_CONFIG[submission.difficulty] ?? DIFFICULTY_CONFIG.easy;
    const approved = submission.status === 'approved';
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 8, borderLeft: `3px solid ${c.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>{c.label} Photo</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: approved ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {approved ? `+${c.points} pts approved` : 'Pending review'}
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{submission.challenge}</p>
        <img src={submission.photoUrl} alt="Submitted" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 220, opacity: approved ? 1 : 0.65 }} />
      </div>
    );
  }

  if (riddle.type === 'poem' && submission) {
    const approved = submission.status === 'approved';
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 8, borderLeft: '3px solid var(--color-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>Poem</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: approved ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {approved ? '+10 pts approved' : 'Pending review'}
          </span>
        </div>
        <p style={{ fontStyle: 'italic', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-accent)' }}>"{submission.text}"</p>
      </div>
    );
  }

  // Auto-solved challenge (puzzle / wordle / mastermind / equation)
  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: riddle.difficulty ? diffCfg.color : 'var(--color-accent)' }}>
          {riddle.difficulty ? `${diffCfg.label} ` : ''}{typeLabel}
        </p>
        {riddle.points != null && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>+{riddle.points} pts</p>
        )}
      </div>
      <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>Solved</span>
    </div>
  );
}

function ZoneFreezeBar({ until }) {
  const [remaining, setRemaining] = useState(Math.max(0, until - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, until - Date.now())), 500);
    return () => clearInterval(t);
  }, [until]);
  if (remaining <= 0) return null;
  const secs = Math.ceil(remaining / 1000);
  const secStr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="card" style={{ borderLeft: '4px solid #3498db' }}>
      <p style={{ fontWeight: 700, color: '#3498db' }}>❄️ Zone Freeze Active — {secStr}</p>
      <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
        Zone hints are paused for all teams.
      </p>
    </div>
  );
}

function SabotageOverlay({ until }) {
  const [remaining, setRemaining] = useState(Math.max(0, until - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, until - Date.now())), 500);
    return () => clearInterval(t);
  }, [until]);
  if (remaining <= 0) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(155, 29, 29, 0.96)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1rem',
    }}>
      <p style={{ fontSize: '3rem' }}>💣</p>
      <p style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff' }}>SABOTAGED!</p>
      <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.75)' }}>
        Back in {Math.ceil(remaining / 1000)}s
      </p>
    </div>
  );
}

export default function TeamPage() {
  const { gameCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamName = searchParams.get('name') || 'Unknown Team';
  const bigTeam = searchParams.get('bigTeam') || teamName;

  const [game, setGame] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [teamLocation, setTeamLocation] = useState(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [teamChatUnread, setTeamChatUnread] = useState(0);
  const [activeLandmark, setActiveLandmark] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const gpsWatchRef = useRef(null);
  const teamDataRef = useRef(null);

  useEffect(() => {
    const gameRef = ref(db, `games/${gameCode}`);
    const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);

    // Only register the team if the game actually exists
    get(gameRef).then((snap) => {
      if (!snap.exists()) return;
      get(teamRef).then((teamSnap) => {
        if (!teamSnap.exists()) {
          set(teamRef, { score: 0, currentRiddle: 0, bigTeam });
        }
      });
    });

    const unsub = onValue(gameRef, (snapshot) => {
      if (!snapshot.exists()) {
        setError('Game not found. Check your code.');
        setLoading(false);
        return;
      }
      setGame(snapshot.val());
      setLoading(false);
    });

    const teamUnsub = onValue(teamRef, (snap) => {
      if (snap.exists()) { setTeamData(snap.val()); teamDataRef.current = snap.val(); }
    });

    return () => { unsub(); teamUnsub(); };
  }, [gameCode, teamName]);

  const toggleGPS = () => {
    if (gpsEnabled) {
      if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
      setGpsEnabled(false);
      setTeamLocation(null);
      remove(ref(db, `games/${gameCode}/teams/${teamName}/location`));
    } else {
      if (!navigator.geolocation) return;
      setGpsEnabled(true);
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const loc = { lat, lng, timestamp: Date.now() };
          setTeamLocation(loc);
          update(ref(db, `games/${gameCode}/teams/${teamName}`), { location: loc });
          const visited = teamDataRef.current?.visitedLandmarks ?? {};
          LANDMARKS.forEach(lm => {
            if (visited[lm.id]) return;
            if (haversineDistance(lat, lng, lm.lat, lm.lng) <= LANDMARK_TRIGGER_RADIUS) {
              setActiveLandmark(prev => prev ?? lm);
            }
          });
        },
        err => console.error('Team GPS:', err),
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    return () => { if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current); };
  }, []);

  if (loading) return <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>Loading...</div>;
  if (error) return (
    <div className="page" style={{ justifyContent: 'center', textAlign: 'center', gap: '1rem' }}>
      <p style={{ color: 'var(--color-primary)' }}>{error}</p>
      <button className="btn btn-outline" onClick={() => navigate('/')}>Back</button>
    </div>
  );

  const riddles = game?.riddles ? Object.values(game.riddles) : [];
  const currentRiddleIndex = teamData?.currentRiddle ?? 0;
  const currentRiddle = riddles[currentRiddleIndex];
  const currentHint = teamData?.currentHint ?? null;
  const leaderboardTeams = game?.teams ? Object.entries(game.teams) : [];

  return (
    <div className="page" style={{ gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--color-hunter)' }}>{teamName}</h2>
          <p className="text-muted">Game: {gameCode}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 700, fontSize: '1.25rem' }}>{teamData?.score ?? 0} pts</p>
          <p className="text-muted">
            Riddle {currentRiddleIndex + 1} / {riddles.length || '?'}
          </p>
        </div>
      </div>

      {/* Rules info section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text)', width: '100%' }}
          onClick={() => setRulesOpen(o => !o)}
        >
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>ℹ️ How to Play</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{rulesOpen ? '▲' : '▼'}</span>
        </button>
        {rulesOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            <p><strong style={{ color: 'var(--color-hunter)' }}>Goal:</strong> Find and catch Mister X.</p>
            <p><strong style={{ color: 'var(--color-accent)' }}>Catch Mister X:</strong> +100 pts — tell the Game Master when you have them.</p>
            <p><strong style={{ color: 'var(--color-success)' }}>Easy challenge:</strong> −5% zone radius · +10 pts</p>
            <p><strong style={{ color: 'var(--color-accent)' }}>Medium challenge:</strong> −10% zone radius · +20 pts</p>
            <p><strong style={{ color: 'var(--color-primary)' }}>Hard challenge:</strong> −15% zone radius · +30 pts</p>
            <p><strong>Photo rejection:</strong> −10 pts — retake or skip.</p>
            <p><strong style={{ color: 'var(--color-accent)' }}>Zone starts</strong> at 2000m radius after your first challenge.</p>
            <p><strong>Power-ups:</strong> solve competitive mini-challenges for special abilities.</p>
            <p><strong>Landmarks:</strong> stand within 15m of a Vienna landmark · answer the riddle · +30 pts + power-up reward.</p>
            <p><strong>Enable GPS</strong> to see yourself on the map and unlock landmark bonuses.</p>
          </div>
        )}
      </div>

      {game?.status === 'waiting' && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Waiting for the Game Master to start...
        </div>
      )}

      {game?.status === 'active' && currentRiddle && (
        <RiddleCard
          key={currentRiddleIndex}
          riddle={currentRiddle}
          gameCode={gameCode}
          teamName={teamName}
          riddleIndex={currentRiddleIndex}
          totalRiddles={riddles.length}
          doubleZone={teamData?.doubleZone === true}
          zoneFreezeUntil={game?.zoneFreezeUntil ?? null}
        />
      )}

      {game?.status === 'active' && !currentRiddle && currentRiddleIndex >= riddles.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem' }}>All riddles solved!</p>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>Now find Mister X!</p>
        </div>
      )}

      {/* Rejected photo retakes */}
      {Object.entries(teamData?.submissions ?? {})
        .filter(([, sub]) => sub.status === 'rejected')
        .map(([idx, sub]) => (
          <RejectedPhotoCard
            key={idx}
            submission={sub}
            riddleIndex={parseInt(idx, 10)}
            gameCode={gameCode}
            teamName={teamName}
          />
        ))
      }

      {/* Fugitive transport announcement */}
      {game?.fugitive?.lastTransport && (() => {
        const t = game.fugitive.lastTransport;
        const cfg = TRANSPORT_MAP[t.type];
        const stopsText = t.stops != null ? ` — ${t.stops} stop${t.stops !== 1 ? 's' : ''}` : '';
        return (
          <div className="card" style={{ borderLeft: '4px solid var(--color-fugitive)' }}>
            <p style={{ fontWeight: 700, color: 'var(--color-fugitive)', fontSize: '0.875rem' }}>
              Mister X Movement Reported
            </p>
            <p style={{ marginTop: '0.25rem', fontSize: '1rem' }}>
              {cfg?.emoji ?? ''} {cfg?.label ?? t.type}{stopsText}
            </p>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
              Announced at {new Date(t.announcedAt).toLocaleTimeString()}
            </p>
          </div>
        );
      })()}

      {/* Hint status */}
      {currentHint && (
        <div className="card" style={{
          borderColor: 'var(--color-accent)',
          borderLeftWidth: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-accent)' }}>
              Zone hint active
            </p>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>
              {currentHint.radius}m radius — open map to see
            </p>
          </div>
          <button
            className="btn btn-accent"
            style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem', flexShrink: 0 }}
            onClick={() => {
            const livefeed = teamData?.liveFeedUntil > Date.now() ? `&livefeed=${teamData.liveFeedUntil}` : '';
            navigate(`/map/${gameCode}?name=${encodeURIComponent(teamName)}&bigTeam=${encodeURIComponent(bigTeam)}${livefeed}`);
          }}
          >
            Map
          </button>
        </div>
      )}

      <Leaderboard teams={leaderboardTeams} currentTeam={teamName} />

      <ChatPane
        gameCode={gameCode}
        senderName={teamName}
        globalPath="messages/global"
        privatePath={`messages/teams/${teamName}`}
        sendPath={`messages/teams/${teamName}`}
        title="Chat with Admin"
        unreadCount={chatUnread}
        onNewMessage={() => setChatUnread(n => n + 1)}
        onMarkRead={() => setChatUnread(0)}
      />

      <ChatPane
        gameCode={gameCode}
        senderName={teamName}
        globalPath={null}
        privatePath={`messages/bigteam/${bigTeam}`}
        sendPath={`messages/bigteam/${bigTeam}`}
        title={`${bigTeam} — Team Chat`}
        unreadCount={teamChatUnread}
        onNewMessage={() => setTeamChatUnread(n => n + 1)}
        onMarkRead={() => setTeamChatUnread(0)}
      />

      {/* Active power up effects */}
      {teamData?.liveFeedUntil > Date.now() && (
        <LiveFeedCard until={teamData.liveFeedUntil} gameCode={gameCode} teamName={teamName} />
      )}
      {teamData?.directionBeaconUntil > Date.now() && (
        <DirectionBeacon gameCode={gameCode} until={teamData.directionBeaconUntil} />
      )}
      {teamData?.doubleZone && (
        <div className="card" style={{ borderLeft: '4px solid #f39c12' }}>
          <p style={{ fontWeight: 700, color: '#f39c12' }}>⚡ Double Zone Active</p>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
            Your next completed challenge shrinks the zone twice as much.
          </p>
        </div>
      )}
      {game?.zoneFreezeUntil > Date.now() && (
        <ZoneFreezeBar until={game.zoneFreezeUntil} />
      )}

      {/* Received selfie */}
      {game?.selfieRequest?.requestedBy === teamName && game.selfieRequest.status === 'fulfilled' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '4px solid #1abc9c' }}>
          <p style={{ fontWeight: 700, color: '#1abc9c' }}>📸 Mister X Selfie Received!</p>
          <img
            src={game.selfieRequest.photoUrl}
            alt="Mister X selfie"
            style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 280 }}
          />
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
            Sent at {new Date(game.selfieRequest.fulfilledAt).toLocaleTimeString()}
          </p>
        </div>
      )}
      {game?.selfieRequest?.requestedBy === teamName && game.selfieRequest.status === 'pending' && (
        <div className="card" style={{ borderLeft: '4px solid #1abc9c' }}>
          <p style={{ fontWeight: 700, color: '#1abc9c' }}>📸 Selfie requested — waiting for Mister X…</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn btn-outline"
          style={{ flex: 1 }}
          onClick={() => {
            const livefeed = teamData?.liveFeedUntil > Date.now() ? `&livefeed=${teamData.liveFeedUntil}` : '';
            navigate(`/map/${gameCode}?name=${encodeURIComponent(teamName)}&bigTeam=${encodeURIComponent(bigTeam)}${livefeed}`);
          }}
        >
          Open Map
        </button>
        <button
          className="btn btn-outline"
          style={{
            flex: 1,
            borderColor: gpsEnabled ? 'var(--color-success)' : undefined,
            color: gpsEnabled ? 'var(--color-success)' : undefined,
          }}
          onClick={toggleGPS}
        >
          {gpsEnabled ? '📍 GPS On' : '📍 Enable GPS'}
        </button>
      </div>

      {/* Full-screen overlays */}
      {activeLandmark && (
        <LandmarkChallenge
          landmark={activeLandmark}
          gameCode={gameCode}
          teamName={teamName}
          teamScore={teamData?.score}
          onClose={() => setActiveLandmark(null)}
        />
      )}
      {teamData?.sabotagedUntil > Date.now() && (
        <SabotageOverlay until={teamData.sabotagedUntil} />
      )}
      <PowerUpOverlay
        powerUp={game?.powerUp}
        gameCode={gameCode}
        teamName={teamName}
        teams={Object.keys(game?.teams ?? {})}
      />
    </div>
  );
}
