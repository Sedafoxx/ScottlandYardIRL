import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LiveFeedCard({ until, gameCode, teamName }) {
  const [remaining, setRemaining] = useState(Math.max(0, until - Date.now()));
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, until - Date.now())), 500);
    return () => clearInterval(timer);
  }, [until]);

  if (remaining <= 0) return null;

  const secs = Math.ceil(remaining / 1000);
  const secStr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="card" style={{ borderLeft: '4px solid #e74c3c' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontWeight: 700, color: '#e74c3c' }}>📡 Live Feed Active</p>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
            Fugitive visible on map — {secStr} remaining
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem', flexShrink: 0, background: '#e74c3c', borderColor: '#e74c3c' }}
          onClick={() => navigate(`/map/${gameCode}?name=${encodeURIComponent(teamName)}&livefeed=${until}`)}
        >
          Open Map
        </button>
      </div>
    </div>
  );
}
