import { calendarConnected } from '../src/test/fixtures';
import { expect, test } from './fixtures';

// Runs in the laptop, tablet and mobile projects.
test.beforeEach(async ({ page, api }) => {
  api.calendar = structuredClone(calendarConnected);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
});

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the page does not scroll sideways', async ({ page }) => {
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('every panel is there and no wider than the screen', async ({ page }) => {
  const width = page.viewportSize()!.width;
  for (const name of ['Kalender', 'Röstassistent', 'Disk', 'Inkorg', 'Artefakter', 'Linear', 'Skills', 'Morgonbrief', 'Pågående jobb', 'CI']) {
    const panel = page.getByRole('region', { name, exact: true });
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x, `${name} starts on the screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} ends on the screen`).toBeLessThanOrEqual(width);
  }
});

test('the voice works from the keyboard field', async ({ page, api }) => {
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('Hallå');
  await voice.getByLabel('Skriv till Rick').press('Enter');
  await expect(voice).toContainText('Vad?');
  expect(api.voice[0].text).toBe('Hallå');
});

test('the inbox opens and fits', async ({ page }) => {
  await page.getByRole('region', { name: 'Inkorg' }).getByRole('button', { name: 'Alla' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inkorg' });
  await expect(dialog.getByRole('heading', { name: '2 saker behöver dig.' })).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole('button', { name: 'Stäng inkorgen' }).click();
  await expect(dialog).toBeHidden();
});

test('a sheet opens, fits and closes', async ({ page }) => {
  await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click();
  const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(sheet.getByRole('button', { name: /Lägg in/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Stäng' }).click();
  await expect(sheet).toBeHidden();
});

test('the Linear board stays usable', async ({ page }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');
  await expect(board.getByRole('list', { name: 'Klart' })).toContainText('VEL-1');
});

test('the Linear board grows no taller than the voice card', async ({ page }) => {
  const voice = (await page.getByRole('region', { name: 'Röstassistent' }).boundingBox())!;
  const linear = (await page.getByRole('region', { name: 'Linear' }).boundingBox())!;
  expect(linear.height).toBeLessThanOrEqual(voice.height + 1);
});

test('on a wide screen the brief sits top right, skills beside the inbox and artifacts beside Linear', async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 1180, 'Three columns only on wide screens.');
  const box = async (name: string) => (await page.getByRole('region', { name, exact: true }).boundingBox())!;
  const [cal, voice, brief, inbox, skills, linear, art] = await Promise.all(
    ['Kalender', 'Röstassistent', 'Morgonbrief', 'Inkorg', 'Skills', 'Linear', 'Artefakter'].map(box),
  );
  expect(brief.x).toBeGreaterThan(voice.x + voice.width - 1);
  expect(Math.abs(brief.y - cal.y)).toBeLessThan(2);
  expect(Math.abs(skills.y - inbox.y)).toBeLessThan(2);
  expect(skills.x).toBeGreaterThan(voice.x);
  expect(Math.abs(art.y - linear.y)).toBeLessThan(2);
  expect(art.x).toBeGreaterThan(linear.x + linear.width - 1);
});

test('everything in the menu can be reached', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Huvudmeny' });
  await expect(nav).toContainText('Online');

  await nav.getByRole('button', { name: 'Rutiner' }).click();
  await expect(page.getByRole('dialog', { name: 'Rutiner' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).click();

  for (const [name, dialog] of [['Inkorg', 'Inkorg'], ['Linear', 'Linear'], ['Skills', 'Skills'], ['Röst', 'Röstinställningar']]) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test.describe('with the menu along the bottom', () => {
  test.skip(({ viewport }) => viewport!.width > 860, 'the menu is on the side here');

  test('the bar does not cover the end of the page', async ({ page }) => {
    const nav = (await page.getByRole('navigation', { name: 'Huvudmeny' }).boundingBox())!;
    // Scrolls again each time: the panels may still grow as their data arrives.
    await expect.poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const last = (await page.locator('.lower').boundingBox())!;
      return last.y + last.height;
    }).toBeLessThanOrEqual(nav.y);
  });

  test('a toast sits above the bar', async ({ page }) => {
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^\[Möte\]/ }).press('ArrowDown');
    const toast = (await page.getByRole('status').boundingBox())!;
    const nav = (await page.getByRole('navigation', { name: 'Huvudmeny' }).boundingBox())!;
    expect(toast.y + toast.height).toBeLessThanOrEqual(nav.y);
  });

  test('the buttons in the bar are big enough to press', async ({ page }) => {
    for (const button of await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
