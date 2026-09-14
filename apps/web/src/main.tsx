import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app.js';
import './styles.css';
import './story-pages.css';
import './story-shell.css';
import './album-wall/corridor-scene.css';
import './album-wall/modern-themes.css';
import './album-wall/theme-atmosphere.css';
import './themes/kitty-worlds.css';
import './album-wall/compact-header.css';
import './themes/sacred-joy.css';
import './pwa/pwa.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .catch(() => { /* Online app remains usable without offline support. */ });
  }, { once: true });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
