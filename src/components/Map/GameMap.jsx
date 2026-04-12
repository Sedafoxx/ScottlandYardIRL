import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix default marker icons broken by Webpack/Vite
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

// Vienna center as default
const VIENNA_CENTER = [48.2082, 16.3738];
const DEFAULT_ZOOM = 13;

export default function GameMap({ zoneHints = [], fugitiveLocation = null, isAdmin = false }) {
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

      {/* Render zone hints as circles */}
      {zoneHints.map((hint, i) => (
        hint.lat && hint.lng ? (
          <Circle
            key={i}
            center={[hint.lat, hint.lng]}
            radius={hint.radius ?? 500}
            pathOptions={{
              color: '#f5a623',
              fillColor: '#f5a623',
              fillOpacity: 0.15,
              weight: 2,
            }}
          >
            <Popup>
              <strong>Zone hint #{i + 1}</strong><br />
              {hint.content}
            </Popup>
          </Circle>
        ) : null
      ))}

      {/* Admin: show fugitive exact location */}
      {isAdmin && fugitiveLocation && (
        <Marker
          position={[fugitiveLocation.lat, fugitiveLocation.lng]}
          icon={fugitiveIcon}
        >
          <Popup>
            <strong>Fugitive</strong><br />
            Last update: {new Date(fugitiveLocation.timestamp).toLocaleTimeString()}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
