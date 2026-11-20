/** Rappel du soir : abonnement Web Push de cet appareil et réglages communs, côté client. */

export type PushSupport = 'ok' | 'unsupported' | 'install-first' | 'denied';

export interface PushInfo {
  publicKey: string;
  time: string;
  devices: number;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Sur iPhone, le push n'existe que dans l'app ajoutée à l'écran d'accueil (iOS 16.4+). */
export function pushSupport(): PushSupport {
  if (isIos() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchPushInfo = () => api<PushInfo>('GET', '/api/push');

/** L'abonnement de cet appareil, s'il existe. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Demande la permission (doit suivre un geste), abonne l'appareil et l'enregistre côté serveur. */
export async function enablePush(publicKey: string): Promise<'ok' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  await api('POST', '/api/push/subscribe', sub.toJSON());
  return 'ok';
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export const setReminderTime = (time: string) => api<{ time: string }>('PUT', '/api/push/time', { time });
export const sendTestPush = () => api<{ sent: number; removed: number }>('POST', '/api/push/test');
