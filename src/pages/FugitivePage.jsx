import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue, set } from 'firebase/database';
import Leaderboard from '../components/Leaderboard';

export default function FugitivePage() {
  const { gameCode } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsError, setGpsError] = useState('');
  const [lastPos, setLastPos] = useState(null);

  useEffect(() => {
    const unsub = onValue(ref(db, `games/${gameCode}`), (snap) => {
      setGame(snap.val());
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
        const { latitude, longitude } = pos.coords;
        setLastPos({ lat: latitude, lng: longitude, timestamp: Date.now() });
        setGpsError('');
        set(ref(db, `games/${gameCode}/fugitive/lastUpdate`), {
          lat: latitude,
          lng: longitude,
          timestamp: Date.now(),
        });
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gameCode]);

  if (loading) return <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="page" style={{ gap: '1.5rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--color-fugitive)', fontSize: '1.75rem', fontWeight: 800 }}>
          You are the Fugitive
        </h1>
        <p className="text-muted">Game: {gameCode}</p>
      </div>

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

      {game?.teams && (
        <Leaderboard teams={Object.entries(game.teams)} />
      )}

      <button className="btn btn-outline" onClick={() => navigate('/')}>
        Leave Game
      </button>
    </div>
  );
}
