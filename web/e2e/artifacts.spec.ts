import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('counts the artifacts and turns a card over to its link', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  await expect(shelf).toContainText('3 av 3');

  const front = shelf.getByRole('button', { name: /^Veloq OS .*Vänd kortet/ });
  await expect(front).toHaveAttribute('aria-expanded', 'false');
  await front.click();
  await expect(front).toHaveAttribute('aria-expanded', 'true');

  const open = shelf.locator('[data-id="a1"]').getByRole('link', { name: 'Öppna' });
  await expect(open).toHaveAttribute('href', 'https://claude.ai/artifact/a1');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');

  await shelf.getByRole('button', { name: 'Vänd tillbaka' }).first().click();
  await expect(front).toHaveAttribute('aria-expanded', 'false');
});

test('only one card is turned at a time', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  await shelf.getByRole('button', { name: /^Veloq OS .*Vänd/ }).click();
  await shelf.getByRole('button', { name: /^Yagi Sports logo .*Vänd/ }).click();
  await expect(shelf.getByRole('button', { name: /^Veloq OS .*Vänd/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(shelf.getByRole('button', { name: /^Yagi Sports logo .*Vänd/ })).toHaveAttribute('aria-expanded', 'true');
});

test('filters by group', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  await shelf.getByRole('group', { name: 'Filtrera artefakter' }).getByRole('button', { name: 'Jobb' }).click();
  await expect(shelf).toContainText('1 av 3');
  await expect(shelf.getByRole('button', { name: /^Fusklapp/ })).toBeVisible();
  await expect(shelf.getByRole('button', { name: /^Veloq OS .*Vänd/ })).toBeHidden();

  await shelf.getByRole('button', { name: 'Spel' }).click();
  await expect(shelf).toContainText('Inga artefakter matchar.');

  await shelf.getByRole('button', { name: 'Alla' }).click();
  await expect(shelf).toContainText('3 av 3');
});

test('search in the top bar narrows the shelf, whatever the case', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  const search = page.getByLabel('Sök projekt och artefakter');

  await search.fill('  YAGI ');
  await expect(shelf).toContainText('1 av 3');
  await expect(shelf.getByRole('button', { name: /^Yagi Sports logo/ })).toBeVisible();

  await search.fill('finns inte');
  await expect(shelf).toContainText('Inga artefakter matchar.');

  await search.fill('');
  await expect(shelf).toContainText('3 av 3');
});

test('search and group filter work together', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  await page.getByLabel('Sök projekt och artefakter').fill('veloq');
  await shelf.getByRole('button', { name: 'Yagi' }).click();
  await expect(shelf).toContainText('0 av 3');
});

test('syncs from claude.ai and waits while it runs', async ({ page, api }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  await shelf.getByRole('button', { name: 'Synka' }).click();
  await expect(shelf.getByRole('button', { name: 'Synkar…' })).toBeDisabled();
  expect(api.runs.map((r) => r.id)).toEqual(['sync-artifacts']);
});

test('reads the shelf again when the sync is done', async ({ page, api }) => {
  await page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synka' }).click();
  await expect(page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synkar…' })).toBeVisible();

  const before = api.requests.filter((r) => r.path === '/artifacts').length;
  api.jobs = api.jobs.map((j) => ({ ...j, status: 'done', progress: 1, result: 'Synkat.' }));
  await expect(page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synka', exact: true })).toBeEnabled();
  await expect.poll(() => api.requests.filter((r) => r.path === '/artifacts').length).toBeGreaterThan(before);
});
