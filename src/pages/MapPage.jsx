import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import GameMap from '../components/Map/GameMap';

export default function MapPage() {
  const { gameCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamName = searchParams.get('name');
  const isAdmin = searchParams.get('admin') === 'true';

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onValue(ref(db, `games/${gameCode}`), (snap) => {
      setGame(snap.val());
      setLoading(false);
    });
    return () => unsub();
  }, [gameCode]);

  if (loading) return <div className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>Loading map...</div>;

  const teamData = teamName && game?.teams?.[teamName];
  const hintsUnlocked = teamData?.hintsUnlocked ?? [];
  const zoneHints = hintsUnlocked.filter((h) => h.type === 'zone');
  const fugitiveLocation = isAdmin ? game?.fugitive?.lastUpdate : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header bar */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <p style={{ fontWeight: 700 }}>{isAdmin ? 'Admin View' : teamName}</p>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Game: {gameCode}</p>
        </div>
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>

      {/* Map fills remaining height */}
      <div style={{ flex: 1 }}>
        <GameMap
          zoneHints={zoneHints}
          fugitiveLocation={fugitiveLocation}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
