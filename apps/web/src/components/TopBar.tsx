import { useSyncInfo } from '../hooks';

export function SyncBadge() {
  const { pending, status } = useSyncInfo();
  let text = 'Synchronisé';
  let tone = 'ok';
  if (status === 'syncing') [text, tone] = ['Synchro…', 'busy'];
  else if (pending > 0 && status === 'offline') [text, tone] = [`Hors ligne · ${pending} en attente`, 'warn'];
  else if (pending > 0) [text, tone] = [`${pending} en attente`, 'warn'];
  else if (status === 'offline') [text, tone] = ['Hors ligne', 'muted'];
  else if (status === 'error') [text, tone] = ['Erreur de synchro', 'warn'];
  return (
    <span className={`sync sync-${tone}`} role="status">
      {text}
    </span>
  );
}

export function TopBar({ title }: { title?: string }) {
  return (
    <nav className="topbar">
      {title ? (
        <a href="#/" className="back" aria-label="Retour à la saisie">
          ‹ {title}
        </a>
      ) : (
        <SyncBadge />
      )}
      <div className="topbar-links">
        <a href="#/historique" aria-label="Historique">
          30 j
        </a>
        <a href="#/reglages" aria-label="Réglages">
          Réglages
        </a>
      </div>
    </nav>
  );
}
