import { DEFAULT_SETTINGS, type AvatarConfig, type Entry, type Settings } from '@hibi/domain';
import Dexie, { type EntityTable } from 'dexie';

/** dirty = 1 : modifiée hors ligne, pas encore confirmée par le serveur. */
export interface LocalEntry extends Entry {
  dirty: 0 | 1;
}

interface KV {
  key: string;
  value: unknown;
}

export const db = new Dexie('hibi') as Dexie & {
  entries: EntityTable<LocalEntry, 'day'>;
  kv: EntityTable<KV, 'key'>;
};

db.version(1).stores({
  entries: 'day, dirty',
  kv: 'key',
});

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  return ((await db.kv.get(key))?.value as T | undefined) ?? fallback;
}
export const setKV = (key: string, value: unknown) => db.kv.put({ key, value });

/** Avatar tel que stocké (local d'abord, le plus récent gagne à la synchro). */
export interface StoredAvatar {
  config: AvatarConfig;
  updatedAt: string; // ISO 8601 UTC
}

export const getSettings = () => getKV<Settings>('settings', DEFAULT_SETTINGS);

export const stripLocal = ({ dirty: _dirty, ...e }: LocalEntry): Entry => e;
