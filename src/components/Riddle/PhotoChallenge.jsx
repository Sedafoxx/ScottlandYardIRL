import { useState, useEffect, useRef } from 'react';
import heic2any from 'heic2any';
import { db, storage } from '../../firebase/config';
import { ref as dbRef, onValue, set } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { DIFFICULTY_CONFIG } from '../../utils/hints';

export default function PhotoChallenge({ riddle, gameCode, teamName, riddleIndex }) {
  const [chosenOption, setChosenOption] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const fileInputRef = useRef();

  useEffect(() => {
    const unsubSub = onValue(
      dbRef(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`),
      (snap) => setSubmission(snap.val())
    );
    const unsubChoice = onValue(
      dbRef(db, `games/${gameCode}/teams/${teamName}/riddleChoices/${riddleIndex}`),
      (snap) => { if (snap.exists()) setChosenOption(snap.val()); }
    );
    return () => { unsubSub(); unsubChoice(); };
  }, [gameCode, teamName, riddleIndex]);

  const selectOption = async (option) => {
    setChosenOption(option);
    await set(dbRef(db, `games/${gameCode}/teams/${teamName}/riddleChoices/${riddleIndex}`), option);
  };

  const clearChoice = async () => {
    setChosenOption(null);
    await set(dbRef(db, `games/${gameCode}/teams/${teamName}/riddleChoices/${riddleIndex}`), null);
  };

  const handleFile = async (e) => {
    let file = e.target.files[0];
    if (!file || !chosenOption) return;
    setUploading(true);
    setUploadError('');
    try {
      if (
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif')
      ) {
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        file = new File([blob instanceof Blob ? blob : blob[0]], 'photo.jpg', { type: 'image/jpeg' });
      }
      const path = `photos/${gameCode}/${teamName}/${riddleIndex}_${Date.now()}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      await set(dbRef(db, `games/${gameCode}/teams/${teamName}/submissions/${riddleIndex}`), {
        photoUrl: url,
        status: 'pending',
        submittedAt: Date.now(),
        challenge: chosenOption.challenge,
        difficulty: chosenOption.difficulty,
        reduction: chosenOption.reduction,
        riddleIndex,
        ...(chosenOption.requiresText && submittedText.trim() ? { submittedText: submittedText.trim() } : {}),
      });
    } catch (err) {
      setUploadError('Upload failed. Check your connection and try again.');
      console.error(err);
    }
    setUploading(false);
    e.target.value = '';
  };

  const cfg = (difficulty) => DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  // ── Pending ──────────────────────────────────────────────────────────────────
  if (submission?.status === 'pending') {
    const c = cfg(submission.difficulty);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: '8px', borderLeft: `3px solid ${c.color}` }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>{c.label} challenge</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', lineHeight: 1.5 }}>{submission.challenge}</p>
        </div>
        <img src={submission.photoUrl} alt="Submitted" style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '240px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: '#f5a623', boxShadow: '0 0 0 3px color-mix(in srgb, #f5a623 30%, transparent)' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Waiting for admin approval…</p>
        </div>
      </div>
    );
  }

  // ── Rejected ─────────────────────────────────────────────────────────────────
  if (submission?.status === 'rejected') {
    const c = cfg(submission.difficulty);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderRadius: '8px', borderLeft: `3px solid ${c.color}` }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>{c.label} challenge</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', lineHeight: 1.5 }}>{submission.challenge}</p>
        </div>
        <img src={submission.photoUrl} alt="Rejected" style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '240px', opacity: 0.5 }} />
        <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600 }}>Photo rejected</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {submission.rejectReason || 'Make sure you are clearly visible in the photo and try again.'}
          </p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button className="btn btn-accent" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Resubmit Photo'}
        </button>
        {uploadError && <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{uploadError}</p>}
      </div>
    );
  }

  // ── Option chosen, not yet submitted ─────────────────────────────────────────
  if (chosenOption) {
    const c = cfg(chosenOption.difficulty);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: '8px', borderLeft: `4px solid ${c.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>{c.label}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>-{chosenOption.reduction * 100}% radius</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>+{c.points} pts</span>
            </div>
          </div>
          <p style={{ lineHeight: 1.6, fontSize: '0.9rem' }}>{chosenOption.challenge}</p>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          This must be a <strong>selfie</strong> — you must be clearly visible in the photo. The admin will review it before your zone updates.
        </p>
        {chosenOption.requiresText && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-accent)' }}>
              {chosenOption.textPrompt}
            </label>
            <textarea
              placeholder="Type your answer here…"
              value={submittedText}
              onChange={(e) => setSubmittedText(e.target.value)}
              rows={2}
              style={{
                width: '100%', resize: 'vertical', padding: '0.6rem 0.75rem',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)', fontSize: '0.9rem',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button
          className="btn btn-accent"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || (chosenOption.requiresText && !submittedText.trim())}
        >
          {uploading ? 'Uploading…' : 'Take / Upload Selfie'}
        </button>
        {uploadError && <p style={{ color: 'var(--color-primary)', fontSize: '0.875rem' }}>{uploadError}</p>}
        <button className="btn btn-outline" style={{ fontSize: '0.8rem' }} onClick={clearChoice}>
          ← Pick a different challenge
        </button>
      </div>
    );
  }

  // ── Pick an option ────────────────────────────────────────────────────────────
  const options = Array.isArray(riddle.options)
    ? riddle.options
    : Object.values(riddle.options ?? {});

  if (!options.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Choose your challenge. Harder challenges shrink the zone more and earn more points.
      </p>
      {options.map((option) => {
        const c = cfg(option.difficulty);
        return (
          <button
            key={option.difficulty}
            onClick={() => selectOption(option)}
            style={{
              background: 'var(--color-bg)',
              border: `1px solid ${c.color}`,
              borderRadius: '8px',
              padding: '0.75rem',
              textAlign: 'left',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: c.color, textTransform: 'uppercase' }}>
                {c.label}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>-{option.reduction * 100}% radius</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 600 }}>+{c.points} pts</span>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.5, margin: 0 }}>
              {option.challenge}
            </p>
          </button>
        );
      })}
    </div>
  );
}
