import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { verify as argonVerify } from '@node-rs/argon2';
import { entriesToCsv, validateEntry, validateSettings, type Entry, type Settings } from '@hibi/domain';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { SESSION_DAYS, createLoginGuard, createSessionStore, type LoginGuard } from './auth.js';
import { createRepo, type DB } from './db.js';

export interface AppOptions {
  db: DB;
  adminUser: string;
  adminPasswordHash: string;
  secureCookie: boolean;
  webDir?: string;
  loginGuard?: LoginGuard;
  /** Appelé quand une IP est bloquée (alerte mail via n8n, par ex.). */
  onLoginBlocked?: (ip: string) => void;
  logger?: boolean;
}

const COOKIE = 'sid';

const nullable = (type: string) => ({ type: [type, 'null'] });
const entrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['day', 'off', 'bedtime', 'sleepH', 'devMin', 'reading', 'note', 'updatedAt'],
  properties: {
    day: { type: 'string' },
    off: { type: 'boolean' },
    bedtime: nullable('string'),
    sleepH: nullable('number'),
    devMin: nullable('integer'),
    reading: { type: 'boolean' },
    note: nullable('string'),
    updatedAt: { type: 'string' },
  },
} as const;

const settingsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['bedtimeTarget', 'bedtimeToleranceH', 'sleepTargetH', 'devTargetMin', 'weights'],
  properties: {
    bedtimeTarget: { type: 'string' },
    bedtimeToleranceH: { type: 'number' },
    sleepTargetH: { type: 'number' },
    devTargetMin: { type: 'integer' },
    weights: {
      type: 'object',
      additionalProperties: false,
      required: ['bedtime', 'sleep', 'dev', 'reading'],
      properties: {
        bedtime: { type: 'number' },
        sleep: { type: 'number' },
        dev: { type: 'number' },
        reading: { type: 'number' },
      },
    },
  },
} as const;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  // trustProxy : derrière Caddy, request.ip doit être la vraie IP du client (blocage par IP, ENF-04).
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 1024 * 1024 });
  const repo = createRepo(opts.db);
  const sessions = createSessionStore(opts.db);
  const guard = opts.loginGuard ?? createLoginGuard();

  await app.register(fastifyCookie);

  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: opts.secureCookie,
      sameSite: 'strict',
      maxAge: SESSION_DAYS * 86_400,
    });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // Toute route /api hors /api/login exige une session ; manifest, Service Worker et fichiers statiques restent publics.
  const requireSession = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[COOKIE];
    const { valid, refreshed } = sessions.verify(token);
    if (!valid) return reply.code(401).send({ error: 'unauthorized' });
    if (refreshed && token) setSessionCookie(reply, token);
  };

  app.post<{ Body: { username: string; password: string } }>(
    '/api/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: { username: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (req, reply) => {
      const ip = req.ip;
      const blocked = guard.blockedFor(ip);
      if (blocked > 0) {
        reply.header('Retry-After', Math.ceil(blocked / 1000));
        return reply.code(429).send({ error: 'too_many_attempts', retryAfterS: Math.ceil(blocked / 1000) });
      }
      const { username, password } = req.body;
      // argon2 vérifié même si l'identifiant est faux : pas d'énumération par le temps de réponse.
      const passwordOk = await argonVerify(opts.adminPasswordHash, password).catch(() => false);
      if (!(safeEqual(username, opts.adminUser) && passwordOk)) {
        if (guard.fail(ip)) {
          req.log.warn({ ip }, 'login bloqué pour 15 min');
          opts.onLoginBlocked?.(ip);
        }
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      guard.succeed(ip);
      setSessionCookie(reply, sessions.create());
      return { ok: true };
    },
  );

  // Healthcheck Docker : public, sans log (sinon ~2 900 lignes par jour dans les logs).
  app.get('/healthz', { logLevel: 'silent' }, async () => ({ ok: true }));

  await app.register(async (api) => {
    api.addHook('onRequest', requireSession);

    api.get('/api/me', async () => ({ ok: true }));

    api.post('/api/logout', async (req, reply) => {
      sessions.destroy(req.cookies[COOKIE]);
      reply.clearCookie(COOKIE, { path: '/' });
      return { ok: true };
    });

    /** Pousse la file hors ligne, renvoie l'état complet (≈ 365 lignes par an : pas besoin de delta). */
    api.post<{ Body: { entries: Entry[] } }>(
      '/api/sync',
      {
        schema: {
          body: {
            type: 'object',
            required: ['entries'],
            additionalProperties: false,
            properties: { entries: { type: 'array', maxItems: 2000, items: entrySchema } },
          },
        },
      },
      async (req, reply) => {
        const invalid = req.body.entries
          .map((e) => ({ day: e.day, errors: validateEntry(e) }))
          .filter((r) => r.errors.length > 0);
        if (invalid.length) return reply.code(400).send({ error: 'invalid_entries', invalid });
        repo.upsertEntries(req.body.entries);
        return { entries: repo.allEntries(), settings: repo.getSettings() };
      },
    );

    api.get('/api/settings', async () => repo.getSettings());

    api.put<{ Body: Settings }>('/api/settings', { schema: { body: settingsSchema } }, async (req, reply) => {
      const errors = validateSettings(req.body);
      if (errors.length) return reply.code(400).send({ error: 'invalid_settings', fields: errors });
      repo.putSettings(req.body);
      return repo.getSettings();
    });

    api.get('/api/export.csv', async (_req, reply) => {
      const csv = entriesToCsv(repo.allEntries(), repo.getSettings());
      const stamp = new Date().toISOString().slice(0, 10);
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="hibi-${stamp}.csv"`);
      return '﻿' + csv; // BOM : accents corrects à l'ouverture dans Excel
    });
  });

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: opts.webDir,
      wildcard: false,
      setHeaders(res, path) {
        const noCache = /(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/.test(path);
        res.header('Cache-Control', noCache ? 'no-cache' : 'public, max-age=31536000, immutable');
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // Même une route API inconnue répond 401 sans session : rien n'est révélé de la surface de l'API.
    if (req.url.startsWith('/api/') && !sessions.verify(req.cookies[COOKIE]).valid) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    // Fallback SPA réservé aux navigations : un asset absent répond 404, pas index.html en 200.
    const path = req.url.split('?')[0] ?? '';
    if (req.url.startsWith('/api/') || !opts.webDir || req.method !== 'GET' || /\.[a-z0-9]+$/i.test(path)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}
