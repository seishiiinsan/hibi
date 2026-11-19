import { DEFAULT_SETTINGS, indexEntries, type Settings } from '@hibi/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from './db';
import type { SyncStatus } from './sync';

export function useEntries() {
  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const index = useMemo(() => indexEntries(entries ?? []), [entries]);
  return { entries, index, loading: entries === undefined };
}

export function useKV<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(async () => ((await db.kv.get(key))?.value as T | undefined) ?? fallback, [key]);
}

export const useSettings = (): Settings => useKV<Settings>('settings', DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS;

export function useSyncInfo() {
  const pending = useLiveQuery(() => db.entries.where('dirty').equals(1).count(), []) ?? 0;
  const status = useKV<SyncStatus>('syncStatus', 'idle') ?? 'idle';
  return { pending, status };
}

/** Horloge qui se met à jour chaque minute et au retour au premier plan (bascule de la journée à 4 h). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}
