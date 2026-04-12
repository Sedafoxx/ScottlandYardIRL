export default function HintDisplay({ hint, index }) {
  if (!hint) return null;

  return (
    <div className="card" style={{
      borderColor: 'var(--color-accent)',
      borderLeftWidth: '4px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600, textTransform: 'uppercase' }}>
          Hint #{index + 1} · {hint.type === 'zone' ? 'Map Zone' : hint.type === 'photo' ? 'Photo' : 'Text'}
        </p>
      </div>

      {hint.type === 'photo' && hint.url && (
        <img
          src={hint.url}
          alt={`Hint ${index + 1}`}
          style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '200px' }}
        />
      )}

      <p style={{ lineHeight: 1.6 }}>{hint.content}</p>

      {hint.type === 'zone' && hint.lat && hint.lng && (
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          Zone visible on the map (radius: {hint.radius ?? 500}m)
        </p>
      )}
    </div>
  );
}
