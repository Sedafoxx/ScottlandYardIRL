import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue, set, get } from 'firebase/database';
import RiddleCard from '../components/Riddle/RiddleCard';
import HintDisplay from '../components/Hint/HintDisplay';

export default function TeamPage() {
  const { gameCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const teamName = searchParams.get('name') || 'Unknown Team';

  const [game, setGame] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const gameRef = ref(db, `games/${gameCode}`);
    const unsub = onValue(gameRef, (snapshot) => {
      if (!snapshot.exists()) {
        setError('Game not found. Check your code.');
        setLoading(false);
        return;
      }
      setGame(snapshot.val());
      setLoading(false);
    });

    // Register team if not already registered
    const teamRef = ref(db, `games/${gameCode}/teams/${teamName}`);
    get(teamRef).then((snap) => {
      if (!snap.exists()) {
        set(teamRef, { score: 0, currentRiddle: 0, hintsUnlocked: [] });
      }
    });

    const teamUnsub = onValue(teamRef, (snap) => {
      if (snap.exists()) setTeamData(snap.val());
    });

    return () => { unsub(); teamUnsub(); };
  }, [gameCode, teamName]);

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
  const hintsUnlocked = teamData?.hintsUnlocked ?? [];

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

      {game?.status === 'waiting' && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Waiting for the Game Master to start...
        </div>
      )}

      {game?.status === 'active' && currentRiddle && (
        <RiddleCard
          riddle={currentRiddle}
          gameCode={gameCode}
          teamName={teamName}
          riddleIndex={currentRiddleIndex}
          totalRiddles={riddles.length}
        />
      )}

      {game?.status === 'active' && !currentRiddle && currentRiddleIndex >= riddles.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem' }}>All riddles solved!</p>
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>Now find the fugitive!</p>
        </div>
      )}

      {/* Unlocked hints */}
      {hintsUnlocked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ color: 'var(--color-accent)' }}>Your Hints</h3>
          {hintsUnlocked.map((hint, i) => (
            <HintDisplay key={i} hint={hint} index={i} />
          ))}
        </div>
      )}

      <button
        className="btn btn-outline"
        onClick={() => navigate(`/map/${gameCode}?name=${encodeURIComponent(teamName)}`)}
        style={{ marginTop: 'auto' }}
      >
        Open Map
      </button>
    </div>
  );
}
