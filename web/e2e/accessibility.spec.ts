import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { calendarConnected, diskJob, waitingJob } from '../src/test/fixtures';
import { expect, test } from './fixtures';

/** WCAG A and AA; the rule's id and the elements it hit, so a failure says what to fix. */
async function violations(page: Page, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (within) builder.include(within);
  const { violations } = await builder.analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
}

test.beforeEach(async ({ page, api }) => {
  api.calendar = structuredClone(calendarConnected);
  api.jobs = [structuredClone(diskJob), structuredClone(waitingJob)];
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
});

test('the dashboard has no accessibility problems', async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

for (const [name, open] of [
  ['inbox', (page: Page) => page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name: 'Inkorg' }).click()],
  ['linear', (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'Linear' }).click()],
  ['routines', (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click()],
  ['skills', (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click()],
  ['voice settings', (page: Page) => page.getByRole('navigation').getByRole('button', { name: 'Röst' }).click()],
  ['new event', (page: Page) => page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click()],
  ['job', (page: Page) => page.getByRole('button', { name: 'Visa jobb: Oanvända paket' }).click()],
  ['project', (page: Page) => page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click()],
] as const) {
  test(`the ${name} sheet has no accessibility problems`, async ({ page }) => {
    await open(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await violations(page, '[role="dialog"]')).toEqual([]);
  });

  test(`the ${name} sheet closes with Escape`, async ({ page }) => {
    await open(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test(`the ${name} sheet closes when you click beside it`, async ({ page }) => {
    await open(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toBeHidden();
  });
}

test('the page has a heading, a menu and a language', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Huvudmeny' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});

test('every panel is a named region', async ({ page }) => {
  for (const name of ['Kalender', 'Röstassistent', 'Disk', 'Inkorg', 'Artefakter', 'Linear', 'Skills', 'Morgonbrief', 'Pågående jobb', 'CI']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
});

test('the keyboard reaches the things you can do', async ({ page }) => {
  await page.getByRole('button', { name: 'Översikt' }).focus();
  const reached = new Set<string>();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    reached.add(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''));
  }
  const all = [...reached].join('\n');
  expect(all).toContain('Inkorg');
  expect(all).toContain('Sök');
  expect(all).toMatch(/^Behöver dig: 2$/m);
  expect(all).toMatch(/^\[Möte\], 08:30–09:00/m);
  expect(all).toMatch(/^GitHub: CI misslyckades på main/m);
});

test('the back of an artifact card stays out of the tab order until it is turned', async ({ page }) => {
  const shelf = page.getByRole('region', { name: 'Artefakter' });
  const open = shelf.locator('[data-id="a1"]').getByRole('link', { name: 'Öppna', includeHidden: true });
  await expect(open).toHaveAttribute('tabindex', '-1');
  await shelf.getByRole('button', { name: /^Veloq OS .*Vänd/ }).click();
  await expect(open).toHaveAttribute('tabindex', '0');
});

test('honours reduced motion', async ({ page }) => {
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
  expect(moving).toBe(0);
});

test.describe('focus in a sheet', () => {
  const rail = (page: Page, name: string) => page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name, exact: true });

  for (const name of ['Rutiner', 'Inkorg']) {
    test(`moves into ${name} when it opens and back when it closes`, async ({ page }) => {
      await rail(page, name).click();
      await expect(page.getByRole('dialog')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(rail(page, name)).toBeFocused();
    });

    test(`stays in ${name} when you tab, both ways`, async ({ page }) => {
      await rail(page, name).click();
      const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press(key);
          expect(await inside(), `${key} ${i}`).toBe(true);
        }
      }
    });
  }

  test('a field that takes focus keeps it, and focus still goes back on close', async ({ page }) => {
    const opener = page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' });
    await opener.click();
    await expect(page.getByRole('dialog').getByLabel('Titel')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });

  test('space in an open sheet does not start listening', async ({ page }) => {
    await rail(page, 'Rutiner').click();
    await expect(page.getByRole('dialog')).toBeFocused();
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(page.locator('.voice-phase')).toHaveText('Håll inne för att prata');
  });

  test('holding space to talk never scrolls the page', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 200));
    const before = await page.evaluate(() => window.scrollY);
    // A held key sends repeats; every one of them must be swallowed.
    for (let i = 0; i < 12; i++) await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('space after clicking a button talks instead of pressing the button again', async ({ page }) => {
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stäng' }).click();
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'I morgon' }).click();
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test('the time on a calendar event still shows before its title', async ({ page }) => {
  const event = page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^Pågående möte/ });
  const time = (await event.locator('.ev-t').boundingBox())!;
  const title = (await event.locator('.ev-n').boundingBox())!;
  // A short event is a row, so the time comes to the left of the title.
  expect(time.x).toBeLessThan(title.x);
});

test('an empty Kanban column is not a list without items', async ({ page }) => {
  const done = page.getByRole('region', { name: 'Linear' }).locator('[data-col="done"]');
  await expect(done).toHaveAttribute('role', 'group');
  await expect(done).toHaveAccessibleName('Klart');
});
