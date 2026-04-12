import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StartPage() {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [gameCode, setGameCode] = useState('');

  return (
    <div className="page" style={{ justifyContent: 'center', gap: '1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
          Scotland Yard
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
          Vienna Edition
        </p>
      </div>

      {/* Join as Team */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-hunter)' }}>Hunter Team</h2>
        <input
          type="text"
          placeholder="Team name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Game code (from admin)"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.toUpperCase())}
        />
        <button
          className="btn btn-primary"
          disabled={!teamName.trim() || !gameCode.trim()}
          onClick={() => navigate(`/team/${gameCode}?name=${encodeURIComponent(teamName)}`)}
        >
          Join Hunt
        </button>
      </div>

      {/* Fugitive */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Fugitive</h2>
        <input
          type="text"
          placeholder="Game code"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.toUpperCase())}
        />
        <button
          className="btn btn-outline"
          disabled={!gameCode.trim()}
          onClick={() => navigate(`/fugitive/${gameCode}`)}
        >
          I am the Fugitive
        </button>
      </div>

      {/* Admin */}
      <button
        className="btn"
        style={{ background: 'var(--color-admin)', color: 'white' }}
        onClick={() => navigate('/admin')}
      >
        Game Master (Admin)
      </button>
    </div>
  );
}
