import { calendarConnected, diskJob } from '../src/test/fixtures';
import { drag, expect, test } from './fixtures';

// The rest of the suite runs with reduced motion; here the GSAP code paths run for real.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test.beforeEach(async ({ page, api }) => {
  api.calendar = structuredClone(calendarConnected);
  api.jobs = [structuredClone(diskJob)];
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
});

test('the numbers count up to their value', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' }).locator('.num')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Öppna stories: 3' }).locator('.num')).toHaveText('3');
});

test('a swiped mail flies off before the API hears of it', async ({ page, api }) => {
  await page.getByRole('region', { name: 'Inkorg' }).getByRole('button', { name: 'Arkivera' }).click();
  await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
  await expect(page.getByRole('region', { name: 'Inkorg' }).getByRole('article')).toHaveAccessibleName(/^\[Avsändare\]/);
});

test('a dragged mail flies off too', async ({ page, api }) => {
  await drag(page, page.getByRole('region', { name: 'Inkorg' }).getByRole('article'), 180, 0);
  await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
});

test('a story glides to its new column', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');
  await expect(board.getByRole('list', { name: 'Klart' })).toContainText('VEL-1');
  expect(api.moves).toEqual([{ id: 'VEL-1', body: { stateId: 'done' } }]);
});

test('a new story flies out of the portal after a voice command', async ({ page }) => {
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('En story om portalen');
  await voice.getByLabel('Skriv till Rick').press('Enter');
  await expect(voice.getByRole('list', { name: 'Verktyg som kördes' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Linear' })).toContainText('Portalen');
  await expect(page.locator('#beams')).toBeAttached();
});

test('an artifact card really turns over', async ({ page }) => {
  const flipper = page.locator('[data-id="a1"] .flipper');
  await page.getByRole('button', { name: /^Veloq OS .*Vänd/ }).click();
  await expect.poll(() => flipper.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11)).toBeLessThan(0);
});

test('a bubble is sucked into the portal', async ({ page, api }) => {
  const disk = page.getByRole('region', { name: 'Disk' });
  await disk.getByRole('button', { name: /^npm/ }).press('Enter');
  await disk.getByRole('button', { name: 'Rensa 1 · 4,4 GB' }).click();
  await expect.poll(() => api.confirmed).toEqual(['npm']);
});

test('a calendar collision shakes the event back', async ({ page, api }) => {
  const event = page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^\[Möte\]/ });
  await drag(page, event, 0, 6.5 * 44);
  await expect(page.getByRole('status')).toContainText('Krockar med Pågående möte.');
  await expect(event).toContainText('08:30–09:00');
  expect(api.moves).toEqual([]);
});
