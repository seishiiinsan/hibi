import { blankEntry, type Entry, type Settings } from '@hibi/domain';
import { db, setKV, stripLocal } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastLocalEdit = 0;

/** Millisecondes depuis la dernière saisie faite sur cet appareil (pour ne célébrer que ses propres gestes). */
export const msSinceLocalEdit = () => Date.now() - lastLocalEdit;

/** Écrit la modification en local tout de suite (EF-03), puis planifie la synchro. */
export async function updateEntry(day: string, patch: Partial<Omit<Entry, 'day' | 'updatedAt'>>) {
  lastLocalEdit = Date.now();
  await db.transaction('rw', db.entries, async () => {
    const current = (await db.entries.get(day)) ?? { ...blankEntry(day), dirty: 1 as const };
    // Toujours en UTC suffixé Z : le serveur compare les updatedAt comme des chaînes.
    await db.entries.put({ ...current, ...patch, day, updatedAt: new Date().toISOString(), dirty: 1 });
  });
  scheduleSync();
}

export function scheduleSync(delayMs = 600) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

/**
 * Pousse les journées non synchronisées et récupère l'état du serveur, qui fait foi.
 * Un 401 garde la file intacte et renvoie vers l'écran de connexion (ENF-02).
 */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  await setKV('syncStatus', 'syncing');
  try {
    const dirty = await db.entries.where('dirty').equals(1).toArray();
    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: dirty.map(stripLocal) }),
    });
    if (res.status === 401) {
      await setKV('authed', false);
      await setKV('syncStatus', 'idle');
      return;
    }
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const { entries, settings } = (await res.json()) as { entries: Entry[]; settings: Settings };
    await db.transaction('rw', db.entries, db.kv, async () => {
      for (const remote of entries) {
        const local = await db.entries.get(remote.day);
        // Une saisie locale plus récente que la réponse (tapée pendant la requête) reste en file.
        if (!local || !local.dirty || remote.updatedAt >= local.updatedAt) {
          await db.entries.put({ ...remote, dirty: 0 });
        }
      }
      await setKV('settings', settings);
      await setKV('lastSyncAt', new Date().toISOString());
      await setKV('syncStatus', 'idle');
    });
  } catch (err) {
    await setKV('syncStatus', navigator.onLine && !(err instanceof TypeError) ? 'error' : 'offline');
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

/** Synchro au démarrage, au retour du réseau, au retour au premier plan, et toutes les 2 min. */
export function startBackgroundSync() {
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 120_000);
}
