import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildApp } from './app.js';
import { scheduleBackups } from './backup.js';
import { createRepo, openDb } from './db.js';
import { createReminder, generateVapidKeys, webPushSender } from './reminder.js';

const env = process.env;
const dataDir = env.DATA_DIR ?? '/data';
const hashFile = env.ADMIN_PASSWORD_HASH_FILE ?? '/run/secrets/admin_password_hash';
const adminUser = env.ADMIN_USER;
if (!adminUser) throw new Error('ADMIN_USER manquant');
const adminPasswordHash = readFileSync(hashFile, 'utf8').trim();
if (!adminPasswordHash.startsWith('$argon2id$')) throw new Error(`${hashFile} ne contient pas un hash argon2id`);

const db = openDb(join(dataDir, 'hibi.db'));
const alertUrl = env.ALERT_WEBHOOK_URL;

// Rappel du soir : clés VAPID créées au premier démarrage et gardées en base.
const repo = createRepo(db);
const vapid = repo.vapidKeys(generateVapidKeys);
// Apple refuse les sujets en localhost : une adresse ou une URL réelle, modifiable par PUSH_SUBJECT.
const sendPush = webPushSender(vapid, env.PUSH_SUBJECT || 'mailto:hibi@users.noreply.github.com');

const app = await buildApp({
  db,
  adminUser,
  adminPasswordHash,
  secureCookie: env.NODE_ENV === 'production',
  webDir: resolve(env.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname),
  logger: true,
  push: { publicKey: vapid.publicKey, send: sendPush },
  onLoginBlocked: (ip) => {
    if (!alertUrl) return;
    fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'login_blocked', ip, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => app.log.error({ err }, 'alerte de blocage non envoyée'));
  },
});

const stopBackups = scheduleBackups(db, join(dataDir, 'backups'), Number(env.BACKUP_KEEP ?? 14), (msg, err) =>
  err ? app.log.error({ err }, msg) : app.log.info(msg),
);

const stopReminder = createReminder({
  repo,
  send: sendPush,
  log: (msg, err) => (err ? app.log.error({ err }, msg) : app.log.info(msg)),
}).start();

const shutdown = async () => {
  stopBackups();
  stopReminder();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: env.HOST ?? '0.0.0.0', port: Number(env.PORT ?? 3000) });
