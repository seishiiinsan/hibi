import {
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  indexEntries,
  mergeUnlocked,
  normalizeAvatar,
  progressFromEntries,
  unlockedKeys,
  type AvatarConfig,
  type Progress,
  type Settings,
  type UnlockKey,
} from '@hibi/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db, setKV, type StoredAvatar } from './db';
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

/** Avatar de l'utilisateur, toujours cohérent (normalisé), même hors ligne ou avant la première synchro. */
export function useAvatar(): AvatarConfig {
  const stored = useKV<StoredAvatar | null>('avatar', null);
  return useMemo(() => (stored ? normalizeAvatar(stored.config) : DEFAULT_AVATAR), [stored]);
}

/** Progression (journées saisies, parfaites, meilleure série) calculée depuis l'historique. */
export function useProgress(): Progress {
  const { entries } = useEntries();
  const settings = useSettings();
  return useMemo(() => progressFromEntries(entries ?? [], settings), [entries, settings]);
}

/** Ce qui est débloqué : ce que l'historique permet, plus ce qui était déjà acquis (définitif). */
export function useUnlocked(): ReadonlySet<UnlockKey> {
  const progress = useProgress();
  const stored = useKV<UnlockKey[]>('unlocked', []);
  return useMemo(() => mergeUnlocked(stored, unlockedKeys(progress)), [progress, stored]);
}

/** Déblocages pas encore vus sur l'écran avatar. */
export function useNewUnlocks(): UnlockKey[] {
  const unlocked = useUnlocked();
  const seen = useKV<UnlockKey[] | null>('unlockedSeen', null);
  return useMemo(() => (seen ? [...unlocked].filter((k) => !seen.includes(k)) : []), [unlocked, seen]);
}

/**
 * À monter une fois : garde les déblocages définitifs en local. Le « déjà vu » démarre à l'état acquis après la
 * première synchro, pour ne pas fêter tout l'historique d'un coup sur un nouvel appareil.
 */
export function usePersistUnlocks() {
  const unlocked = useUnlocked();
  const stored = useKV<UnlockKey[]>('unlocked', []);
  const seen = useKV<UnlockKey[] | null>('unlockedSeen', null);
  const synced = useKV<string | null>('lastSyncAt', null);
  useEffect(() => {
    if (stored === undefined || seen === undefined || !synced) return;
    if (unlocked.size > stored.length) void setKV('unlocked', [...unlocked]);
    if (seen === null) void setKV('unlockedSeen', [...unlocked]);
  }, [unlocked, stored, seen, synced]);
}

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
