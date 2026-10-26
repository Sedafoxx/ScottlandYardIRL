import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

let authReadyPromise = null;

/**
 * Every device signs in anonymously. The database and storage rules require an
 * authenticated user, so the database is no longer open to anyone who finds the
 * URL — plus the game code still scopes which game you can reach.
 *
 * Firebase prunes anonymous accounts after 30 days of inactivity; that is
 * harmless here because no data belongs to a uid (games are addressed by code).
 */
export function ensureAuth() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (!user) return; // first callback can be null while restoring
          unsubscribe();
          resolve(user);
        },
        (err) => { unsubscribe(); reject(err); }
      );
      signInAnonymously(auth).catch((err) => { unsubscribe(); reject(err); });
    });
  }
  return authReadyPromise;
}
