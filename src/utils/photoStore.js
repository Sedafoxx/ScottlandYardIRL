import heic2any from 'heic2any';
import { db, storage } from '../firebase/config';
import { ref as dbRef, get, set, remove } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Photo storage with a database fallback.
 *
 * Preferred: Firebase Storage at photos/{gameCode}/{teamName}/{file} (fast, cheap,
 * streams straight from the CDN).
 *
 * Fallback: if Storage refuses the upload — dead billing account, quota, rules —
 * the photo is compressed harder and stored as a data URL under the SEPARATE
 * `photos/` database root. That root is never subscribed to by the game pages,
 * so it does not bloat the live game snapshot; viewers fetch one photo on demand.
 *
 * A submission therefore carries either `photoUrl` (Storage) or `photoRef`
 * (database key). Always read them through `resolvePhoto()` / `<PhotoImage>`.
 */

const STORAGE_MAX_DIM = 1280;
const STORAGE_QUALITY = 0.78;

const FALLBACK_MAX_DIM = 820;
const FALLBACK_QUALITY = 0.55;
const MAX_DATA_URL_LENGTH = 380_000; // keeps each node inside the rules' 400 KB cap

export function photosPath(gameCode) {
  return `photos/${gameCode}`;
}

// ── at-rest encryption ───────────────────────────────────────────────────────
// Photos stored in the database are encrypted with AES-GCM using a key derived
// from the game code. Anyone holding a game code (players, the Game Master) can
// still view them, but a database dump/backup or a guessed photo key reveals
// nothing readable.

const keyCache = new Map();

async function photoKey(gameCode) {
  if (keyCache.has(gameCode)) return keyCache.get(gameCode);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`scotlandyard-irl:photos:${gameCode}`)
  );
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  keyCache.set(gameCode, key);
  return key;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptDataUrl(gameCode, dataUrl) {
  const key = await photoKey(gameCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(dataUrl);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { cipher: bytesToBase64(new Uint8Array(cipher)), iv: bytesToBase64(iv) };
}

async function decryptDataUrl(gameCode, cipherB64, ivB64) {
  const key = await photoKey(gameCode);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(cipherB64)
  );
  return new TextDecoder().decode(plain);
}

async function convertHeic(file) {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name || '');
  if (!isHeic) return file;
  try {
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const out = blob instanceof Blob ? blob : blob[0];
    return new File([out], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Downscale + re-encode to JPEG. Returns a Blob (or the original on failure). */
async function compressImage(file, maxDim, quality) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (bitmap.close) bitmap.close();
    if (!blob) return file;
    return blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function storeInDatabase({ file, gameCode, teamName, key }) {
  let blob = await compressImage(file, FALLBACK_MAX_DIM, FALLBACK_QUALITY);
  let dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    blob = await compressImage(file, 640, 0.42);
    dataUrl = await blobToDataUrl(blob);
  }
  const photoRef = `${photosPath(gameCode)}/${key}`;
  const { cipher, iv } = await encryptDataUrl(gameCode, dataUrl);
  await set(dbRef(db, photoRef), {
    cipher,
    iv,
    team: teamName ?? null,
    createdAt: Date.now(),
  });
  return photoRef;
}

/**
 * Save a photo and return `{ photoUrl, photoRef }` — exactly one is set.
 * Never throws for a Storage outage: it falls back to the database.
 */
export async function savePhoto({ file, gameCode, teamName, label = 'photo' }) {
  if (!file) throw new Error('no-file');
  const prepared = await convertHeic(file);
  const name = `${String(label).replace(/[^a-z0-9_-]+/gi, '-')}_${Date.now()}.jpg`;

  try {
    const small = await compressImage(prepared, STORAGE_MAX_DIM, STORAGE_QUALITY);
    // Encrypt before it leaves the device: a Storage object (or a leaked
    // download URL/token) is ciphertext, exactly like the database fallback.
    const key = await photoKey(gameCode);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await small.arrayBuffer());
    const payload = new Blob([iv, new Uint8Array(cipher)], { type: 'application/octet-stream' });

    const sRef = storageRef(storage, `${photosPath(gameCode)}/${teamName}/${name}.enc`);
    await uploadBytes(sRef, payload, { contentType: 'application/octet-stream' });
    const photoUrl = await getDownloadURL(sRef);
    return { photoUrl, photoRef: null, photoEnc: true };
  } catch (err) {
    console.warn('[photoStore] Storage unavailable, falling back to database storage:', err?.code ?? err?.message ?? err);
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const photoRef = await storeInDatabase({ file: prepared, gameCode, teamName, key });
    return { photoUrl: null, photoRef, photoEnc: false };
  }
}

const decryptedUrlCache = new Map();

/** Download and decrypt an encrypted Storage object into a blob URL. */
async function decryptStoragePhoto(photoUrl, gameCode) {
  if (decryptedUrlCache.has(photoUrl)) return decryptedUrlCache.get(photoUrl);
  const res = await fetch(photoUrl);
  if (!res.ok) throw new Error(`storage fetch ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const iv = bytes.subarray(0, 12);
  const cipher = bytes.subarray(12);
  const key = await photoKey(gameCode);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const url = URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
  decryptedUrlCache.set(photoUrl, url);
  return url;
}

/** Load and decrypt a database-stored photo by its reference. */
export async function loadPhotoRef(path) {
  if (!path) return null;
  const snap = await get(dbRef(db, path));
  const val = snap.val();
  if (!val) return null;
  if (val.cipher && val.iv) {
    const gameCode = path.split('/')[1];
    try {
      return await decryptDataUrl(gameCode, val.cipher, val.iv);
    } catch (err) {
      console.warn('[photoStore] could not decrypt photo', path, err?.message ?? err);
      return null;
    }
  }
  return val.dataUrl ?? null; // legacy, unencrypted
}

/**
 * Displayable URL for anything that carries photoUrl / photoRef.
 * Encrypted Storage objects and database photos are decrypted here, so callers
 * never need to know where a photo lives.
 */
export async function resolvePhoto(sub, gameCode = null) {
  if (!sub) return null;
  if (sub.photoUrl) {
    if (!sub.photoEnc) return sub.photoUrl; // legacy plaintext upload
    const code = gameCode ?? sub.gameCode ?? null;
    try {
      return await decryptStoragePhoto(sub.photoUrl, code);
    } catch (err) {
      console.warn('[photoStore] could not decrypt storage photo', err?.message ?? err);
      return null;
    }
  }
  if (sub.photoRef) return loadPhotoRef(sub.photoRef);
  return null;
}

export function hasPhoto(sub) {
  return !!(sub && (sub.photoUrl || sub.photoRef));
}

/** Remove every stored photo of a game (called when the GM deletes a game). */
export async function deleteGamePhotos(gameCode) {
  if (!gameCode) return;
  try { await remove(dbRef(db, photosPath(gameCode))); } catch { /* ignore */ }
}
