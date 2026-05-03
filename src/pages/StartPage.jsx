import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { ref, get } from 'firebase/database';

export default function StartPage() {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [subteamNum, setSubteamNum] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [fugitiveCode, setFugitiveCode] = useState('');
  const [fugitiveError, setFugitiveError] = useState('');
  const [fugitiveLooking, setFugitiveLooking] = useState(false);

  const joinAsTeam = () => {
    const fullName = subteamNum.trim()
      ? `${teamName.trim()} ${subteamNum.trim()}`
      : teamName.trim();
    const bigTeam = teamName.trim();
    navigate(`/team/${gameCode}?name=${encodeURIComponent(fullName)}&bigTeam=${encodeURIComponent(bigTeam)}`);
  };

  const joinAsFugitive = async () => {
    setFugitiveError('');
    setFugitiveLooking(true);
    try {
      const snap = await get(ref(db, `fugitiveCodes/${fugitiveCode.trim()}`));
      if (!snap.exists()) { setFugitiveError('Invalid Mister X code.'); return; }
      navigate(`/fugitive/${snap.val()}`);
    } catch {
      setFugitiveError('Connection error. Try again.');
    } finally {
      setFugitiveLooking(false);
    }
  };

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
        {teamName.trim() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Subteam
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {['—', '1', '2', '3', '4', '5', '6'].map((val) => {
                const active = val === '—' ? subteamNum === '' : subteamNum === val;
                return (
                  <button
                    key={val}
                    type="button"
                    className="btn btn-outline"
                    style={{
                      padding: '0.35rem 0.75rem', fontSize: '0.85rem',
                      borderColor: active ? 'var(--color-hunter)' : undefined,
                      color: active ? 'var(--color-hunter)' : undefined,
                    }}
                    onClick={() => setSubteamNum(val === '—' ? '' : val)}
                  >
                    {val === '—' ? 'No subteam' : `Subteam ${val}`}
                  </button>
                );
              })}
            </div>
            <p className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
              Same subteam = shared progress across devices. Subteams of the same team see each other on the map and share a team chat.
            </p>
          </div>
        )}
        <button
          className="btn btn-primary"
          disabled={!teamName.trim() || !gameCode.trim()}
          onClick={joinAsTeam}
        >
          Join Hunt
        </button>
      </div>

      {/* Fugitive */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--color-fugitive)' }}>Mister X</h2>
        <input
          type="text"
          placeholder="Mister X code (from admin)"
          value={fugitiveCode}
          onChange={(e) => { setFugitiveCode(e.target.value.toUpperCase()); setFugitiveError(''); }}
        />
        {fugitiveError && <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{fugitiveError}</p>}
        <button
          className="btn btn-outline"
          disabled={!fugitiveCode.trim() || fugitiveLooking}
          onClick={joinAsFugitive}
        >
          {fugitiveLooking ? 'Looking up…' : 'I am Mister X'}
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
