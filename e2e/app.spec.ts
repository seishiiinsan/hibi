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

test('avatar : combinaisons cohérentes, sauvegarde hors ligne, puis synchro', async ({ page, context }) => {
  await login(page);
  await page.getByRole('link', { name: 'Mon avatar' }).click();
  const stack = () => page.locator('.avatar-layer').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.split('/').pop()));

  // Départ : corps sauge + pousse.
  expect(await stack()).toEqual(['body-sage.webp', 'head-pousse.webp']);

  // Un seul objet par emplacement : le bonnet remplace la pousse ; sur un corps lilas il passe en variante « alt ».
  await page.getByRole('button', { name: 'Lilas' }).click();
  await page.getByRole('button', { name: 'Bonnet' }).click();
  await page.getByRole('button', { name: 'Lunettes de soleil' }).click();
  await page.getByRole('button', { name: 'Écharpe' }).click();
  await page.getByRole('button', { name: 'Cape' }).click();
  expect(await stack()).toEqual(['back-cape.webp', 'body-lilac.webp', 'neck-echarpe.webp', 'head-bonnet-alt.webp', 'face-soleil.webp']);

  // Pet + accessoire ; retirer le pet retire l'accessoire.
  await page.getByRole('button', { name: 'Lapin' }).click();
  await page.getByRole('button', { name: 'Petit nœud' }).click();
  expect((await stack())[0]).toBe('pet-lapin.webp');
  expect(await stack()).toContain('petacc-lapin-noeud.webp');
  await page.getByRole('group', { name: 'Compagnon' }).getByRole('button', { name: 'Aucun' }).click();
  expect((await stack()).some((f) => f?.startsWith('pet'))).toBe(false);
  await expect(page.getByText('Accessoire', { exact: true })).toHaveCount(0);

  // Les 32 calques sont bien servis (aucun 404).
  for (const f of await stack()) expect((await page.request.get(`/avatar/${f}`)).status()).toBe(200);

  // Enregistré en local tout de suite (hors ligne), envoyé au retour du réseau.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Pêche' }).click();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(syncBadge(page)).toContainText('Synchronisé');
  const res = await page.request.get('/api/avatar');
  const { config } = (await res.json()) as { config: { body: string; head: string } };
  expect(config).toMatchObject({ body: 'peach', head: 'bonnet' });

  // Après rechargement l'avatar est identique.
  await page.reload();
  expect(await stack()).toContain('body-peach.webp');
});
