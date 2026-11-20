import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS, normalizeAvatar, type AvatarConfig, type Entry, type Settings } from '@hibi/domain';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bedtime_target TEXT NOT NULL DEFAULT '00:00',
  bedtime_tolerance_h REAL NOT NULL DEFAULT 2,
  sleep_target_h REAL NOT NULL DEFAULT 7.5,
  dev_target_min INTEGER NOT NULL DEFAULT 60,
  weights TEXT NOT NULL DEFAULT '{"bedtime":1,"sleep":1,"dev":2,"reading":1}'
) STRICT;

CREATE TABLE IF NOT EXISTS entries (
  day TEXT PRIMARY KEY,               -- 'YYYY-MM-DD'
  off INTEGER NOT NULL DEFAULT 0,
  bedtime TEXT,                       -- 'HH:MM'
  sleep_h REAL CHECK (sleep_h BETWEEN 0 AND 24),
  dev_min INTEGER CHECK (dev_min >= 0),
  reading INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT NOT NULL            -- ISO 8601 UTC (suffixe Z), horodaté côté client
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                -- SHA-256 du jeton ; le jeton brut ne vit que dans le cookie
  expires_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS avatar (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config TEXT NOT NULL,               -- JSON AvatarConfig
  updated_at TEXT NOT NULL            -- ISO 8601 UTC, horodaté côté client : le plus récent gagne
) STRICT;

-- Rappel du soir : un abonnement Web Push par appareil, une heure commune, un envoi par jour au plus.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS reminder (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time TEXT NOT NULL DEFAULT '22:00', -- 'HH:MM', heure de Paris
  last_sent_day TEXT                  -- 'YYYY-MM-DD' : jamais deux rappels le même jour
) STRICT;

-- Clés VAPID générées au premier démarrage : en base, elles suivent les sauvegardes (les changer désabonne tout le monde).
CREATE TABLE IF NOT EXISTS vapid (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO settings (id) VALUES (1);
INSERT OR IGNORE INTO reminder (id) VALUES (1);
`;

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface EntryRow {
  day: string;
  off: number;
  bedtime: string | null;
  sleep_h: number | null;
  dev_min: number | null;
  reading: number;
  note: string | null;
  updated_at: string;
}

interface SettingsRow {
  bedtime_target: string;
  bedtime_tolerance_h: number;
  sleep_target_h: number;
  dev_target_min: number;
  weights: string;
}

const toEntry = (r: EntryRow): Entry => ({
  day: r.day,
  off: r.off === 1,
  bedtime: r.bedtime,
  sleepH: r.sleep_h,
  devMin: r.dev_min,
  reading: r.reading === 1,
  note: r.note,
  updatedAt: r.updated_at,
});

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function createRepo(db: DB) {
  const upsert = db.prepare(`
    INSERT INTO entries (day, off, bedtime, sleep_h, dev_min, reading, note, updated_at)
    VALUES (@day, @off, @bedtime, @sleep_h, @dev_min, @reading, @note, @updated_at)
    ON CONFLICT (day) DO UPDATE SET
      off = excluded.off, bedtime = excluded.bedtime, sleep_h = excluded.sleep_h,
      dev_min = excluded.dev_min, reading = excluded.reading, note = excluded.note,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at > entries.updated_at`);
  const all = db.prepare<[], EntryRow>('SELECT * FROM entries ORDER BY day');
  const getSettingsStmt = db.prepare<[], SettingsRow>('SELECT * FROM settings WHERE id = 1');
  const putSettingsStmt = db.prepare(`
    UPDATE settings SET bedtime_target = @bedtime_target, bedtime_tolerance_h = @bedtime_tolerance_h,
      sleep_target_h = @sleep_target_h, dev_target_min = @dev_target_min, weights = @weights
    WHERE id = 1`);

  const getAvatarStmt = db.prepare<[], { config: string; updated_at: string }>('SELECT config, updated_at FROM avatar WHERE id = 1');
  const putAvatarStmt = db.prepare(`
    INSERT INTO avatar (id, config, updated_at) VALUES (1, @config, @updated_at)
    ON CONFLICT (id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
    WHERE excluded.updated_at > avatar.updated_at`);

  const getEntryStmt = db.prepare<[string], EntryRow>('SELECT * FROM entries WHERE day = ?');
  const listSubsStmt = db.prepare<[], { endpoint: string; p256dh: string; auth: string }>('SELECT endpoint, p256dh, auth FROM push_subscriptions');
  const putSubStmt = db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (@endpoint, @p256dh, @auth, @created_at)
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`);
  const deleteSubStmt = db.prepare<[string]>('DELETE FROM push_subscriptions WHERE endpoint = ?');
  const getReminderStmt = db.prepare<[], { time: string; last_sent_day: string | null }>('SELECT time, last_sent_day FROM reminder WHERE id = 1');
  const setReminderTimeStmt = db.prepare<[string]>('UPDATE reminder SET time = ? WHERE id = 1');
  const setReminderSentStmt = db.prepare<[string]>('UPDATE reminder SET last_sent_day = ? WHERE id = 1');
  const getVapidStmt = db.prepare<[], { public_key: string; private_key: string }>('SELECT public_key, private_key FROM vapid WHERE id = 1');
  const putVapidStmt = db.prepare<[string, string]>('INSERT OR IGNORE INTO vapid (id, public_key, private_key) VALUES (1, ?, ?)');

  const upsertMany = db.transaction((entries: readonly Entry[]) => {
    for (const e of entries) {
      upsert.run({
        day: e.day,
        off: e.off ? 1 : 0,
        bedtime: e.bedtime,
        sleep_h: e.sleepH,
        dev_min: e.devMin,
        reading: e.reading ? 1 : 0,
        note: e.note,
        updated_at: e.updatedAt,
      });
    }
  });

  return {
    /** Synchro : pour chaque jour, la saisie la plus récente gagne ; rejouer la file ne crée aucun doublon. */
    upsertEntries: (entries: readonly Entry[]) => upsertMany(entries),
    allEntries: (): Entry[] => all.all().map(toEntry),
    getSettings(): Settings {
      const r = getSettingsStmt.get();
      if (!r) return DEFAULT_SETTINGS;
      return {
        bedtimeTarget: r.bedtime_target,
        bedtimeToleranceH: r.bedtime_tolerance_h,
        sleepTargetH: r.sleep_target_h,
        devTargetMin: r.dev_target_min,
        weights: JSON.parse(r.weights) as Settings['weights'],
      };
    },
    /** null tant que l'avatar n'a jamais été personnalisé. */
    getAvatar(): { config: AvatarConfig; updatedAt: string } | null {
      const r = getAvatarStmt.get();
      if (!r) return null;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.config);
      } catch {
        /* config illisible : retombe sur l'avatar par défaut */
      }
      return { config: normalizeAvatar(parsed), updatedAt: r.updated_at };
    },
    /** La config la plus récente gagne, comme pour les saisies. */
    putAvatar(config: AvatarConfig, updatedAt: string) {
      putAvatarStmt.run({ config: JSON.stringify(config), updated_at: updatedAt });
    },
    getEntry(day: string): Entry | undefined {
      const r = getEntryStmt.get(day);
      return r ? toEntry(r) : undefined;
    },
    listSubscriptions: (): PushSubscriptionRecord[] =>
      listSubsStmt.all().map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } })),
    putSubscription(sub: PushSubscriptionRecord) {
      putSubStmt.run({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, created_at: new Date().toISOString() });
    },
    deleteSubscription: (endpoint: string) => void deleteSubStmt.run(endpoint),
    getReminder(): { time: string; lastSentDay: string | null } {
      const r = getReminderStmt.get();
      return { time: r?.time ?? '22:00', lastSentDay: r?.last_sent_day ?? null };
    },
    setReminderTime: (time: string) => void setReminderTimeStmt.run(time),
    setReminderSent: (day: string) => void setReminderSentStmt.run(day),
    /** Crée les clés au premier appel, puis renvoie toujours les mêmes. */
    vapidKeys(generate: () => { publicKey: string; privateKey: string }): { publicKey: string; privateKey: string } {
      const existing = getVapidStmt.get();
      if (existing) return { publicKey: existing.public_key, privateKey: existing.private_key };
      const k = generate();
      putVapidStmt.run(k.publicKey, k.privateKey);
      const saved = getVapidStmt.get()!;
      return { publicKey: saved.public_key, privateKey: saved.private_key };
    },
    putSettings(s: Settings) {
      putSettingsStmt.run({
        bedtime_target: s.bedtimeTarget,
        bedtime_tolerance_h: s.bedtimeToleranceH,
        sleep_target_h: s.sleepTargetH,
        dev_target_min: s.devTargetMin,
        weights: JSON.stringify(s.weights),
      });
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
