import type { Settings } from '@hibi/domain';
import { db, setKV } from './db';
import { syncNow } from './sync';

export type LoginResult = { ok: true } | { ok: false; message: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, message: 'Pas de réseau : la connexion demande Internet.' };
  }
  if (res.status === 429) {
    const { retryAfterS } = (await res.json()) as { retryAfterS: number };
    return { ok: false, message: `Trop d'essais. Réessaie dans ${Math.ceil(retryAfterS / 60)} min.` };
  }
  if (!res.ok) return { ok: false, message: 'Identifiant ou mot de passe incorrect.' };
  await setKV('authed', true);
  await syncNow();
  return { ok: true };
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  await db.transaction('rw', db.entries, db.kv, async () => {
    await db.entries.clear();
    await db.kv.clear();
  });
}

export async function saveSettings(s: Settings): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    if (res.status === 401) {
      await setKV('authed', false);
      return { ok: false, message: 'Session expirée.' };
    }
    if (!res.ok) return { ok: false, message: 'Valeurs refusées par le serveur.' };
    await setKV('settings', (await res.json()) as Settings);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Hors ligne : les réglages demandent le réseau.' };
  }
}
