import { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LANDMARKS } from '../../data/landmarks';

function MapViewController({ currentHint, teamLocation }) {
  const map = useMap();
  useEffect(() => {
    if (currentHint) {
      map.setView([currentHint.lat, currentHint.lng], 15);
    } else if (teamLocation) {
      map.setView([teamLocation.lat, teamLocation.lng], 16);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Fix default marker icons broken by Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const fugitiveIcon = L.divIcon({
  html: '<div style="background:#e94560;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #e94560aa"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const exactHintIcon = L.divIcon({
  html: '<div style="background:#f5a623;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #f5a62388"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const teamIcon = L.divIcon({
  html: '<div style="background:#3498db;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #3498dbaa"></div>',
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const teammateIcon = L.divIcon({
  html: '<div style="background:#2ecc71;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px #2ecc71aa"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const VIENNA_CENTER = [48.2082, 16.3738];
const DEFAULT_ZOOM = 13;

function landmarkIcon(lm, visited) {
  const border = visited ? '#888' : '#f5a623';
  const opacity = visited ? '0.45' : '1';
  const inner = visited
    ? `<span style="font-size:13px;line-height:1">✓</span>`
    : `<span style="font-size:15px;line-height:1">${lm.emoji}</span>`;
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;opacity:${opacity}">
      <div style="background:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2.5px solid ${border}">${inner}</div>
      <div style="background:rgba(0,0,0,0.72);color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;white-space:nowrap;max-width:72px;overflow:hidden;text-overflow:ellipsis;text-align:center">${lm.name}</div>
    </div>`,
    className: '',
    iconSize: [30, 46],
    iconAnchor: [15, 46],
    popupAnchor: [0, -48],
  });
}

export default function GameMap({
  currentHint = null,
  fugitiveLocation = null,
  teamLocation = null,
  visitedLandmarks = {},
  isAdmin = false,
  teammateLocations = [],
}) {
  return (
    <MapContainer
      center={VIENNA_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewController currentHint={currentHint} teamLocation={teamLocation} />

      {/* Team view: shrinking zone circle */}
      {currentHint && !isAdmin && (
        <Circle
          center={[currentHint.lat, currentHint.lng]}
          radius={currentHint.radius}
          pathOptions={{ color: '#f5a623', fillColor: '#f5a623', fillOpacity: 0.15, weight: 2 }}
        >
          <Popup>
            <strong>Zone hint</strong><br />
            Mister X is somewhere in this area.<br />
            Radius: {currentHint.radius}m
          </Popup>
        </Circle>
      )}

      {/* Fugitive position — shown for admin always, or for teams with live feed active */}
      {fugitiveLocation && (
        <Marker position={[fugitiveLocation.lat, fugitiveLocation.lng]} icon={fugitiveIcon}>
          <Popup>
            <strong>{isAdmin ? 'Mister X' : '📡 Live Feed'}</strong><br />
            Last update: {new Date(fugitiveLocation.timestamp).toLocaleTimeString()}
          </Popup>
        </Marker>
      )}

      {/* Team's own position */}
      {teamLocation && (
        <Marker position={[teamLocation.lat, teamLocation.lng]} icon={teamIcon}>
          <Popup>
            <strong>You are here</strong><br />
            Updated: {new Date(teamLocation.timestamp).toLocaleTimeString()}
          </Popup>
        </Marker>
      )}

      {/* Same-team subteam positions */}
      {teammateLocations.map(({ name, lat, lng, timestamp }) => (
        <Marker key={name} position={[lat, lng]} icon={teammateIcon}>
          <Popup>
            <strong>{name}</strong><br />
            Updated: {new Date(timestamp).toLocaleTimeString()}
          </Popup>
        </Marker>
      ))}

      {/* Landmark bonus locations */}
      {LANDMARKS.map(lm => {
        const visited = !!visitedLandmarks[lm.id];
        return (
          <Marker key={lm.id} position={[lm.lat, lm.lng]} icon={landmarkIcon(lm, visited)}>
            <Popup>
              <strong>{lm.emoji} {lm.name}</strong><br />
              {lm.description}<br />
              {visited
                ? <em style={{ color: '#888' }}>Already unlocked ✓</em>
                : <em style={{ color: '#f5a623' }}>Enable GPS &amp; stand here to unlock a bonus!</em>}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
