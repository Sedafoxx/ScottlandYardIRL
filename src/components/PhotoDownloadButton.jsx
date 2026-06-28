import { useState } from 'react';
import { downloadTeamPhotos } from '../utils/photoDownload';

/**
 * "Download our photos" button. Watermarks every challenge photo for the team
 * (app logo + date) and saves a zip. Works any time — during or after the game.
 */
export default function PhotoDownloadButton({ submissions, teamName, gameCode, dateStr }) {
  const [state, setState] = useState('idle'); // idle | working | done | empty | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const count = Object.values(submissions ?? {}).filter((s) => s && s.photoUrl).length;

  const run = async () => {
    if (state === 'working') return;
    setState('working');
    setProgress({ done: 0, total: count });
    try {
      await downloadTeamPhotos({
        submissions,
        teamName,
        gameCode,
        dateStr,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setState('done');
      setTimeout(() => setState('idle'), 4000);
    } catch (err) {
      setState(err?.message === 'no-photos' ? 'empty' : 'error');
      setTimeout(() => setState('idle'), 4000);
    }
  };

  const label =
    state === 'working'
      ? `Preparing ${progress.done}/${progress.total}...`
      : state === 'done'
        ? '✅ Saved!'
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
        Saves a zip of your team's photos, each stamped with the logo &amp; date.
      </p>
    </div>
  );
}
