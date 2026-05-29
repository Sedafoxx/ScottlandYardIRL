import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, storage } from '../firebase/config';
import { ref, onValue, set, update, push } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Leaderboard from '../components/Leaderboard';
import GameMap from '../components/Map/GameMap';
import WrappedScreen from '../components/WrappedScreen';
import { generateHint, haversineDistance } from '../utils/hints';
import { TRANSPORT_TYPES } from '../data/powerUps';

const TRANSPORT_MAP = Object.fromEntries(TRANSPORT_TYPES.map(t => [t.key, t]));

export default function FugitivePage() {
  const { gameCode } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsError, setGpsError] = useState('');
  const [lastPos, setLastPos] = useState(null);
  const [transportType, setTransportType] = useState('ubahn');
  const [transportStops, setTransportStops] = useState(1);
  const [announcing, setAnnouncing] = useState(false);
  const [selfieUploading, setSelfieUploading] = useState(false);
  const [selfieError, setSelfieError] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [now, setNow] = useState(Date.now());
  const gameDataRef = useRef(null);
  const selfieInputRef = useRef();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, `games/${gameCode}`), (snap) => {
      const val = snap.val();
      setGame(val);
      gameDataRef.current = val;
      setLoading(false);
    });
    return () => unsub();
  }, [gameCode]);

  // Continuous GPS tracking — writes to Firebase whenever position changes
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported on this device.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const timestamp = Date.now();
        setLastPos({ lat, lng, timestamp });
        setGpsError('');
        if ((gameDataRef.current?.fugitive?.undercover?.until ?? 0) > Date.now()) return;
        set(ref(db, `games/${gameCode}/fugitive/lastUpdate`), { lat, lng, timestamp });

        // Recalculate any team's hint circle the fugitive has moved outside of
        const teams = gameDataRef.current?.teams;
        if (teams) {
          const updates = {};
          Object.entries(teams).forEach(([tName, tData]) => {
            const hint = tData.currentHint;
            if (!hint) return;
            if (haversineDistance(lat, lng, hint.lat, hint.lng) > hint.radius) {
              updates[`${tName}/currentHint`] = generateHint(lat, lng, hint.radius);
            }
          });
          if (Object.keys(updates).length > 0) {
            update(ref(db, `games/${gameCode}/teams`), updates);
          }
        }
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gameCode]);

  const goUndercover = async () => {
    const t = Date.now();
    await set(ref(db, `games/${gameCode}/fugitive/undercover`), { usedAt: t, until: t + 60_000 });
    await push(ref(db, `games/${gameCode}/messages/global`), {
      text: '🕶️ Mister X went undercover! Location hidden for 1 minute.',
      sender: 'System',
      timestamp: t,
    });
  };

  const announceTransport = async () => {
    setAnnouncing(true);
    const t = TRANSPORT_MAP[transportType];
    const announcedAt = Date.now();
    const stops = transportType === 'foot' ? null : transportStops;
    await set(ref(db, `games/${gameCode}/fugitive/lastTransport`), {
      type: transportType,
      stops,
      announcedAt,
    });
    const label = stops != null
      ? `${t.emoji} Mister X: ${t.label} — ${stops} stop${stops !== 1 ? 's' : ''}`
      : `${t.emoji} Mister X: ${t.label}`;
    await push(ref(db, `games/${gameCode}/messages/global`), {
      text: label,
      sender: 'Mister X',
      timestamp: announcedAt,
    });
    setAnnouncing(false);
  };

  const handleSelfieFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelfieUploading(true);
    setSelfieError('');
    try {
      const path = `selfies/${gameCode}/fugitive_${Date.now()}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await update(ref(db, `games/${gameCode}`), {
        selfieRequest: { ...gameDataRef.current?.selfieRequest, photoUrl: url, status: 'fulfilled', fulfilledAt: Date.now() },
      });
    } catch {
      setSelfieError('Upload failed. Try again.');
    }
    setSelfieUploading(false);
    e.target.value = '';
  };

  const undercoverData = game?.fugitive?.undercover ?? null;
  const isUndercover = (undercoverData?.until ?? 0) > now;
  const onCooldown = !isUndercover && (undercoverData?.usedAt ?? 0) + 600_000 > now;
  const undercoverRemaining = Math.ceil(((undercoverData?.until ?? 0) - now) / 1000);
  const cooldownRemaining = Math.ceil(((undercoverData?.usedAt ?? 0) + 600_000 - now) / 1000);

  // Teams within 50 metres (derived from current GPS + team locations)
  const nearbyTeams = lastPos && game?.teams
    ? Object.entries(game.teams)
        .filter(([, t]) => t.location)
        .map(([name, t]) => ({ name, distance: Math.round(haversineDistance(lastPos.lat, lastPos.lng, t.location.lat, t.location.lng)) }))
        .filter(t => t.distance <= 50)
        .sort((a, b) => a.distance - b.distance)
    : [];

  const selfieRequest = game?.selfieRequest;
  const selfieNeeded = selfieRequest?.status === 'pending';

  const allTeamLocations = game?.teams
    ? Object.entries(game.teams)
        .filter(([, d]) => d.location)
        .map(([name, d]) => ({ name, bigTeam: d.bigTeam || name, lat: d.location.lat, lng: d.location.lng, timestamp: d.location.timestamp }))
    : [];

  if (loading) return <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>Loading...</div>;

  if (game?.status === 'ended') {
    return (
      <WrappedScreen
        game={game}
        teamName=""
        bigTeam=""
        nickname="Mister X"
        gameCode={gameCode}
      />
    );
  }

  return (
    <div className="page" style={{ gap: '1.5rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--color-fugitive)', fontSize: '1.75rem', fontWeight: 800 }}>
          You are Mister X
        </h1>
        <p className="text-muted">Game: {gameCode}</p>
      </div>

      {/* Proximity alarm */}
      {nearbyTeams.length > 0 && (
        <div style={{
          background: '#e74c3c', borderRadius: '10px', padding: '1rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
          animation: 'pulse 1s infinite',
        }}>
          <p style={{ fontSize: '1.5rem' }}>🚨</p>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>DANGER — Team Close!</p>
          {nearbyTeams.map(t => (
            <p key={t.name} style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem' }}>
              {t.name} is only {t.distance}m away
            </p>
          ))}
        </div>
      )}

      {/* Selfie demand */}
      {selfieNeeded && (
        <div className="card" style={{ borderLeft: '4px solid #1abc9c', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontWeight: 800, color: '#1abc9c', fontSize: '1rem' }}>
            📸 {selfieRequest.requestedBy} demands a selfie!
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Show your current surroundings. They can see the photo but not your exact location.
          </p>
          <input ref={selfieInputRef} type="file" accept="image/*" capture="environment" onChange={handleSelfieFile} style={{ display: 'none' }} />
          {selfieError && <p style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>{selfieError}</p>}
          <button
            className="btn"
            style={{ background: '#1abc9c', color: '#fff', border: 'none' }}
            onClick={() => selfieInputRef.current?.click()}
            disabled={selfieUploading}
          >
            {selfieUploading ? 'Uploading…' : 'Take & Send Selfie'}
          </button>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Status</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-muted">Game status</span>
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{game?.status ?? 'Unknown'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="text-muted">Teams hunting you</span>
          <span style={{ fontWeight: 600 }}>
            {game?.teams ? Object.keys(game.teams).length : 0}
          </span>
        </div>
      </div>

      {/* GPS status */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Location Tracking</h2>
        {gpsError ? (
          <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{gpsError}</p>
        ) : lastPos ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--color-success)', display: 'inline-block',
                boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-success) 30%, transparent)',
              }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--color-success)' }}>Tracking active</span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>
              Last update: {new Date(lastPos.timestamp).toLocaleTimeString()}
            </p>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>
              {lastPos.lat.toFixed(5)}, {lastPos.lng.toFixed(5)}
            </p>
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>Acquiring GPS signal...</p>
        )}
      </div>

      <div className="card">
        <p className="text-muted" style={{ lineHeight: 1.6, fontSize: '0.875rem' }}>
          Your location is shared continuously with the Game Master only.
          Teams get approximate zone hints when they solve riddles — not your exact position.
          Keep this page open to stay tracked.
        </p>
      </div>

      {/* Undercover mode */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: isUndercover ? '4px solid #888' : undefined }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Undercover Mode</h2>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          Hide your location for 1 minute — your GPS stops updating for all teams. Usable once every 10 minutes.
        </p>
        {isUndercover && (
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#aaa' }}>
            🕶️ Hidden — reveals in {undercoverRemaining}s
          </p>
        )}
        <button
          className="btn"
          style={{
            background: isUndercover || onCooldown ? 'var(--color-surface)' : 'var(--color-fugitive)',
            color: isUndercover || onCooldown ? 'var(--color-text-muted)' : '#fff',
            borderColor: isUndercover || onCooldown ? 'var(--color-border)' : 'var(--color-fugitive)',
          }}
          onClick={goUndercover}
          disabled={isUndercover || onCooldown}
        >
          {isUndercover
            ? `🕶️ Undercover (${undercoverRemaining}s)`
            : onCooldown
              ? `⏳ Cooldown — ${Math.floor(cooldownRemaining / 60)}:${String(cooldownRemaining % 60).padStart(2, '0')}`
              : '🕶️ Go Undercover'}
        </button>
      </div>

      {/* Transport announcement */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Announce Movement</h2>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          Tell detective teams how you're moving — they'll see the transport type but not your location.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {TRANSPORT_TYPES.map(t => (
            <button
              key={t.key}
              className="btn btn-outline"
              style={{
                padding: '0.4rem 0.65rem', fontSize: '0.8rem',
                borderColor: transportType === t.key ? 'var(--color-fugitive)' : undefined,
                color: transportType === t.key ? 'var(--color-fugitive)' : undefined,
              }}
              onClick={() => setTransportType(t.key)}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        {transportType !== 'foot' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>Stops:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn btn-outline"
                style={{ width: '2.25rem', height: '2.25rem', padding: 0, fontSize: '1.1rem', lineHeight: 1 }}
                onClick={() => setTransportStops(s => Math.max(1, s - 1))}
              >−</button>
              <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}>{transportStops}</span>
              <button
                className="btn btn-outline"
                style={{ width: '2.25rem', height: '2.25rem', padding: 0, fontSize: '1.1rem', lineHeight: 1 }}
                onClick={() => setTransportStops(s => Math.min(20, s + 1))}
              >+</button>
            </div>
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ background: 'var(--color-fugitive)', borderColor: 'var(--color-fugitive)' }}
          onClick={announceTransport}
          disabled={announcing}
        >
          {announcing ? 'Announcing…' : 'Announce to Detectives'}
        </button>
      </div>

      {game?.teams && (
        <Leaderboard teams={Object.entries(game.teams)} />
      )}

      <button className="btn btn-outline" onClick={() => setShowMap(true)}>
        🗺️ Open Map — See Teams
      </button>

      <button className="btn btn-outline" onClick={() => navigate('/')}>
        Leave Game
      </button>

      {showMap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', flexDirection: 'column', background: '#000' }}>
          <div style={{
            padding: '0.75rem 1rem',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--color-fugitive)' }}>Mister X — Team Overview</p>
              <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                {isUndercover ? '🕶️ You are undercover — teams cannot see you' : 'Your location is visible to teams with zone hints'}
              </p>
              {allTeamLocations.length > 0 && (
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                  ● {allTeamLocations.length} team member{allTeamLocations.length !== 1 ? 's' : ''} visible
                </p>
              )}
            </div>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
              onClick={() => setShowMap(false)}
            >
              Back
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <GameMap
              teamLocation={lastPos}
              allTeamLocations={isUndercover ? allTeamLocations : []}
            />
          </div>
        </div>
      )}
    </div>
  );
}
