import { chores, runningJob, waitingJob } from '../src/test/fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('runs a chore from its key in the skills panel', async ({ page, api }) => {
  await page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta Städa minnet' }).click();
  await expect.poll(() => api.runs.map((r) => r.id)).toEqual(['memory-cleanup']);
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('Kör på datorn…');
});

test('opens the run sheet for a skill that takes a project', async ({ page }) => {
  await page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta /ny-branch' }).click();
  await expect(page.getByRole('dialog', { name: 'Kör /ny-branch' })).toBeVisible();
});

test('runs one of your skills in a project from the skills sheet', async ({ page, api }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
  await page.getByRole('button', { name: 'Kör /ny-branch' }).click();

  const sheet = page.getByRole('dialog', { name: 'Kör /ny-branch' });
  await sheet.getByRole('button', { name: 'Veloq OS' }).click();
  await sheet.getByPlaceholder('<namn>').fill('feature/skills');
  await sheet.getByRole('button', { name: 'Kör' }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Visa jobb: /ny-branch' })).toContainText('Veloq OS · Kör på datorn…');
  expect(api.runs).toEqual([{ id: 'skill-ny-branch', projectId: 'veloq-os', argument: 'feature/skills' }]);
});

test('finds unused packages and removes only the picked ones', async ({ page, api }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
  await page.getByRole('button', { name: 'Kör Oanvända paket' }).click();
  const run = page.getByRole('dialog', { name: 'Kör Oanvända paket' });
  await run.getByRole('button', { name: 'Veloq OS' }).click();
  await run.getByRole('button', { name: 'Kör' }).click();

  await page.getByRole('button', { name: 'Visa jobb: Oanvända paket' }).first().click();
  const job = page.getByRole('dialog', { name: 'Jobb: Oanvända paket' });
  await expect(job.getByRole('heading', { name: 'Välj vad som ska göras.' })).toBeVisible();
  await job.getByRole('checkbox', { name: /lodash/ }).check();
  await job.getByRole('button', { name: 'Ta bort valda' }).click();

  await expect(job).toBeHidden();
  expect(api.confirmed).toEqual(['web-lodash']);
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('Veloq OS · Kör på datorn…');
});

test('runs a routine now and syncs the artifacts', async ({ page, api }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click();
  await page.getByRole('button', { name: 'Kör nu: Veckorevy' }).click();
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('week-summary');
  await page.keyboard.press('Escape');

  await page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synka' }).click();
  await expect.poll(() => api.runs.map((r) => r.id)).toContain('sync-artifacts');
});

test.describe('the keys', () => {
  test('lists your skills first and shows progress while a chore runs', async ({ page, api }) => {
    const panel = page.getByRole('region', { name: 'Skills' });
    await expect(panel.locator('.key-name').first()).toHaveText('/ny-branch');

    await panel.getByRole('button', { name: 'Starta Städa minnet' }).click();
    await expect(panel.getByRole('button', { name: 'Starta Städa minnet' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Starta Städa minnet' })).toContainText('20 %');
    await expect(panel).toContainText('1 kör');
    await expect(page.getByRole('button', { name: 'Jobb kör: 1' })).toBeVisible();

    api.jobs = [runningJob('memory-cleanup', 0.75)];
    await expect(panel.getByRole('button', { name: 'Starta Städa minnet' })).toContainText('75 %');
  });
});

test.describe('the skills sheet', () => {
  const open = async (page: import('@playwright/test').Page) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    return page.getByRole('dialog', { name: 'Skills' });
  };

  test('groups chores and skills', async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet.getByRole('region', { name: 'Chores' }).locator('.chore-name')).toHaveText(['Städa minnet', 'Synka projekt', 'Oanvända paket']);
    await expect(sheet.getByRole('region', { name: 'Dina skills' }).locator('.chore-name')).toHaveText(['/ny-branch', '/pr']);
  });

  test('says what the buttons do: run at once or pick first', async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet.getByRole('button', { name: 'Kör Städa minnet' })).toHaveText('Kör');
    await expect(sheet.getByRole('button', { name: 'Kör /ny-branch' })).toHaveText('Välj');
  });

  test('a simple chore starts at once and the sheet closes', async ({ page, api }) => {
    const sheet = await open(page);
    await sheet.getByRole('button', { name: 'Kör Synka projekt' }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => api.runs).toEqual([{ id: 'sync-projects' }]);
  });

  test('tells you when there are no skills yet', async ({ page, api }) => {
    api.answer('GET', '/chores', chores.filter((c) => c.kind === 'chore'));
    await page.reload();
    await expect((await open(page)).getByRole('region', { name: 'Dina skills' })).toContainText('Inga skills i ~/.claude/skills än.');
  });
});

test.describe('the run sheet', () => {
  const open = async (page: import('@playwright/test').Page, name: string) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: `Kör ${name}` }).click();
    return page.getByRole('dialog', { name: `Kör ${name}` });
  };

  test('needs a project when the chore requires one', async ({ page }) => {
    const sheet = await open(page, 'Oanvända paket');
    await expect(sheet.getByRole('button', { name: 'Kör', exact: true })).toBeDisabled();
    await sheet.getByRole('button', { name: 'HaloDeck' }).click();
    await expect(sheet.getByRole('button', { name: 'Kör', exact: true })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Inget projekt' })).toBeHidden();
  });

  test('offers only projects with a folder on the computer', async ({ page }) => {
    const sheet = await open(page, 'Oanvända paket');
    await expect(sheet.getByRole('group', { name: 'Projekt' }).getByRole('button')).toHaveText(['HaloDeck', 'Veloq OS']);
  });

  test('runs an optional skill without project or addition', async ({ page, api }) => {
    const sheet = await open(page, '/pr');
    await expect(sheet.getByRole('button', { name: 'Inget projekt' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: 'Kör', exact: true }).click();
    await expect(sheet).toBeHidden();
    expect(api.runs).toEqual([{ id: 'skill-pr' }]);
  });

  test('trims the addition and shows the skill wording', async ({ page, api }) => {
    const sheet = await open(page, '/pr');
    await expect(sheet).toContainText('Skill · körs i Claude Code');
    await sheet.getByLabel('Tillägg').fill('  snabbt  ');
    await sheet.getByRole('button', { name: 'Kör', exact: true }).click();
    await expect(sheet).toBeHidden();
    expect(api.runs).toEqual([{ id: 'skill-pr', argument: 'snabbt' }]);
  });

  test('shows the estimate for a chore', async ({ page }) => {
    await expect(await open(page, 'Oanvända paket')).toContainText('Chore · ≈ 3 min');
  });
});

test.describe('jobs', () => {
  test('says when nothing runs', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('Inget körs just nu.');
  });

  test('polls a job until it is done, then stops', async ({ page, api }) => {
    await page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta Städa minnet' }).click();
    const card = page.getByRole('region', { name: 'Pågående jobb' });
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');

    api.jobs = [runningJob('memory-cleanup', 0.6)];
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');

    api.jobs = [{ ...runningJob('memory-cleanup', 1), status: 'done', step: 'Klart', result: 'Tog bort 4 rader.\nResten är kvar.' }];
    await expect(card).toContainText('Tog bort 4 rader.');
    await expect(card).not.toContainText('Resten är kvar.');
    await expect(page.getByRole('button', { name: 'Jobb kör: 0' })).toBeVisible();

    const polls = api.requests.filter((r) => r.path === '/jobs').length;
    await page.clock.runFor(5000);
    expect(api.requests.filter((r) => r.path === '/jobs').length).toBe(polls);
  });

  test('shows the three latest', async ({ page, api }) => {
    api.jobs = ['memory-cleanup', 'sync-projects', 'skill-pr', 'skill-ny-branch'].map((id) => ({ ...runningJob(id), status: 'done', result: 'Klart.' }));
    await page.reload();
    await expect(page.getByRole('region', { name: 'Pågående jobb' }).getByRole('button')).toHaveCount(3);
  });

  test('opens a running job', async ({ page, api }) => {
    api.jobs = [runningJob('memory-cleanup')];
    await page.reload();
    await page.getByRole('button', { name: 'Visa jobb: Städa minnet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Jobb: Städa minnet' });
    await expect(sheet.getByRole('heading', { name: 'Jobbet körs.' })).toBeVisible();
    await expect(sheet).toContainText('Kör på datorn…');
  });

  test('a sheet left open follows the job until it is done', async ({ page, api }) => {
    api.jobs = [runningJob('memory-cleanup')];
    await page.reload();
    await page.getByRole('button', { name: 'Visa jobb: Städa minnet' }).click();

    api.jobs = [{ ...runningJob('memory-cleanup', 1), status: 'done', step: 'Klart', result: 'Allt är städat.' }];
    const sheet = page.getByRole('dialog', { name: 'Jobb: Städa minnet' });
    await expect(sheet.getByRole('heading', { name: 'Jobbet är klart.' })).toBeVisible();
    await expect(sheet).toContainText('Allt är städat.');
  });

  test('shows a failed job with its reason', async ({ page, api }) => {
    api.jobs = [{ ...runningJob('memory-cleanup', 1), status: 'failed', step: 'Stoppad', result: 'Claude Code kör inte.' }];
    await page.reload();
    const card = page.getByRole('region', { name: 'Pågående jobb' });
    await expect(card).toContainText('Misslyckades');

    await card.getByRole('button', { name: 'Visa jobb: Städa minnet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Jobb: Städa minnet' });
    await expect(sheet.getByRole('heading', { name: 'Jobbet misslyckades.' })).toBeVisible();
    await expect(sheet.locator('.job-result.failed')).toHaveText('Claude Code kör inte.');
  });

  test('a proposal waits for a pick before it can run', async ({ page, api }) => {
    api.jobs = [structuredClone(waitingJob)];
    await page.reload();
    await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('Veloq OS · Väntar på ditt val');

    await page.getByRole('button', { name: 'Visa jobb: Oanvända paket' }).click();
    const sheet = page.getByRole('dialog', { name: 'Jobb: Oanvända paket' });
    const remove = sheet.getByRole('button', { name: 'Ta bort valda' });
    await expect(remove).toBeDisabled();

    await sheet.getByRole('checkbox', { name: /Polly/ }).check();
    await expect(remove).toBeEnabled();
    await sheet.getByRole('checkbox', { name: /Polly/ }).uncheck();
    await expect(remove).toBeDisabled();
    expect(api.confirmed).toEqual([]);
  });
});

test.describe('routines', () => {
  const open = async (page: import('@playwright/test').Page) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click();
    return page.getByRole('dialog', { name: 'Rutiner' });
  };

  test('lists each routine with its schedule and next run', async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet).toContainText('Vardagar · 07:40 · Nästa');
    await expect(sheet.getByText('Fredagar · 15:00', { exact: true })).toBeVisible();
  });

  test('turns a routine on and off', async ({ page, api }) => {
    const sheet = await open(page);
    await sheet.getByRole('button', { name: 'Slå på Veckorevy' }).click();
    await expect(sheet.getByRole('button', { name: 'Stäng av Veckorevy' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => api.routines.find((r) => r.id === 'week-review')?.enabled).toBe(true);

    await sheet.getByRole('button', { name: 'Stäng av Morgonbrief' }).click();
    await expect(sheet.getByRole('button', { name: 'Slå på Morgonbrief' })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => api.requests.filter((r) => r.path === '/routines/morning-brief').at(-1)?.body).toEqual({ enabled: false });
  });
});
