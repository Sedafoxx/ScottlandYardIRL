import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue, set } from 'firebase/database';

export default function FugitivePage() {
  const { gameCode } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gameRef = ref(db, `games/${gameCode}`);
    const unsub = onValue(gameRef, (snap) => {
      setGame(snap.val());
      setLoading(false);
    });
    return () => unsub();
  }, [gameCode]);

  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        set(ref(db, `games/${gameCode}/fugitive/lastUpdate`), {
          lat: latitude,
          lng: longitude,
          timestamp: Date.now(),
        });
        alert('Location updated!');
      },
      () => alert('Could not get location. Make sure location access is allowed.')
    );
  };

  if (loading) return <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>Loading...</div>;

  const updates = game?.fugitive?.lastUpdate;

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
        {updates && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Last location shared</span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {new Date(updates.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Rules</h2>
        <p className="text-muted" style={{ lineHeight: 1.6 }}>
          The admin controls when teams get hints about your location. You don't have to share
          your exact position — the admin decides what clues the hunters get.
        </p>
        <p className="text-muted" style={{ lineHeight: 1.6, marginTop: '0.25rem' }}>
          If the admin asks you to share your location for a hint, use the button below.
          Your exact coordinates are only visible to the Game Master.
        </p>
      </div>

      <button className="btn btn-primary" onClick={shareLocation}>
        Share My Location (Admin Only)
      </button>

      <button className="btn btn-outline" onClick={() => navigate('/')}>
        Leave Game
      </button>
    </div>
  );
}
