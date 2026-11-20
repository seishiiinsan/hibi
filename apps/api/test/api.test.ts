import { hash } from '@node-rs/argon2';
import { DEFAULT_AVATAR, allLayerFiles, type AvatarConfig, type Entry } from '@hibi/domain';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createLoginGuard } from '../src/auth.js';
import { runBackup } from '../src/backup.js';
import { createRepo, openDb, type PushSubscriptionRecord } from '../src/db.js';
import { createReminder, missingFields, reminderMessage, type PushMessage } from '../src/reminder.js';

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hash('correct horse battery', { algorithm: 2 });
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function setup(opts: { now?: () => number; onLoginBlocked?: (ip: string) => void; sent?: PushMessage[] } = {}) {
  const db = openDb(':memory:');
  const app = await buildApp({
    db,
    adminUser: 'gabin',
    adminPasswordHash: passwordHash,
    secureCookie: true,
    loginGuard: createLoginGuard({ now: opts.now }),
    onLoginBlocked: opts.onLoginBlocked,
    push: { publicKey: 'BPUBLIC', send: async (_sub, m) => void opts.sent?.push(m) },
  });
  apps.push(app);
  return { app, db };
}

const login = (app: Awaited<ReturnType<typeof buildApp>>, password = 'correct horse battery', ip = '203.0.113.7') =>
  app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'gabin', password },
    headers: { 'x-forwarded-for': ip },
  });

async function session(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await login(app);
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'sid')!;
  return { cookie: `sid=${cookie.value}` };
}

const entry = (day: string, updatedAt: string, patch: Partial<Entry> = {}): Entry => ({
  day,
  off: false,
  bedtime: null,
  sleepH: null,
  devMin: null,
  reading: false,
  note: null,
  updatedAt,
  ...patch,
});

describe('auth', () => {
  it('pose un cookie HttpOnly, Secure, SameSite=Strict de 30 jours', async () => {
    const { app } = await setup();
    const res = await login(app);
    const c = res.cookies.find((x) => x.name === 'sid')!;
    expect(c.httpOnly).toBe(true);
    expect(c.secure).toBe(true);
    expect(c.sameSite).toBe('Strict');
    expect(c.maxAge).toBe(30 * 86400);
  });

  it('bloque une IP 15 min au 6e essai après 5 mots de passe faux, sans toucher les autres IP', async () => {
    let t = 1_000_000;
    const blocked: string[] = [];
    const { app } = await setup({ now: () => t, onLoginBlocked: (ip) => blocked.push(ip) });
    for (let i = 0; i < 5; i++) expect((await login(app, 'faux')).statusCode).toBe(401);
    expect(blocked).toEqual(['203.0.113.7']);
    expect((await login(app)).statusCode).toBe(429); // même le bon mot de passe
    expect((await login(app, 'correct horse battery', '198.51.100.1')).statusCode).toBe(200);
    t += 15 * 60_000;
    expect((await login(app)).statusCode).toBe(200);
  });

  it('répond 401 sur toute route API sans session', async () => {
    const { app } = await setup();
    for (const [method, url] of [
      ['GET', '/api/me'],
      ['POST', '/api/sync'],
      ['GET', '/api/settings'],
      ['PUT', '/api/settings'],
      ['GET', '/api/avatar'],
      ['GET', '/api/export.csv'],
      ['POST', '/api/logout'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('invalide la session à la déconnexion', async () => {
    const { app } = await setup();
    const headers = await session(app);
    expect((await app.inject({ method: 'POST', url: '/api/logout', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode).toBe(401);
  });

  it('stocke le SHA-256 du jeton, jamais le jeton brut', async () => {
    const { app, db } = await setup();
    const { cookie } = await session(app);
    const ids = db.prepare('SELECT id FROM sessions').all() as { id: string }[];
    expect(ids).toHaveLength(1);
    expect(cookie).not.toContain(ids[0]!.id);
    expect(ids[0]!.id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('synchro', () => {
  it('rejouer la file ne crée aucun doublon, et la saisie la plus récente gagne', async () => {
    const { app } = await setup();
    const headers = await session(app);
    const sync = (entries: Entry[]) => app.inject({ method: 'POST', url: '/api/sync', headers, payload: { entries } });

    const v1 = entry('2026-12-01', '2026-12-01T20:00:00.000Z', { devMin: 30 });
    const v2 = entry('2026-12-01', '2026-12-01T21:00:00.000Z', { devMin: 60 });
    await sync([v1]);
    await sync([v1, v2]);
    const res = await sync([v1]); // vieille version rejouée : ignorée
    const body = res.json() as { entries: Entry[] };
    expect(body.entries).toEqual([v2]);
  });

  it('refuse un updatedAt sans suffixe Z', async () => {
    const { app } = await setup();
    const headers = await session(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers,
      payload: { entries: [entry('2026-12-01', '2026-12-01T21:00:00+01:00')] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('réglages et export', () => {
  it('valide et enregistre les réglages', async () => {
    const { app } = await setup();
    const headers = await session(app);
    const s = { bedtimeTarget: '23:30', bedtimeToleranceH: 1.5, sleepTargetH: 8, devTargetMin: 45, weights: { bedtime: 1, sleep: 1, dev: 1, reading: 1 } };
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: s })).json()).toEqual(s);
    const bad = { ...s, weights: { bedtime: 0, sleep: 0, dev: 0, reading: 0 } };
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: bad })).statusCode).toBe(400);
  });

  it('exporte toutes les journées en CSV avec le score', async () => {
    const { app } = await setup();
    const headers = await session(app);
    await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers,
      payload: { entries: [entry('2026-12-01', '2026-12-01T20:00:00.000Z', { devMin: 54 })] },
    });
    const res = await app.inject({ method: 'GET', url: '/api/export.csv', headers });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('2026-12-01,0,,,54,0,60,,2026-12-01T20:00:00.000Z');
  });
});

describe('sauvegardes', () => {
  it('écrit une copie restaurable et garde les 14 dernières', async () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO entries (day, updated_at) VALUES ('2026-12-01', '2026-12-01T20:00:00.000Z')").run();
    const dir = mkdtempSync(join(tmpdir(), 'hibi-bak-'));
    let last = '';
    for (let i = 0; i < 16; i++) last = await runBackup(db, dir, 14, new Date(Date.UTC(2026, 11, 1 + i)));
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(14);
    expect(files[0]).toBe('hibi-2026-12-03.db');
    const restored = openDb(last);
    expect(restored.prepare('SELECT day FROM entries').all()).toEqual([{ day: '2026-12-01' }]);
  });
});

describe('fichiers statiques', () => {
  it('sert index.html pour une navigation, 404 pour un asset absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hibi-web-'));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Hibi</title>');
    const app = await buildApp({ db: openDb(':memory:'), adminUser: 'gabin', adminPasswordHash: passwordHash, secureCookie: true, webDir: dir });
    apps.push(app);
    const nav = await app.inject({ method: 'GET', url: '/historique' });
    expect(nav.statusCode).toBe(200);
    expect(nav.headers['content-type']).toContain('text/html');
    expect((await app.inject({ method: 'GET', url: '/assets/old-123.js' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/nope' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ ok: true });
  });
});

describe('avatar', () => {
  const T1 = '2026-12-01T20:00:00.000Z';
  const T2 = '2026-12-01T21:00:00.000Z';
  const cfg = (patch: Partial<AvatarConfig>): AvatarConfig => ({ ...DEFAULT_AVATAR, ...patch });

  it('part vide, puis la config la plus récente gagne et revient dans la synchro', async () => {
    const { app } = await setup();
    const headers = await session(app);
    const sync = (avatar?: { config: AvatarConfig; updatedAt: string }) =>
      app.inject({ method: 'POST', url: '/api/sync', headers, payload: { entries: [], avatar } });

    expect(((await sync()).json() as { avatar: unknown }).avatar).toBeNull();
    const recent = { config: cfg({ body: 'lilac', head: 'bonnet', pet: 'lapin', petAccessory: 'noeud' }), updatedAt: T2 };
    await sync(recent);
    const stale = await sync({ config: cfg({ body: 'peach' }), updatedAt: T1 }); // vieille version rejouée : ignorée
    expect((stale.json() as { avatar: unknown }).avatar).toEqual(recent);
    expect((await app.inject({ method: 'GET', url: '/api/avatar', headers })).json()).toEqual(recent);
  });

  it('refuse une config hors catalogue, un objet dans le mauvais emplacement ou un accessoire sans pet', async () => {
    const { app } = await setup();
    const headers = await session(app);
    for (const config of [cfg({ body: 'rouge' as never }), cfg({ head: 'echarpe' }), cfg({ petAccessory: 'noeud' })]) {
      const res = await app.inject({ method: 'POST', url: '/api/sync', headers, payload: { entries: [], avatar: { config, updatedAt: T1 } } });
      expect(res.statusCode).toBe(400);
    }
  });

  it('chaque calque du catalogue a son rendu dans apps/web/public/avatar', () => {
    const dir = join(import.meta.dirname, '..', '..', 'web', 'public', 'avatar');
    const missing = allLayerFiles().filter((f) => !existsSync(join(dir, `${f}.webp`)));
    expect(missing).toEqual([]);
  });
});

describe('rappel du soir', () => {
  const sub = (n: number): PushSubscriptionRecord => ({
    endpoint: `https://push.example/${n}`,
    keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(16) },
  });

  it('abonne un appareil, règle l’heure (12:00–23:59 seulement) et envoie un test', async () => {
    const sent: PushMessage[] = [];
    const { app } = await setup({ sent });
    const headers = await session(app);
    expect((await app.inject({ method: 'GET', url: '/api/push' })).statusCode).toBe(401);

    const sub1 = await app.inject({ method: 'POST', url: '/api/push/subscribe', headers, payload: sub(1) });
    expect(sub1.json()).toEqual({ devices: 1 });
    expect((await app.inject({ method: 'POST', url: '/api/push/subscribe', headers, payload: sub(1) })).json()).toEqual({ devices: 1 });
    expect(
      (await app.inject({ method: 'POST', url: '/api/push/subscribe', headers, payload: { ...sub(2), endpoint: 'http://evil' } })).statusCode,
    ).toBe(400);

    expect((await app.inject({ method: 'PUT', url: '/api/push/time', headers, payload: { time: '21:30' } })).json()).toEqual({ time: '21:30' });
    expect((await app.inject({ method: 'PUT', url: '/api/push/time', headers, payload: { time: '08:00' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/push', headers })).json()).toEqual({ publicKey: 'BPUBLIC', time: '21:30', devices: 1 });

    expect((await app.inject({ method: 'POST', url: '/api/push/test', headers })).json()).toEqual({ sent: 1, removed: 0 });
    expect(sent).toHaveLength(1);

    expect((await app.inject({ method: 'POST', url: '/api/push/unsubscribe', headers, payload: { endpoint: sub(1).endpoint } })).json()).toEqual({
      devices: 0,
    });
  });

  it('une fois par jour, après l’heure, seulement s’il manque quelque chose ; retire les abonnements expirés', async () => {
    const db = openDb(':memory:');
    const repo = createRepo(db);
    repo.putSubscription(sub(1));
    repo.putSubscription(sub(2));
    const sent: { endpoint: string; m: PushMessage }[] = [];
    let now = new Date('2026-11-20T20:59:00Z'); // 21:59 à Paris
    const reminder = createReminder({
      repo,
      now: () => now,
      log: () => undefined,
      send: async (s, m) => {
        if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        sent.push({ endpoint: s.endpoint, m });
      },
    });

    await reminder.tick();
    expect(sent).toHaveLength(0); // avant 22:00

    repo.upsertEntries([entry('2026-11-20', '2026-11-20T08:00:00.000Z', { bedtime: '23:30', sleepH: 8 })]);
    now = new Date('2026-11-20T21:05:00Z'); // 22:05
    await reminder.tick();
    expect(sent.map((x) => x.m.body)).toEqual(['Il manque dev et lecture.']);
    expect(repo.listSubscriptions().map((x) => x.endpoint)).toEqual(['https://push.example/1']); // 410 retiré

    await reminder.tick();
    expect(sent).toHaveLength(1); // pas deux fois le même jour

    // Le lendemain, journée Off : pas de rappel.
    repo.upsertEntries([entry('2026-11-21', '2026-11-21T08:00:00.000Z', { off: true })]);
    now = new Date('2026-11-21T21:30:00Z');
    await reminder.tick();
    expect(sent).toHaveLength(1);
  });

  it('formule ce qui manque', () => {
    expect(missingFields(undefined)).toHaveLength(4);
    expect(reminderMessage(missingFields(undefined)).body).toBe("Ta journée n'est pas encore saisie : 15 secondes ?");
    expect(reminderMessage(['lecture']).body).toBe('Il manque lecture.');
    expect(reminderMessage(['coucher', 'dev', 'lecture']).body).toBe('Il manque coucher, dev et lecture.');
  });
});
