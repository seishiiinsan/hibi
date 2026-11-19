import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.js';

/**
 * ENF-08 : copie quotidienne de la base, gardée `keep` jours.
 * better-sqlite3 utilise l'API de backup en ligne de SQLite, la même que `sqlite3 .backup` :
 * pas besoin du binaire sqlite3 dans une image read_only.
 */
export async function runBackup(db: DB, dir: string, keep: number, now = new Date()): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `hibi-${now.toISOString().slice(0, 10)}.db`);
  await db.backup(file);
  const backups = readdirSync(dir)
    .filter((f) => /^hibi-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) rmSync(join(dir, old));
  return file;
}

/** Lance une copie au démarrage puis toutes les 24 h. */
export function scheduleBackups(db: DB, dir: string, keep: number, log: (msg: string, err?: unknown) => void) {
  const run = () =>
    runBackup(db, dir, keep).then(
      (f) => log(`sauvegarde écrite : ${f}`),
      (err) => log('sauvegarde en échec', err),
    );
  void run();
  const timer = setInterval(run, 24 * 3600_000);
  timer.unref();
  return () => clearInterval(timer);
}
