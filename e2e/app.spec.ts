import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Identifiant').fill('e2e');
  await page.getByLabel('Mot de passe').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('region', { name: 'Saisie' })).toBeVisible();
}

const syncBadge = (page: Page) => page.getByRole('status').first();

test('session du soir en 2 taps : dev « comme la veille » + lecture, puis synchro', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /^Dev : valider 1 h/ }).click(); // valeur proposée = objectif
  await page.getByRole('switch', { name: 'Lecture' }).click();
  await expect(page.getByTestId('day-score')).toHaveText('100 %');
  await expect(page.getByText('Journée parfaite !')).toBeVisible();
  // L'avatar suit le score du jour : journée à 100 % → il est content.
  await expect(page.locator('.companion .avatar-view')).toHaveClass(/mood-happy/);
  await expect(syncBadge(page)).toContainText('Synchronisé');
});

test('saisie en mode avion, app rechargée hors ligne, envoyée une seule fois au retour du réseau', async ({ page, context }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload(); // servie par le Service Worker
  await page.getByRole('button', { name: 'Hier' }).click();
  await page.getByRole('button', { name: 'Sommeil plus 0.5' }).click(); // 7,5 + 0,5
  await page.getByRole('button', { name: 'Coucher moins 15' }).click(); // 00:00 − 15 min
  await expect(syncBadge(page)).toContainText('en attente');

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(syncBadge(page)).toContainText('Synchronisé');

  const res = await page.request.post('/api/sync', { data: { entries: [] } });
  const { entries } = (await res.json()) as { entries: { day: string; sleepH: number; bedtime: string }[] };
  const matching = entries.filter((e) => e.sleepH === 8 && e.bedtime === '23:45');
  expect(matching).toHaveLength(1);
});

test('historique : une journée passée s’ouvre et se modifie', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Historique' }).click();
  const rows = page.locator('.history-row');
  await expect(rows).toHaveCount(30);
  await rows.nth(10).click();
  await page.getByRole('switch', { name: 'Off' }).click();
  await page.getByRole('link', { name: 'Historique' }).click();
  await expect(rows.nth(10)).toContainText('Off');
});

test('heatmap : un tap ouvre l’historique', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /^Activité des 18 dernières semaines/ }).click();
  await expect(page.locator('.history-row')).toHaveCount(30);
});

test('avatar : les objets se gagnent, les verrouillés disent quoi faire', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /^Mon avatar/ }).click();
  const tab = (name: string) => page.getByRole('tab', { name, exact: true }).click();
  // Gratuits dès le départ.
  await expect(page.getByRole('button', { name: 'Sauge' })).toBeEnabled();
  await tab('Tête');
  await expect(page.getByRole('button', { name: 'Pousse' })).toBeEnabled();
  // Une base presque vide : la cape (10 journées parfaites) et l'oiseau (14 bonnes journées d'affilée) restent à gagner.
  await tab('Dos');
  const cape = page.getByRole('button', { name: /^Cape/ });
  await expect(cape).toBeDisabled();
  await expect(cape).toHaveAccessibleName(/verrouillé : 10 journées parfaites/);
  await tab('Compagnon');
  await expect(page.getByRole('button', { name: /^Oiseau/ })).toBeDisabled();
});

test('avatar : combinaisons cohérentes, sauvegarde hors ligne, puis synchro', async ({ page, context }) => {
  await login(page);
  // 45 journées parfaites d'affilée (injectées par l'API, comme une longue série) : tout se débloque.
  // Ce test passe en dernier : il remplit l'historique de la base partagée par les autres.
  const entries = Array.from({ length: 45 }, (_, i) => ({
    day: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
    off: false, bedtime: '23:00', sleepH: 8, devMin: 60, reading: true, note: null, updatedAt: new Date().toISOString(),
  }));
  expect((await page.request.post('/api/sync', { data: { entries } })).status()).toBe(200);
  await page.reload();
  await page.getByRole('link', { name: /^Mon avatar/ }).click();
  const tab = (name: string) => page.getByRole('tab', { name, exact: true }).click();
  await tab('Dos');
  await expect(page.getByRole('button', { name: 'Cape' })).toBeEnabled();
  const stack = () => page.locator('.wardrobe-hero .avatar-layer').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.split('/').pop()));

  // Départ : corps sauge + pousse.
  await expect.poll(stack).toEqual(['body-sage.webp', 'head-pousse.webp']);

  // Un seul objet par emplacement : le bonnet remplace la pousse ; sur un corps lilas il passe en variante « alt ».
  await tab('Couleur');
  await page.getByRole('button', { name: 'Lilas' }).click();
  await tab('Tête');
  await page.getByRole('button', { name: 'Bonnet' }).click();
  await tab('Visage');
  await page.getByRole('button', { name: 'Lunettes de soleil' }).click();
  await tab('Cou');
  await page.getByRole('button', { name: 'Écharpe' }).click();
  await tab('Dos');
  await page.getByRole('button', { name: 'Cape' }).click();
  // Le tap écrit en local puis l'écran se met à jour : on attend l'état, on ne le lit pas au vol.
  await expect.poll(stack).toEqual(['back-cape.webp', 'body-lilac.webp', 'neck-echarpe.webp', 'head-bonnet-alt.webp', 'face-soleil.webp']);

  // Pet + accessoire ; retirer le pet retire l'accessoire.
  await tab('Compagnon');
  await page.getByRole('button', { name: 'Lapin' }).click();
  await page.getByRole('button', { name: 'Petit nœud' }).click();
  await expect.poll(stack).toEqual(['pet-lapin.webp', 'petacc-lapin-noeud.webp', 'back-cape.webp', 'body-lilac.webp', 'neck-echarpe.webp', 'head-bonnet-alt.webp', 'face-soleil.webp']);
  await page.getByRole('group', { name: 'Compagnon' }).getByRole('button', { name: 'Aucun' }).click();
  await expect.poll(async () => (await stack()).some((f) => f?.startsWith('pet'))).toBe(false);
  await expect(page.getByText('Accessoire', { exact: true })).toHaveCount(0);

  // Les 32 calques sont bien servis (aucun 404).
  for (const f of await stack()) expect((await page.request.get(`/avatar/${f}`)).status()).toBe(200);

  // Enregistré en local tout de suite (hors ligne), envoyé au retour du réseau.
  await context.setOffline(true);
  await tab('Couleur');
  await page.getByRole('button', { name: 'Pêche' }).click();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  // Pas de badge de synchro sur cet écran : on attend que le serveur ait reçu la config.
  await expect
    .poll(async () => ((await (await page.request.get('/api/avatar')).json()) as { config: { body: string; head: string } } | null)?.config)
    .toMatchObject({ body: 'peach', head: 'bonnet' });

  // Après rechargement l'avatar est identique.
  await page.reload();
  await expect.poll(stack).toContain('body-peach.webp');
});

test('accueil : tout tient dans l’écran, sans défilement', async ({ page }) => {
  await login(page);
  // Indépendant de l'état laissé par les autres tests : on mesure aujourd'hui puis hier, quelles que soient les saisies.
  const overflow = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Hier' }).click();
  await expect(page.getByRole('button', { name: 'Hier' })).toHaveAttribute('aria-pressed', 'true');
  expect(await overflow()).toBeLessThanOrEqual(0);
});
