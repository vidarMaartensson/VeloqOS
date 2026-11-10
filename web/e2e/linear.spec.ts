import { linearIssue, linearTeams } from '../src/test/fixtures';
import { drag, expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows Linear stories and creates a new one', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Linear' }).click();
  const sheet = page.getByRole('dialog', { name: 'Linear' });
  await expect(sheet).toContainText('Linear · Veloq Labs · VEL');
  await expect(sheet.getByRole('heading', { name: '3 öppna stories.' })).toBeVisible();

  await sheet.getByRole('button', { name: /Ny story/ }).click();
  const form = sheet.getByRole('form', { name: 'Ny story' });
  await form.getByLabel('Titel').fill('Restart-knapp i railen');
  await form.getByRole('button', { name: 'Hög' }).click();
  await form.getByRole('button', { name: 'Skapa story' }).click();

  await expect(form).toBeHidden();
  await expect(sheet.getByRole('link', { name: /Restart-knapp i railen/ })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: '4 öppna stories.' })).toBeVisible();
});

test('sorts the stories into their columns', async ({ page }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await expect(board.getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');
  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('VEL-2');
  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('VEL-3');
  await expect(board.getByRole('list', { name: 'Klart' }).getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Öppna stories: 3' })).toBeVisible();
});

test('shows at most five finished stories on the board', async ({ page, api }) => {
  const done = linearTeams[0].states.find((s) => s.id === 'done')!;
  api.linear = [...api.linear, ...Array.from({ length: 7 }, (_, i) => linearIssue(20 + i, done))];
  await page.reload();
  await expect(page.getByRole('region', { name: 'Linear' }).getByRole('list', { name: 'Klart' }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Öppna stories: 3' })).toBeVisible();
});

test('moves a story back with the left arrow, and nowhere without a matching state', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowLeft');
  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('VEL-1');
  await expect.poll(() => api.moves).toEqual([{ id: 'VEL-1', body: { stateId: 'todo' } }]);

  // The test team has no backlog state.
  await board.getByRole('listitem', { name: /^VEL-2:/ }).press('ArrowLeft');
  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('VEL-2');
  expect(api.moves).toHaveLength(1);
});

test('congratulates you when a story is done', async ({ page }) => {
  await page.getByRole('region', { name: 'Linear' }).getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');
  await expect(page.getByRole('status')).toContainText('VEL-1 klar. Skriv det i din dagbok, Vidar.');
});

test('drags a story to another column with the mouse', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  const card = board.getByRole('listitem', { name: /^VEL-2:/ });
  const from = (await card.boundingBox())!;
  const to = (await board.getByRole('list', { name: 'Pågår' }).boundingBox())!;
  await drag(page, card, to.x + to.width / 2 - (from.x + from.width / 2), 0);

  await expect(board.getByRole('list', { name: 'Pågår' })).toContainText('VEL-2');
  await expect.poll(() => api.moves).toEqual([{ id: 'VEL-2', body: { stateId: 'progress' } }]);
});

test('a card dropped in its own column stays put without a call', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await drag(page, board.getByRole('listitem', { name: /^VEL-2:/ }), 0, 10);
  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('VEL-2');
  expect(api.moves).toEqual([]);
});

test('adds a story from the board', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  const add = board.getByRole('button', { name: 'Lägg till' });
  await expect(add).toBeDisabled();

  await board.getByLabel('Ny story').fill('  Pulsen i portalen  ');
  await add.click();

  await expect(board.getByRole('list', { name: 'Att göra' })).toContainText('Pulsen i portalen');
  await expect(board.getByLabel('Ny story')).toHaveValue('');
  expect(api.requests.find((r) => r.path === '/linear/issues' && r.method === 'POST')?.body).toEqual({ teamId: 't-veloq', title: 'Pulsen i portalen', description: null, priority: 0, stateId: null });
});

test('switches team on the board', async ({ page, api }) => {
  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByLabel('Team').selectOption({ label: 'HAL · Halo' });

  await expect(board).toContainText('Hjulet i dockan');
  await expect(board).not.toContainText('VEL-1');
  expect(api.requests.filter((r) => r.path === '/linear/issues').at(-1)?.search).toBe('?teamId=t-halo&open=false');
});

test('the board opens the full list', async ({ page }) => {
  await page.getByRole('region', { name: 'Linear' }).getByRole('button', { name: 'Alla' }).click();
  await expect(page.getByRole('dialog', { name: 'Linear' })).toBeVisible();
});

test.describe('the Linear sheet', () => {
  const open = async (page: import('@playwright/test').Page) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Linear' }).click();
    return page.getByRole('dialog', { name: 'Linear' });
  };

  test('groups the teams per workspace and switches between them', async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet.getByRole('group', { name: 'Veloq Labs' }).getByRole('button')).toHaveText(['Veloq', 'Halo']);
    await expect(sheet.getByRole('group', { name: 'Jobbet' }).getByRole('button')).toHaveText(['Plattform']);

    await sheet.getByRole('button', { name: 'Halo', exact: true }).click();
    await expect(sheet.getByRole('link', { name: /Hjulet i dockan/ })).toBeVisible();

    await sheet.getByRole('button', { name: 'Plattform' }).click();
    await expect(sheet.getByText('Inga stories här.')).toBeVisible();
    await expect(sheet).toContainText('Linear · Jobbet · PLA');
  });

  test('shows finished stories only when you ask', async ({ page, api }) => {
    api.linear = [...api.linear, { ...linearIssue(9, linearTeams[0].states.find((s) => s.id === 'done')!), title: 'Redan klar' }];
    const sheet = await open(page);
    await expect(sheet.getByRole('heading', { name: '3 öppna stories.' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Redan klar/ })).toBeHidden();

    await sheet.getByRole('button', { name: 'Även klara' }).click();

    await expect(sheet.getByRole('region', { name: 'Done' }).getByRole('link', { name: /Redan klar/ })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: '3 öppna stories.' })).toBeVisible();
  });

  test('links each story to Linear in a new tab', async ({ page }) => {
    const sheet = await open(page);
    const link = sheet.getByRole('link', { name: /VEL-1/ });
    await expect(link).toHaveAttribute('href', 'https://linear.app/veloq/issue/VEL-1');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toContainText('Hög');
  });

  test('says when it shows sample data', async ({ page, api }) => {
    api.linearStatus = { configured: false, workspaces: [] };
    await expect(await open(page)).toContainText('Exempeldata.');
  });

  test('names a workspace that does not answer', async ({ page, api }) => {
    api.linearStatus = { configured: true, workspaces: [{ id: 'w-jobb', name: 'Jobbet', error: 'Ogiltig nyckel' }] };
    await expect((await open(page)).getByRole('alert')).toHaveText('Jobbet svarar inte – Ogiltig nyckel');
  });

  test('the new story form needs a title and can be cancelled', async ({ page }) => {
    const sheet = await open(page);
    await sheet.getByRole('button', { name: /Ny story/ }).click();
    const form = sheet.getByRole('form', { name: 'Ny story' });
    await expect(form.getByLabel('Titel')).toBeFocused();
    await expect(form.getByRole('button', { name: 'Skapa story' })).toBeDisabled();

    await form.getByRole('button', { name: 'Avbryt' }).click();
    await expect(form).toBeHidden();
    await expect(sheet.getByRole('button', { name: /Ny story/ })).toBeVisible();
  });

  test('sends everything you filled in', async ({ page, api }) => {
    const sheet = await open(page);
    await sheet.getByRole('button', { name: /Ny story/ }).click();
    const form = sheet.getByRole('form', { name: 'Ny story' });
    await form.getByLabel('Titel').fill('Med allt');
    await form.getByLabel('Beskrivning').fill('Lite *markdown*');
    await form.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'In Progress' }).click();
    await form.getByRole('button', { name: 'Brådskande' }).click();
    await form.getByRole('button', { name: 'Skapa story' }).click();

    await expect(form).toBeHidden();
    await expect(sheet.getByRole('region', { name: 'In Progress' })).toContainText('Med allt');
    expect(api.requests.find((r) => r.path === '/linear/issues' && r.method === 'POST')?.body).toEqual({ teamId: 't-veloq', title: 'Med allt', description: 'Lite *markdown*', priority: 1, stateId: 'progress' });
  });
});
