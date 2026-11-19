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
  await expect(page.locator('.score-lg')).toHaveText('100 %');
  await expect(syncBadge(page)).toHaveText('Synchronisé');
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
  await expect(syncBadge(page)).toHaveText('Synchronisé');

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
