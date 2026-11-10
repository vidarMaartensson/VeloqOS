import { statuses } from '../src/test/fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens a project from its red CI and lists its stories', async ({ page }) => {
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Projekt: Veloq OS' });
  await expect(sheet.getByRole('region', { name: 'Repo' })).toContainText('feature/skills · 12 ändrade · 2 opushade · 1 PR · CI rött');
  await expect(sheet.getByRole('region', { name: 'Stories' })).toContainText('Visa CI i orbiten');
});

test('counts the red projects and shows each project state', async ({ page }) => {
  const ci = page.getByRole('region', { name: 'CI' });
  await expect(ci).toContainText('1 röda');
  await expect(ci.getByRole('button', { name: /^HaloDeck:/ })).toContainText('Grönt');
  await expect(ci.getByRole('button', { name: /^Veloq OS:/ })).toContainText('Rött · 1 PR');
});

test('says when no CI runs were found', async ({ page, api }) => {
  api.answer('GET', '/projects/status', []);
  await page.reload();
  await expect(page.getByRole('region', { name: 'CI' })).toContainText('Inga körningar hittades.');
});

test('links to the latest run on GitHub and shows the last commit', async ({ page }) => {
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();
  const repo = page.getByRole('dialog', { name: 'Projekt: Veloq OS' }).getByRole('region', { name: 'Repo' });
  await expect(repo).toContainText('Senast · Add skills');
  await expect(repo.getByRole('link', { name: 'Öppna senaste körningen på GitHub' })).toHaveAttribute('href', 'https://github.com/v/veloqos/actions/runs/2');
});

test('a clean repo says so', async ({ page }) => {
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^HaloDeck:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Projekt: HaloDeck' }).getByRole('region', { name: 'Repo' })).toContainText('main · rent · CI grönt');
});

test('shows why the repo could not be read', async ({ page, api }) => {
  api.answer('GET', '/projects/status', [{ ...statuses[1], error: 'Mappen finns inte.' }]);
  await page.reload();
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Projekt: Veloq OS' }).getByRole('region', { name: 'Repo' })).toContainText('Mappen finns inte.');
});

test('says when a project has no open stories', async ({ page, api }) => {
  api.stories = [];
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Projekt: Veloq OS' }).getByRole('region', { name: 'Stories' })).toContainText('Inga öppna stories.');
});

test('explains how to link a project that has no Linear team', async ({ page, api }) => {
  api.answer('GET', '/projects/status', [{ ...statuses[0], projectId: 'halo-home' }]);
  await page.reload();
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Halo Home:/ }).click();
  const stories = page.getByRole('dialog', { name: 'Projekt: Halo Home' }).getByRole('region', { name: 'Stories' });
  await expect(stories).toContainText('Inte kopplat till Linear. Sätt Veloq:LinearTeams:halo-home i API:t.');
  expect(api.requests.some((r) => r.path === '/projects/halo-home/stories')).toBe(false);
});
