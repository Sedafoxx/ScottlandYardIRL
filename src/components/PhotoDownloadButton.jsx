import { useState } from 'react';
import { downloadTeamPhotos } from '../utils/photoDownload';
import { hasPhoto } from '../utils/photoStore';

/**
 * "Download our photos" button. Watermarks every challenge photo for the team
 * (app logo + date) and saves a zip. Works any time — during or after the game.
 *
 * On phones the zip goes through the share sheet, because iOS Safari drops
 * `a.download` clicks that happen after an await (see saveBlob()).
 */
export default function PhotoDownloadButton({ submissions, teamName, gameCode, dateStr }) {
  const [state, setState] = useState('idle'); // idle | working | done | shared | empty | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const count = Object.values(submissions ?? {}).filter(hasPhoto).length;

  const run = async () => {
    if (state === 'working') return;
    setState('working');
    setError('');
    setProgress({ done: 0, total: count });
    try {
      const { how } = await downloadTeamPhotos({
        submissions,
        teamName,
        gameCode,
        dateStr,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setState(how === 'shared' ? 'shared' : 'done');
      setTimeout(() => setState('idle'), 5000);
    } catch (err) {
      setError(err?.message ?? '');
      setState(err?.message === 'no-photos' ? 'empty' : 'error');
      setTimeout(() => setState('idle'), 5000);
    }
  };

  const label =
    state === 'working'
      ? `Preparing ${progress.done}/${progress.total}...`
      : state === 'done'
        ? '✅ Saved!'
        : state === 'shared'
          ? '📤 Sent to your share sheet'
          : state === 'empty'
            ? 'No photos yet'
            : state === 'error'
              ? '⚠️ Try again'
              : `📸 Download our photos${count ? ` (${count})` : ''}`;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <button
        className="btn btn-accent"
        onClick={run}
        disabled={state === 'working' || count === 0}
        style={{ opacity: count === 0 ? 0.55 : 1 }}
      >
        {label}
      </button>
      <p className="text-muted" style={{ fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
        {`Saves a zip of your team's photos, each stamped with the logo & date. `}
        {'On a phone it opens the share sheet — pick "Save to Files" / "Save images".'}
      </p>
      {state === 'error' && (
        <p style={{ color: 'var(--color-primary)', fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
          {error === 'no-photos'
            ? 'No photos stored yet.'
            : `Download failed (${error || 'unknown error'}). Keep this page open and try once more.`}
        </p>
      )}
    </div>
  );
}
