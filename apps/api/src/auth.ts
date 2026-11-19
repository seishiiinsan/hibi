import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './db.js';

export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Sessions longues et glissantes : 30 jours après la dernière requête authentifiée. */
export function createSessionStore(db: DB, now: () => number = Date.now) {
  const insert = db.prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)');
  const get = db.prepare<[string], { expires_at: string }>('SELECT expires_at FROM sessions WHERE id = ?');
  const touch = db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?');
  const del = db.prepare('DELETE FROM sessions WHERE id = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  const expiry = () => new Date(now() + SESSION_DAYS * DAY_MS).toISOString();

  return {
    create(): string {
      purge.run(new Date(now()).toISOString());
      const token = randomBytes(32).toString('base64url');
      insert.run(sha256(token), expiry());
      return token;
    },
    /** Valide le jeton ; renvoie refreshed=true quand l'échéance a été repoussée (au plus une écriture par jour). */
    verify(token: string | undefined): { valid: boolean; refreshed: boolean } {
      if (!token) return { valid: false, refreshed: false };
      const id = sha256(token);
      const row = get.get(id);
      if (!row) return { valid: false, refreshed: false };
      const exp = Date.parse(row.expires_at);
      if (exp <= now()) {
        del.run(id);
        return { valid: false, refreshed: false };
      }
      if (exp - now() < (SESSION_DAYS - 1) * DAY_MS) {
        touch.run(expiry(), id);
        return { valid: true, refreshed: true };
      }
      return { valid: true, refreshed: false };
    },
    destroy(token: string | undefined) {
      if (token) del.run(sha256(token));
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/**
 * ENF-04 : 5 essais ratés par IP, puis blocage de cette IP pendant 15 min.
 * Compteur en mémoire : suffisant pour un seul process ; un redémarrage remet les compteurs à zéro.
 */
export function createLoginGuard(opts: { maxFailures?: number; blockMs?: number; now?: () => number } = {}) {
  const maxFailures = opts.maxFailures ?? 5;
  const blockMs = opts.blockMs ?? 15 * 60_000;
  const now = opts.now ?? Date.now;
  const state = new Map<string, { failures: number; last: number; blockedUntil: number }>();

  const current = (ip: string) => {
    const s = state.get(ip);
    if (!s) return undefined;
    // Les échecs « oubliés » après 15 min sans essai, et le blocage levé à son échéance.
    if (s.blockedUntil ? s.blockedUntil <= now() : now() - s.last > blockMs) {
      state.delete(ip);
      return undefined;
    }
    return s;
  };

  return {
    /** Millisecondes de blocage restantes (0 si l'IP peut essayer). */
    blockedFor(ip: string): number {
      const s = current(ip);
      return s && s.blockedUntil ? s.blockedUntil - now() : 0;
    },
    /** Enregistre un échec ; renvoie true si cet échec déclenche le blocage. */
    fail(ip: string): boolean {
      const s = current(ip) ?? { failures: 0, last: 0, blockedUntil: 0 };
      s.failures++;
      s.last = now();
      if (s.failures >= maxFailures) s.blockedUntil = now() + blockMs;
      state.set(ip, s);
      return s.blockedUntil > 0;
    },
    succeed(ip: string) {
      state.delete(ip);
    },
  };
}

export type LoginGuard = ReturnType<typeof createLoginGuard>;
