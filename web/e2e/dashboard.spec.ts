import { brief, calendarConnected, systemOk } from '../src/test/fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the dashboard with the voice in the middle and the panels around it', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vidar.');
  await expect(page.getByRole('region', { name: 'Röstassistent' })).toContainText('Röst · Rick');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Linear' }).getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');
  await page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: /^Yagi Sports logo/ }).click();
  await expect(page.getByRole('region', { name: 'Artefakter' }).getByRole('link', { name: 'Öppna' }).first()).toBeAttached();
});

test('greets you for the time of day', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('God eftermiddag, Vidar.');
});

test('shows the numbers across the top', async ({ page }) => {
  for (const name of ['Möten kvar: okänt', 'Behöver dig: 2', 'Öppna stories: 3', 'Ledigt: 3 GB', 'Jobb kör: 0']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
});

test('counts the meetings that are left today, not the ones that have passed', async ({ page, api }) => {
  api.calendar = structuredClone(calendarConnected);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Möten kvar: 1' })).toBeVisible();
});

test('a number takes you to its panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.getByRole('button', { name: 'Jobb kör: 0' }).click();
  await expect(page.getByRole('region', { name: 'Skills' })).toBeInViewport();
});

test('the artefacts link in the rail takes you to the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.getByRole('navigation').getByRole('link', { name: 'Artefakter' }).click();
  await expect(page.getByRole('region', { name: 'Artefakter' })).toBeInViewport();
});

test('marks the open view in the rail', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  await expect(nav.getByRole('button', { name: 'Översikt' })).toHaveAttribute('aria-current', 'true');
  await nav.getByRole('button', { name: 'Rutiner' }).click();
  await expect(nav.getByRole('button', { name: 'Rutiner' })).toHaveAttribute('aria-current', 'true');
  await expect(nav.getByRole('button', { name: 'Översikt' })).toHaveAttribute('aria-current', 'false');
});

test('says it is online when the API answers', async ({ page }) => {
  await expect(page.getByRole('navigation')).toContainText('Online');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('has no restart button in a plain browser', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Starta om API:t' })).toBeHidden();
});

test('reads disk, CI and the brief again every minute', async ({ page, api }) => {
  await expect(page.getByRole('button', { name: /Disken är nästan full/ })).toBeVisible();
  api.system = systemOk;
  await page.clock.fastForward(61_000);
  await expect(page.getByText('Disk · 200,0 GB ledigt av 460,0 GB').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Disken är nästan full/ })).toBeHidden();
});

test('has no brief to begin with, and writes one on request', async ({ page, api }) => {
  const card = page.getByRole('region', { name: 'Morgonbrief' });
  await expect(card).toContainText('Ingen brief än.');
  await card.getByRole('button', { name: 'Skriv nu' }).click();
  await expect.poll(() => api.requests.some((r) => r.path === '/routines/morning-brief/run')).toBe(true);
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('morning-brief');
});

test('shows the whole brief in a card that scrolls', async ({ page, api }) => {
  api.brief = brief;
  await page.reload();
  const card = page.getByRole('region', { name: 'Morgonbrief' });
  await expect(card).toContainText('Fixa CI i Veloq OS först.');
  await expect(card.getByLabel('Briefen')).toContainText('Möte 08:30.');
  await expect(card.getByLabel('Briefen')).toHaveCSS('overflow-y', 'auto');
  await expect(card.getByRole('button', { name: 'Visa allt' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Skriv en ny' })).toBeVisible();
});
