import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startBackgroundSync } from './sync';
import './styles.css';

// Demande un stockage persistant : limite la purge d'IndexedDB par le navigateur (risque Safari iOS).
void navigator.storage?.persist?.().catch(() => undefined);

startBackgroundSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
