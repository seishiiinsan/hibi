import { CalendarDays, Check, ChevronLeft, CloudOff, RefreshCw, Settings, Sprout, TriangleAlert } from 'lucide-react';
import { useNewUnlocks, useSyncInfo } from '../hooks';

export function SyncBadge() {
  const { pending, status } = useSyncInfo();
  let text = 'Synchronisé';
  let tone = 'ok';
  let Icon = Check;
  if (status === 'syncing') [text, tone, Icon] = ['Synchro…', 'busy', RefreshCw];
  else if (pending > 0 && status === 'offline') [text, tone, Icon] = [`Hors ligne, ${pending} en attente`, 'warn', CloudOff];
  else if (pending > 0) [text, tone, Icon] = [`${pending} en attente`, 'warn', RefreshCw];
  else if (status === 'offline') [text, tone, Icon] = ['Hors ligne', 'muted', CloudOff];
  else if (status === 'error') [text, tone, Icon] = ['Erreur de synchro', 'warn', TriangleAlert];
  return (
    <span className={`sync sync-${tone}`} role="status">
      <Icon size={12} aria-hidden="true" />
      <span className="sync-text">{text}</span>
    </span>
  );
}

export function NavButtons() {
  const fresh = useNewUnlocks().length;
  return (
    <div className="topbar-actions">
      <a href="#/historique" className="icon-btn" aria-label="Historique">
        <CalendarDays size={20} aria-hidden="true" />
      </a>
      <a href="#/avatar" className="icon-btn" aria-label={fresh ? `Mon avatar, ${fresh} nouveauté${fresh > 1 ? 's' : ''}` : 'Mon avatar'}>
        <Sprout size={20} aria-hidden="true" />
        {fresh > 0 && <span className="dot" aria-hidden="true" />}
      </a>
      <a href="#/reglages" className="icon-btn" aria-label="Réglages">
        <Settings size={20} aria-hidden="true" />
      </a>
    </div>
  );
}

export function TopBar({ title }: { title: string }) {
  return (
    <nav className="topbar">
      <a href="#/" className="back" aria-label={`Retour à la saisie depuis ${title}`}>
        <ChevronLeft size={24} aria-hidden="true" />
        {title}
      </a>
      <NavButtons />
    </nav>
  );
}
