import JSZip from 'jszip';

// Load /logo.png once. Same-origin -> never taints the canvas.
let _logoPromise = null;
function loadLogo() {
  if (!_logoPromise) {
    _logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/logo.png';
    });
  }
  return _logoPromise;
}

// Fetch a (cross-origin) photo and load it as an Image via a blob URL,
// which is same-origin -> drawing it to a canvas does NOT taint it.
async function loadPhoto(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = blobUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// Draw logo (bottom-right) + date (bottom-left) watermark over the whole image.
function drawWatermark(ctx, W, H, logo, dateStr) {
  const pad = Math.max(18, Math.round(W * 0.025));

  // soft gradient strip along the bottom so marks stay legible on any photo
  const grad = ctx.createLinearGradient(0, H - H * 0.18, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - H * 0.18, W, H * 0.18);

  // logo bottom-right
  if (logo && logo.naturalWidth) {
    const lw = Math.round(W * 0.20);
    const lh = Math.round(logo.naturalHeight * (lw / logo.naturalWidth));
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logo, W - lw - pad, H - lh - pad, lw, lh);
    ctx.globalAlpha = 1;
  }

  // date bottom-left
  if (dateStr) {
    const fs = Math.max(22, Math.round(W * 0.035));
    ctx.font = `700 ${fs}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(dateStr, pad, H - pad - Math.round(fs * 0.2));
    ctx.shadowBlur = 0;
  }
}

// Watermark a single photo, return a JPEG blob.
async function watermarkPhoto(url, logo, dateStr) {
  const img = await loadPhoto(url);
  // cap longest side to keep memory/zip size reasonable
  const MAX = 1600;
  let W = img.naturalWidth, H = img.naturalHeight;
  const scale = Math.min(1, MAX / Math.max(W, H));
  W = Math.round(W * scale);
  H = Math.round(H * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  drawWatermark(ctx, W, H, logo, dateStr);

  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
  );
}

/**
 * Build a zip of a team's challenge photos, each watermarked with the app logo + date,
 * and trigger a browser download.
 *
 * @param {object} opts
 * @param {object} opts.submissions  games/<code>/teams/<team>/submissions object
 * @param {string} opts.teamName
 * @param {string} opts.gameCode
 * @param {string} opts.dateStr      e.g. "01.06.2026"
 * @param {(done:number, total:number) => void} [opts.onProgress]
 * @returns {Promise<number>} number of photos written
 */
export async function downloadTeamPhotos({ submissions, teamName, gameCode, dateStr, onProgress }) {
  const entries = Object.entries(submissions ?? {})
    .filter(([, s]) => s && s.photoUrl)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  if (!entries.length) {
    throw new Error('no-photos');
  }

  const logo = await loadLogo();
  const zip = new JSZip();
  const safeTeam = String(teamName).replace(/[^a-z0-9]+/gi, '-');

  let done = 0;
  onProgress?.(0, entries.length);

  // sequential to keep memory low on phones
  for (let i = 0; i < entries.length; i++) {
    const [idx, sub] = entries[i];
    const label = `${String(Number(idx) + 1).padStart(2, '0')}_${sub.status ?? 'photo'}`;
    try {
      const blob = await watermarkPhoto(sub.photoUrl, logo, dateStr);
      zip.file(`${safeTeam}/${label}.jpg`, blob);
    } catch {
      // fall back to the raw photo if watermarking fails (e.g. fetch error)
      try {
        const raw = await (await fetch(sub.photoUrl)).blob();
        const ext = raw.type.includes('png') ? 'png' : 'jpg';
        zip.file(`${safeTeam}/${label}.${ext}`, raw);
      } catch {
        zip.file(`${safeTeam}/${label}_failed.txt`, `Could not fetch: ${sub.photoUrl}`);
      }
    }
    done++;
    onProgress?.(done, entries.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTeam}-photos-${gameCode}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return done;
}
