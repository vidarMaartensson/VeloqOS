import { diskJob, systemOk } from '../src/test/fixtures';
import { drag, expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('warns about a full disk and cleans from the top bar', async ({ page, api }) => {
  await page.getByRole('button', { name: /Disken är nästan full/ }).click();

  await expect.poll(() => api.runs.map((r) => r.id)).toEqual(['disk-cleanup']);
});

test('a healthy disk has no warning, just the numbers', async ({ page, api }) => {
  api.system = systemOk;
  await page.reload();
  await expect(page.getByRole('region', { name: 'Disk' })).toContainText('200,0 GB ledigt av 460,0 GB');
  await expect(page.getByRole('button', { name: /Disken är nästan full/ })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ledigt: 200 GB' })).toBeVisible();
});

test('scans the disk and shows what it found as bubbles', async ({ page, api }) => {
  const disk = page.getByRole('region', { name: 'Disk' });
  await disk.getByRole('button', { name: 'Skanna disken' }).click();
  await expect(disk.getByRole('button', { name: 'Skannar…' })).toBeDisabled();
  await expect(disk).toContainText('Letar efter skräp…');
  expect(api.runs.map((r) => r.id)).toEqual(['disk-cleanup']);

  api.jobs = [structuredClone(diskJob)];
  await expect(disk.getByRole('button', { name: /^Gradle, 9,8 GB/ })).toBeVisible();
  await expect(disk.getByRole('button', { name: /^npm, 4,4 GB/ })).toBeVisible();
  await expect(disk).toContainText('Dra en bubbla in i portalen för att välja den.');
});

test.describe('with a proposal waiting', () => {
  test.beforeEach(async ({ page, api }) => {
    api.jobs = [structuredClone(diskJob)];
    await page.reload();
  });

  test('picks bubbles with Enter, adds them up and takes them back', async ({ page, api }) => {
    const disk = page.getByRole('region', { name: 'Disk' });
    await disk.getByRole('button', { name: /^Gradle/ }).press('Enter');
    await expect(disk.getByRole('button', { name: 'Rensa 1 · 9,8 GB' })).toBeVisible();

    await disk.getByRole('button', { name: /^npm/ }).press('Enter');
    await expect(disk.getByRole('button', { name: 'Rensa 2 · 14,2 GB' })).toBeVisible();
    await expect(disk).toContainText('Allt är valt.');

    await disk.getByRole('button', { name: 'Ångra' }).click();
    await expect(disk.getByRole('button', { name: /^Gradle/ })).toBeVisible();
    await expect(disk.getByRole('button', { name: /^npm/ })).toBeVisible();
    expect(api.confirmed).toEqual([]);
  });

  test('dragging a bubble into the portal picks it', async ({ page, api }) => {
    const disk = page.getByRole('region', { name: 'Disk' });
    const bubble = disk.getByRole('button', { name: /^npm/ });
    const from = (await bubble.boundingBox())!;
    const to = (await page.locator('.portal').boundingBox())!;
    await drag(page, bubble, to.x + to.width / 2 - (from.x + from.width / 2), to.y + to.height / 2 - (from.y + from.height / 2));

    await disk.getByRole('button', { name: 'Rensa 1 · 4,4 GB' }).click();
    await expect.poll(() => api.confirmed).toEqual(['npm']);
    await expect(page.getByRole('status')).toContainText('Rensar 4,4 GB.');
  });

  test('a bubble dropped outside the portal floats back and picks nothing', async ({ page }) => {
    const disk = page.getByRole('region', { name: 'Disk' });
    await drag(page, disk.getByRole('button', { name: /^npm/ }), 0, 30);
    await expect(disk).toContainText('Dra en bubbla in i portalen för att välja den.');
    await expect(disk.getByRole('button', { name: /^npm/ })).toBeVisible();
  });

  test('a click on a bubble explains what to do', async ({ page }) => {
    await page.getByRole('region', { name: 'Disk' }).getByRole('button', { name: /^npm/ }).click();
    await expect(page.getByRole('status')).toContainText('Dra mig in i portalen.');
  });
});

test('gathers the smallest bubbles when there are many', async ({ page, api }) => {
  api.jobs = [{ ...structuredClone(diskJob), choices: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `Cache ${i}`, detail: `~/c${i} · ${9 - i},0 GB` })) }];
  await page.reload();
  const bubbles = page.getByRole('region', { name: 'Disk' }).locator('.bub');
  await expect(bubbles).toHaveCount(7);

  await page.getByRole('region', { name: 'Disk' }).getByRole('button', { name: /^Övrigt · 3 st, 6,0 GB/ }).press('Enter');
  await expect(page.getByRole('region', { name: 'Disk' }).getByRole('button', { name: 'Rensa 3 · 6,0 GB' })).toBeVisible();
});
