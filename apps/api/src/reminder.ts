import { TIME_ZONE, hhmmToMinutes, type Entry } from '@hibi/domain';
import webpush from 'web-push';
import type { PushSubscriptionRecord, Repo } from './db.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Une notification par tag : un nouveau rappel remplace l'ancien au lieu de s'empiler. */
  tag: string;
  url: string;
}

/** Envoie un message à un appareil ; rejette avec `statusCode` 404/410 si l'abonnement n'existe plus. */
export type PushSender = (sub: PushSubscriptionRecord, message: PushMessage) => Promise<void>;

/** Heure de rappel acceptée : de 12:00 à 23:59, pour qu'elle porte toujours sur la journée en cours. */
export const REMINDER_TIME = /^(1[2-9]|2[0-3]):[0-5]\d$/;

/** Jour et minute de la journée à Paris. */
export function parisClock(now: Date): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Ce qui manque dans la journée ; vide si elle est complète ou Off (pas de rappel). */
export function missingFields(e: Entry | undefined): string[] {
  if (!e) return ['coucher', 'sommeil', 'dev', 'lecture'];
  if (e.off) return [];
  const missing: string[] = [];
  if (e.bedtime === null) missing.push('coucher');
  if (e.sleepH === null) missing.push('sommeil');
  if (e.devMin === null) missing.push('dev');
  if (!e.reading) missing.push('lecture');
  return missing;
}

export function reminderMessage(missing: string[]): PushMessage {
  const body =
    missing.length === 4
      ? "Ta journée n'est pas encore saisie : 15 secondes ?"
      : `Il manque ${missing.slice(0, -1).join(', ')}${missing.length > 1 ? ' et ' : ''}${missing[missing.length - 1]}.`;
  return { title: 'Hibi · ta journée', body, tag: 'hibi-reminder', url: '/' };
}

const isGone = (err: unknown) => {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return code === 404 || code === 410;
};

/** Envoie à tous les appareils ; retire ceux dont l'abonnement a expiré. */
export async function broadcast(repo: Repo, send: PushSender, message: PushMessage, log: (msg: string, err?: unknown) => void) {
  let sent = 0;
  let removed = 0;
  for (const sub of repo.listSubscriptions()) {
    try {
      await send(sub, message);
      sent++;
    } catch (err) {
      if (isGone(err)) {
        repo.deleteSubscription(sub.endpoint);
        removed++;
      } else log('notification non envoyée', err);
    }
  }
  return { sent, removed };
}

/**
 * Vérifie chaque minute : passé l'heure du rappel, une fois par jour, s'il manque quelque chose
 * dans la journée en cours. Envoyé aussi en retard (redémarrage du conteneur), jamais deux fois.
 */
export function createReminder(opts: { repo: Repo; send: PushSender; now?: () => Date; log: (msg: string, err?: unknown) => void }) {
  const now = opts.now ?? (() => new Date());
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const { repo } = opts;
      const { time, lastSentDay } = repo.getReminder();
      const { day, minutes } = parisClock(now());
      if (lastSentDay === day || minutes < hhmmToMinutes(time)) return;
      if (repo.listSubscriptions().length === 0) return;
      // Marqué avant l'envoi : un envoi lent ou en échec ne doit pas en déclencher un deuxième.
      repo.setReminderSent(day);
      const missing = missingFields(repo.getEntry(day));
      if (missing.length === 0) return;
      const { sent } = await broadcast(repo, opts.send, reminderMessage(missing), opts.log);
      opts.log(`rappel du ${day} envoyé à ${sent} appareil(s)`);
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start(intervalMs = 60_000) {
      const timer = setInterval(() => void tick().catch((err) => opts.log('rappel en échec', err)), intervalMs);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}

/** Expéditeur réel : chiffrement et signature VAPID par web-push. */
export function webPushSender(keys: { publicKey: string; privateKey: string }, subject: string): PushSender {
  return async (sub, message) => {
    await webpush.sendNotification(sub, JSON.stringify(message), {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 4 * 3600, // un rappel du soir n'a plus de sens le lendemain
      urgency: 'normal',
    });
  };
}

export const generateVapidKeys = () => webpush.generateVAPIDKeys();
