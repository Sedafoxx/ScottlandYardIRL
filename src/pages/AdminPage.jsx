import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, onValue, set, update, push } from 'firebase/database';

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const DEFAULT_RIDDLES = [
  {
    question: 'I have hands but cannot clap. What am I?',
    answer: 'clock',
    hint: {
      type: 'text',
      content: 'The fugitive was last seen near a large clock tower.',
    },
  },
  {
    question: 'What has cities, but no houses live there; mountains, but no trees grow there; water, but no fish swim there; and roads, but no cars drive there?',
    answer: 'map',
    hint: {
      type: 'text',
      content: 'Head to the area around the Donaukanal.',
    },
  },
  {
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    answer: 'echo',
    hint: {
      type: 'zone',
      content: 'The fugitive is within 500m of Stephansdom.',
      lat: 48.2085,
      lng: 16.3727,
      radius: 500,
    },
  },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState({});
  const [activeGameCode, setActiveGameCode] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [newRiddleQ, setNewRiddleQ] = useState('');
  const [newRiddleA, setNewRiddleA] = useState('');
  const [newHint, setNewHint] = useState('');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const unsub = onValue(ref(db, 'games'), (snap) => {
      setGames(snap.val() ?? {});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeGameCode) return;
    const unsub = onValue(ref(db, `games/${activeGameCode}`), (snap) => {
      setActiveGame(snap.val());
    });
    return () => unsub();
  }, [activeGameCode]);

  const createGame = async () => {
    const code = generateCode();
    await set(ref(db, `games/${code}`), {
      status: 'waiting',
      createdAt: Date.now(),
      riddles: DEFAULT_RIDDLES.reduce((acc, r, i) => ({ ...acc, [i]: r }), {}),
    });
    setActiveGameCode(code);
  };

  const startGame = () => update(ref(db, `games/${activeGameCode}`), { status: 'active' });
  const endGame = () => update(ref(db, `games/${activeGameCode}`), { status: 'ended' });

  const addRiddle = () => {
    if (!newRiddleQ.trim() || !newRiddleA.trim()) return;
    const riddlesRef = ref(db, `games/${activeGameCode}/riddles`);
    push(riddlesRef, {
      question: newRiddleQ.trim(),
      answer: newRiddleA.trim().toLowerCase(),
      hint: { type: 'text', content: newHint.trim() || 'No hint configured.' },
    });
    setNewRiddleQ('');
    setNewRiddleA('');
    setNewHint('');
  };

  const sendAnnouncement = () => {
    if (!announcement.trim()) return;
    update(ref(db, `games/${activeGameCode}`), {
      announcement: { text: announcement.trim(), timestamp: Date.now() },
    });
    setAnnouncement('');
  };

  const teams = activeGame?.teams ? Object.entries(activeGame.teams) : [];
  const riddles = activeGame?.riddles ? Object.values(activeGame.riddles) : [];
  const fugitiveLocation = activeGame?.fugitive?.lastUpdate;

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
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={endGame}>End</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-accent)' }}>
              Share code <strong>{activeGameCode}</strong> with players
            </p>
          </div>

          {/* Teams */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Teams ({teams.length})</h2>
            {teams.length === 0 && <p className="text-muted">No teams yet.</p>}
            {teams.map(([name, data]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
                <span>{name}</span>
                <span className="text-muted">
                  Riddle {(data.currentRiddle ?? 0) + 1} · {data.score ?? 0} pts
                </span>
              </div>
            ))}
          </div>

          {/* Fugitive location */}
          {fugitiveLocation && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Fugitive Location</h2>
              <p className="text-muted">
                Lat: {fugitiveLocation.lat.toFixed(5)}, Lng: {fugitiveLocation.lng.toFixed(5)}
              </p>
              <p className="text-muted">
                Updated: {new Date(fugitiveLocation.timestamp).toLocaleTimeString()}
              </p>
              <button
                className="btn btn-outline"
                onClick={() => navigate(`/map/${activeGameCode}?admin=true`)}
              >
                View on Map
              </button>
            </div>
          )}

          {/* Announcement */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Send Announcement</h2>
            <input
              type="text"
              placeholder="Message to all teams..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
            />
            <button className="btn btn-primary" onClick={sendAnnouncement} disabled={!announcement.trim()}>
              Send to All
            </button>
          </div>

          {/* Add riddle */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem' }}>Riddles ({riddles.length})</h2>
            {riddles.map((r, i) => (
              <div key={i} style={{ padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '8px', fontSize: '0.875rem' }}>
                <p style={{ fontWeight: 600 }}>#{i + 1}: {r.question}</p>
                <p className="text-muted">Answer: {r.answer} · Hint: {r.hint?.content?.substring(0, 40)}...</p>
              </div>
            ))}
            <input type="text" placeholder="New riddle question" value={newRiddleQ} onChange={(e) => setNewRiddleQ(e.target.value)} />
            <input type="text" placeholder="Answer (lowercase)" value={newRiddleA} onChange={(e) => setNewRiddleA(e.target.value)} />
            <input type="text" placeholder="Hint text when solved" value={newHint} onChange={(e) => setNewHint(e.target.value)} />
            <button className="btn btn-accent" onClick={addRiddle} disabled={!newRiddleQ.trim() || !newRiddleA.trim()}>
              Add Riddle
            </button>
          </div>
        </>
      )}
    </div>
  );
}
