import { useEffect, useState } from 'react';
import { resolvePhoto } from '../utils/photoStore';

/**
 * Renders a photo from a submission (or selfie request) that may live in
 * Firebase Storage (`photoUrl`) or the database fallback (`photoRef`).
 */
export default function PhotoImage({ sub, alt = 'Photo', style, className }) {
  const direct = sub?.photoUrl ?? null;
  const ref = sub?.photoRef ?? null;
  const [loaded, setLoaded] = useState(null); // { ref, url } | { ref, failed }

  useEffect(() => {
    if (direct || !ref) return;
    let alive = true;
    resolvePhoto({ photoRef: ref })
      .then((url) => { if (alive) setLoaded({ ref, url }); })
      .catch(() => { if (alive) setLoaded({ ref, failed: true }); });
    return () => { alive = false; };
  }, [direct, ref]);

  const match = loaded?.ref === ref ? loaded : null;
  if (match?.failed) {
    return <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Photo unavailable</p>;
  }
  const src = direct ?? match?.url ?? null;
  if (!src) return null;
  return <img src={src} alt={alt} style={style} className={className} />;
}
