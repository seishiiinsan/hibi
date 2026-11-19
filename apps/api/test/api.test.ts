import { hash } from '@node-rs/argon2';
import type { Entry } from '@hibi/domain';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createLoginGuard } from '../src/auth.js';
import { runBackup } from '../src/backup.js';
import { openDb } from '../src/db.js';

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hash('correct horse battery', { algorithm: 2 });
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function setup(opts: { now?: () => number; onLoginBlocked?: (ip: string) => void } = {}) {
  const db = openDb(':memory:');
  const app = await buildApp({
    db,
    adminUser: 'gabin',
    adminPasswordHash: passwordHash,
    secureCookie: true,
    loginGuard: createLoginGuard({ now: opts.now }),
    onLoginBlocked: opts.onLoginBlocked,
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
  });
});
