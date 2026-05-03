import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import GameMap from '../components/Map/GameMap';

export default function MapPage() {
  const { gameCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamName = searchParams.get('name');
  const bigTeam = searchParams.get('bigTeam') || teamName;
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
  const currentHint = teamData?.currentHint ?? null;
  const liveFeedUntil = parseInt(searchParams.get('livefeed') || '0', 10);
  const liveFeedActive = !isAdmin && liveFeedUntil > Date.now();
  const fugitiveLocation = (isAdmin || liveFeedActive) ? game?.fugitive?.lastUpdate : null;
  const teamLocation = !isAdmin && teamData?.location ? teamData.location : null;

  // Other subteams of same big team that have GPS enabled
  const teammateLocations = !isAdmin && bigTeam && game?.teams
    ? Object.entries(game.teams)
        .filter(([n, d]) => n !== teamName && (d.bigTeam || n) === bigTeam && d.location)
        .map(([n, d]) => ({ name: n, lat: d.location.lat, lng: d.location.lng, timestamp: d.location.timestamp }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
            {isAdmin
              ? 'Showing Mister X real-time position'
              : liveFeedActive
                ? '📡 Live Feed — Mister X location visible!'
                : currentHint
                  ? `Zone hint active — ${currentHint.radius}m radius`
                  : 'No hint yet — complete a challenge'}
          </p>
          {!isAdmin && teammateLocations.length > 0 && (
            <p style={{ fontSize: '0.7rem', color: '#2ecc71', marginTop: '0.1rem' }}>
              ● {teammateLocations.length} teammate{teammateLocations.length !== 1 ? 's' : ''} on map
            </p>
          )}
        </div>
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>

      <div style={{ flex: 1 }}>
        <GameMap
          currentHint={currentHint}
          fugitiveLocation={fugitiveLocation}
          teamLocation={teamLocation}
          visitedLandmarks={teamData?.visitedLandmarks ?? {}}
          isAdmin={isAdmin}
          teammateLocations={teammateLocations}
        />
      </div>
    </div>
  );
}
