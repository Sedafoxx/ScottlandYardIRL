import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.jsx';
import { ensureAuth } from './firebase/config';

// Authenticate the device before mounting: every database/storage rule requires
// an authenticated user, so the first listeners must not race the sign-in.
ensureAuth()
  .catch((err) => {
    console.error('Anonymous sign-in failed — the game cannot sync.', err);
  })
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
