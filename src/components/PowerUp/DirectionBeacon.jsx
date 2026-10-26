import { useState, useEffect, useRef } from 'react';
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

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(2)}km`;
}

/**
 * Live compass towards Mister X.
 *
 * - position: the team's own GPS fix, owned by TeamPage (`teamLocation` prop) so the
 *   player has exactly one location subscription and no duplicated battery drain
 * - heading: device compass (`webkitCompassHeading` on iOS, absolute `alpha` elsewhere)
 * - target: Mister X's live `lastUpdate`, so the needle follows him while he moves
 *
 * The arrow is rotated by `bearing − heading`, i.e. it points where the phone is
 * actually facing. Without a compass it falls back to a north-up arrow.
 */
export default function DirectionBeacon({ gameCode, until, teamLocation = null }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, until - Date.now()));
  const [fugitive, setFugitive] = useState(null);
  const [heading, setHeading] = useState(null);
  const [compassState, setCompassState] = useState('unknown'); // unknown | granted | denied
  const [tick, setTick] = useState(0);
  const headingRef = useRef(null);
  const teamPos = teamLocation?.lat != null ? teamLocation : null;

  // countdown + "signal age" refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, until - Date.now()));
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(timer);
  }, [until]);

  // Mister X keeps moving — follow him live
  useEffect(() => {
    return onValue(ref(db, `games/${gameCode}/fugitive/lastUpdate`), snap => {
      if (snap.exists()) setFugitive(snap.val());
    });
  }, [gameCode]);

  // compass
  useEffect(() => {
    const handler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
        h = e.webkitCompassHeading; // iOS: already clockwise from north
      } else if (typeof e.alpha === 'number') {
        h = 360 - e.alpha; // alpha is counter-clockwise
      }
      if (h != null && Number.isFinite(h)) {
        headingRef.current = h % 360;
        setHeading(h % 360);
        setCompassState('granted');
      }
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  if (remaining <= 0) return null;

  const secs = Math.ceil(remaining / 1000);
  const secStr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const needsIosCompassPermission =
    typeof window !== 'undefined' &&
    typeof window.DeviceOrientationEvent !== 'undefined' &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function' &&
    compassState !== 'granted' &&
    compassState !== 'denied';

  const requestCompass = async () => {
    try {
      const result = await window.DeviceOrientationEvent.requestPermission();
      setCompassState(result === 'granted' ? 'granted' : 'denied');
    } catch {
      setCompassState('denied');
    }
  };

  let info = null;
  if (fugitive?.lat != null && teamPos) {
    const bear = bearing(teamPos.lat, teamPos.lng, fugitive.lat, fugitive.lng);
    const dist = haversineDistance(teamPos.lat, teamPos.lng, fugitive.lat, fugitive.lng);
    const arrow = heading != null ? (bear - heading + 360) % 360 : bear;
    const ageSec = Math.max(0, Math.round((Date.now() - (fugitive.timestamp ?? Date.now())) / 1000));
    info = {
      bear,
      arrow,
      dir: toCardinal(bear),
      distStr: formatDistance(dist),
      ageSec,
      hasHeading: heading != null,
    };
  }
  void tick; // re-render keeps the signal age honest

  return (
    <div className="card" style={{ borderLeft: '4px solid #e67e22' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: info ? '0.75rem' : 0 }}>
        <p style={{ fontWeight: 700, color: '#e67e22' }}>🧭 Direction Beacon</p>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e67e22' }}>{secStr}</span>
      </div>

      {!teamPos && (
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          Tap <strong>Enable GPS</strong> below to aim the beacon.
        </p>
      )}

      {teamPos && !info && (
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Waiting for Mister X's signal…</p>
      )}

      {info && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            border: '3px solid #e67e22',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg)',
          }}>
            <span
              data-testid="beacon-arrow"
              style={{
                display: 'block',
                fontSize: '1.8rem',
                lineHeight: 1,
                color: '#e67e22',
                transform: `rotate(${Math.round(info.arrow)}deg)`,
                transition: 'transform 0.25s ease-out',
              }}
            >
              ↑
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <p style={{ fontWeight: 800, fontSize: '1.3rem', color: '#e67e22', lineHeight: 1 }}>
              {info.distStr}
            </p>
            <p className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>
              {info.hasHeading
                ? `Turn until the arrow points forward · ${info.dir} (${Math.round(info.bear)}°)`
                : `Arrow is north-up: ${info.dir} (${Math.round(info.bear)}°)`}
            </p>
            <p style={{ fontSize: '0.7rem', color: info.ageSec > 60 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
              Mister X signal {info.ageSec}s old
            </p>
          </div>
        </div>
      )}

      {needsIosCompassPermission && (
        <button className="btn btn-outline" style={{ marginTop: '0.6rem', fontSize: '0.8rem' }} onClick={requestCompass}>
          Enable phone compass
        </button>
      )}
      {compassState === 'denied' && (
        <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}>
          Compass blocked — the arrow stays north-up. Allow motion access in your browser settings.
        </p>
      )}
    </div>
  );
}
