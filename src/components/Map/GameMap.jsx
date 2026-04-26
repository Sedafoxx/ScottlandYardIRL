import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

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

const VIENNA_CENTER = [48.2082, 16.3738];
const DEFAULT_ZOOM = 13;

export default function GameMap({ currentHint = null, fugitiveLocation = null, teamLocation = null, isAdmin = false }) {
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

      {/* Team view: shrinking zone circle */}
      {currentHint && !isAdmin && (
        <Circle
          center={[currentHint.lat, currentHint.lng]}
          radius={currentHint.radius}
          pathOptions={{ color: '#f5a623', fillColor: '#f5a623', fillOpacity: 0.15, weight: 2 }}
        >
          <Popup>
            <strong>Zone hint</strong><br />
            The fugitive is somewhere in this area.<br />
            Radius: {currentHint.radius}m
          </Popup>
        </Circle>
      )}

      {/* Fugitive position — shown for admin always, or for teams with live feed active */}
      {fugitiveLocation && (
        <Marker position={[fugitiveLocation.lat, fugitiveLocation.lng]} icon={fugitiveIcon}>
          <Popup>
            <strong>{isAdmin ? 'Fugitive' : '📡 Live Feed'}</strong><br />
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
    </MapContainer>
  );
}
