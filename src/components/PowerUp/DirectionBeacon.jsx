import { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { ref, onValue } from 'firebase/database';

function bearing(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLng = (lng2 - lng1) * r;
  const y = Math.sin(dLng) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toCardinal(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

export default function DirectionBeacon({ gameCode, until }) {
  const [remaining, setRemaining] = useState(Math.max(0, until - Date.now()));
  const [fugitive, setFugitive] = useState(null);
  const [teamPos, setTeamPos] = useState(null);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, until - Date.now())), 500);
    return () => clearInterval(timer);
  }, [until]);

  useEffect(() => {
    const unsub = onValue(ref(db, `games/${gameCode}/fugitive/lastUpdate`), snap => {
      if (snap.exists()) setFugitive(snap.val());
    });
    return () => unsub();
  }, [gameCode]);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    const id = navigator.geolocation.watchPosition(
      pos => setTeamPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  if (remaining <= 0) return null;

  const secs = Math.ceil(remaining / 1000);
  const secStr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  let info = null;
  if (fugitive && teamPos) {
    const bear = bearing(teamPos.lat, teamPos.lng, fugitive.lat, fugitive.lng);
    const dist = haversineDistance(teamPos.lat, teamPos.lng, fugitive.lat, fugitive.lng);
    const distStr = dist < 1000
      ? `~${Math.round(dist / 50) * 50}m`
      : `~${(dist / 1000).toFixed(1)}km`;
    info = { bear, dir: toCardinal(bear), distStr };
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid #e67e22' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: info ? '0.75rem' : 0 }}>
        <p style={{ fontWeight: 700, color: '#e67e22' }}>🧭 Direction Beacon</p>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e67e22' }}>{secStr}</span>
      </div>

      {geoError && (
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Tap <strong>Enable GPS</strong> at the bottom of the page to see direction.</p>
      )}

      {!geoError && !info && (
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Getting your location…</p>
      )}

      {info && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            border: '3px solid #e67e22',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
            transform: `rotate(${info.bear}deg)`,
          }}>
            ↑
          </div>
          <div>
            <p style={{ fontWeight: 800, fontSize: '1.3rem', color: '#e67e22' }}>{info.dir}</p>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>{info.distStr} away</p>
          </div>
        </div>
      )}
    </div>
  );
}
