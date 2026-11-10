import { calendarConnected, diskJob, waitingJob } from '../src/test/fixtures';
import { expect, test } from './fixtures';

const banner = (page: import('@playwright/test').Page) => page.getByRole('alert').filter({ hasText: /./ }).first();

test.describe('when the API cannot be reached', () => {
  test('says so, shows offline and tells you how to start it', async ({ page, api }) => {
    api.down();
    await page.goto('/');
    await expect(banner(page)).toContainText('Kunde inte nå Veloq OS-API:t. Kör dotnet run i api/ och ladda om.');
    await expect(page.getByRole('navigation')).toContainText('Offline');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vidar.');
  });

  test('the numbers wait with a dash rather than a zero', async ({ page, api }) => {
    api.down();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Behöver dig: okänt' })).toContainText('–');
  });

  test('the message can be closed', async ({ page, api }) => {
    api.down();
    await page.goto('/');
    await page.getByRole('button', { name: 'Stäng' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Kunde inte nå' })).toBeHidden();
    await expect(page.getByRole('navigation')).toContainText('Online');
  });

  test('comes back after a reload once the API is up', async ({ page, api }) => {
    api.down();
    await page.goto('/');
    await expect(banner(page)).toBeVisible();

    api.heal();
    await page.reload();
    await expect(page.getByRole('navigation')).toContainText('Online');
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
  });

  test('a job that loses the API on the way shows it', async ({ page, api }) => {
    api.jobs = [{ ...diskJob, status: 'running', choices: null, confirm: null }];
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Jobb kör: 1' })).toBeVisible();

    api.down();
    await expect(banner(page)).toContainText('Kunde inte nå');
  });
});

test('one failing part on load names the reason from the API', async ({ page, api }) => {
  api.fail('GET', '/projects', 500, 'Kunde inte läsa projekten.');
  await page.goto('/');
  await expect(banner(page)).toContainText('Kunde inte läsa projekten.');
});

test('falls back to the status code when the API gives no reason', async ({ page, api }) => {
  await page.route('**/api/projects', (route) => route.fulfill({ status: 503, body: 'nere' }));
  await page.goto('/');
  await expect(banner(page)).toContainText('GET /projects gav 503');
  expect(api.unmocked).toEqual([]);
});

test('shows a validation problem field by field', async ({ page }) => {
  await page.route('**/api/projects', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ errors: { title: ['Titel saknas.'] } }) }));
  await page.goto('/');
  await expect(banner(page)).toContainText('Titel saknas.');
});

test('disk, CI and the brief may fail without calling the dashboard offline', async ({ page, api }) => {
  api.fail('GET', '/system');
  api.fail('GET', '/projects/status');
  api.fail('GET', '/brief');
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText('Online');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ledigt: okänt' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Morgonbrief' })).toContainText('Ingen brief än.');
});

test('a voice status that fails leaves the voice usable', async ({ page, api }) => {
  api.fail('GET', '/voice');
  await page.goto('/');
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('Hallå');
  await voice.getByLabel('Skriv till Rick').press('Enter');
  await expect(voice).toContainText('Vad?');
});

test.describe('the voice', () => {
  test('shows the API\'s reason, does not speak it and does not send it as history', async ({ page, api }) => {
    await page.goto('/');
    const voice = page.getByRole('region', { name: 'Röstassistent' });
    const input = voice.getByLabel('Skriv till Rick');

    api.fail('POST', '/voice/turn', 503, 'Claude svarar inte.');
    await input.fill('Ett');
    await input.press('Enter');
    await expect(voice.locator('.vline.failed')).toHaveText('Claude svarar inte.');
    await expect(input).toBeEnabled();
    expect(await page.evaluate(() => window.__speech.spoken)).toEqual([]);

    api.heal();
    await input.fill('Två');
    await input.press('Enter');
    await expect.poll(() => api.voice[0]?.history).toEqual([{ role: 'user', text: 'Ett' }]);
  });

  test('says so when the API cannot be reached', async ({ page, api }) => {
    await page.goto('/');
    api.down();
    const voice = page.getByRole('region', { name: 'Röstassistent' });
    await voice.getByLabel('Skriv till Rick').fill('Hallå');
    await voice.getByLabel('Skriv till Rick').press('Enter');
    await expect(voice.locator('.vline.failed')).toHaveText('Kunde inte nå Veloq OS-API:t.');
  });

  test('keeps the ok when clearing fails, and says why', async ({ page, api }) => {
    await page.goto('/');
    const voice = page.getByRole('region', { name: 'Röstassistent' });
    await voice.getByLabel('Skriv till Rick').fill('Städa disken');
    await voice.getByLabel('Skriv till Rick').press('Enter');
    const confirm = voice.getByRole('group', { name: 'Väntar på ditt ok' });

    api.fail('POST', /\/confirm$/, 409, 'Jobbet är för gammalt.');
    await confirm.getByRole('button', { name: 'Rensa allt' }).click();
    await expect(page.getByRole('status')).toContainText('Jobbet är för gammalt.');
    expect(api.confirmed).toEqual([]);
  });
});

test.describe('chores and jobs', () => {
  test('the run sheet stays open with the reason', async ({ page, api }) => {
    await page.goto('/');
    api.fail('POST', '/chores/skill-pr/run', 400, 'Projektet saknar en mapp.');
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: 'Kör /pr' }).click();

    const sheet = page.getByRole('dialog', { name: 'Kör /pr' });
    await sheet.getByRole('button', { name: 'Kör', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Projektet saknar en mapp.');
    await expect(sheet.getByRole('button', { name: 'Kör', exact: true })).toBeEnabled();
  });

  test('the run sheet locks while it starts', async ({ page, api }) => {
    await page.goto('/');
    const release = api.hold('POST', '/chores/skill-pr/run');
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: 'Kör /pr' }).click();

    const sheet = page.getByRole('dialog', { name: 'Kör /pr' });
    await sheet.getByRole('button', { name: 'Kör', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Startar…' })).toBeDisabled();

    release();
    await expect(sheet).toBeHidden();
  });

  test('a run that cannot reach the API says so in the sheet and in the banner', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: 'Kör /pr' }).click();
    api.down();

    const sheet = page.getByRole('dialog', { name: 'Kör /pr' });
    await sheet.getByRole('button', { name: 'Kör', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Kunde inte nå Veloq OS-API:t.');
    await expect(page.getByRole('navigation')).toContainText('Offline');
  });

  test('a refused approval keeps the job sheet and the pick', async ({ page, api }) => {
    api.jobs = [structuredClone(waitingJob)];
    await page.goto('/');
    await page.getByRole('button', { name: 'Visa jobb: Oanvända paket' }).click();
    const sheet = page.getByRole('dialog', { name: 'Jobb: Oanvända paket' });
    await sheet.getByRole('checkbox', { name: /lodash/ }).check();

    api.fail('POST', /\/confirm$/, 409, 'Redan borttaget.');
    await sheet.getByRole('button', { name: 'Ta bort valda' }).click();

    await expect(sheet.getByRole('alert')).toHaveText('Redan borttaget.');
    await expect(sheet.getByRole('checkbox', { name: /lodash/ })).toBeChecked();
  });

  test('a refused cleanup on the disk panel keeps the pick and says why', async ({ page, api }) => {
    api.jobs = [structuredClone(diskJob)];
    await page.goto('/');
    const disk = page.getByRole('region', { name: 'Disk' });
    await disk.getByRole('button', { name: /^npm/ }).press('Enter');

    api.fail('POST', /\/confirm$/, 409, 'Skanningen är för gammal.');
    await disk.getByRole('button', { name: 'Rensa 1 · 4,4 GB' }).click();

    await expect(page.getByRole('status')).toHaveText('Skanningen är för gammal.');
    await expect(disk.getByRole('button', { name: 'Rensa 1 · 4,4 GB' })).toBeEnabled();
  });

  test('a routine that cannot start shows the reason', async ({ page, api }) => {
    await page.goto('/');
    api.fail('POST', '/routines/week-review/run', 500, 'Veckorevyn gick inte att starta.');
    await page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click();
    await page.getByRole('button', { name: 'Kör nu: Veckorevy' }).click();
    await page.keyboard.press('Escape');
    await expect(banner(page)).toContainText('Veckorevyn gick inte att starta.');
  });
});

test.describe('the calendar', () => {
  test.beforeEach(({ api }) => {
    api.calendar = structuredClone(calendarConnected);
  });

  test('a refused move goes back and shows the reason', async ({ page, api }) => {
    await page.goto('/');
    api.fail('PATCH', /^\/calendar\/events\//, 502, 'Google svarar inte.');
    const event = page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^\[Möte\]/ });
    await event.press('ArrowDown');

    await expect(banner(page)).toContainText('Google svarar inte.');
    await expect(event).toContainText('08:30–09:00');
    await expect(event).toHaveAccessibleName(/08:30–09:00/);
    await expect(page.getByRole('status')).toBeHidden();
  });

  test('a new event that is refused keeps the sheet and what you wrote', async ({ page, api }) => {
    await page.goto('/');
    api.fail('POST', '/calendar/events', 502, 'Google svarar inte.');
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click();
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    await sheet.getByLabel('Titel').fill('Tandläkare');
    await sheet.getByRole('button', { name: /Lägg in/ }).click();

    await expect(banner(page)).toContainText('Google svarar inte.');
    await expect(sheet.getByLabel('Titel')).toHaveValue('Tandläkare');
    await expect(sheet.getByRole('button', { name: /Lägg in/ })).toBeEnabled();
  });

  test('the sheet locks while it saves', async ({ page, api }) => {
    await page.goto('/');
    const release = api.hold('POST', '/calendar/events');
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click();
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    await sheet.getByLabel('Titel').fill('Tandläkare');
    await sheet.getByRole('button', { name: /Lägg in/ }).click();
    await expect(sheet.getByRole('button', { name: 'Lägger in…' })).toBeDisabled();

    release();
    await expect(sheet).toBeHidden();
  });

  test('a booking that fails keeps the suggestion', async ({ page, api }) => {
    await page.goto('/');
    api.fail('POST', /\/book$/, 502, 'Google svarar inte.');
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await calendar.getByRole('button', { name: 'Boka Fokus · Halo Home motion' }).click();
    await expect(banner(page)).toContainText('Google svarar inte.');
    await expect(calendar.getByRole('button', { name: 'Boka Fokus · Halo Home motion' })).toBeVisible();
  });

  test('a connection that fails shows why and offers it again', async ({ page, api }) => {
    api.calendar = { connected: false, date: '2026-10-29', events: [] };
    await page.goto('/');
    api.fail('POST', '/calendar/connect', 500, 'Google-nyckeln saknas.');
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await calendar.getByRole('button', { name: /Anslut Google/ }).click();
    await expect(banner(page)).toContainText('Google-nyckeln saknas.');
    await expect(calendar.getByRole('button', { name: /Anslut Google/ })).toBeVisible();
  });
});

test.describe('Linear', () => {
  test('the board shows when Linear does not answer', async ({ page, api }) => {
    api.fail('GET', '/linear/teams', 502, 'Linear svarar inte.');
    await page.goto('/');
    const board = page.getByRole('region', { name: 'Linear' });
    await expect(board.locator('.tile-error')).toHaveText('Linear svarar inte.');
    await expect(board.getByLabel('Ny story')).toBeDisabled();
    await expect(page.getByRole('navigation')).toContainText('Online');
  });

  test('a refused move goes back and stays explained', async ({ page, api }) => {
    await page.goto('/');
    const board = page.getByRole('region', { name: 'Linear' });
    await expect(board.getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');

    api.fail('PATCH', /^\/linear\/issues\//, 502, 'Linear sa nej.');
    await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');

    await expect(board.locator('.tile-error')).toHaveText('Linear sa nej.');
    await expect(board.getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');
    await expect(board.locator('[data-col="done"]')).not.toContainText('VEL-1');
    await expect(page.getByRole('status')).toBeHidden();
  });

  test('a refused story from the board keeps the title', async ({ page, api }) => {
    await page.goto('/');
    const board = page.getByRole('region', { name: 'Linear' });
    api.fail('POST', '/linear/issues', 400, 'Titeln är för lång.');
    await board.getByLabel('Ny story').fill('Lång titel');
    await board.getByRole('button', { name: 'Lägg till' }).click();

    await expect(board.locator('.tile-error')).toHaveText('Titeln är för lång.');
    await expect(board.getByLabel('Ny story')).toHaveValue('Lång titel');
  });

  test('a refused story in the sheet keeps the form', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Linear' }).click();
    const sheet = page.getByRole('dialog', { name: 'Linear' });
    await sheet.getByRole('button', { name: /Ny story/ }).click();
    const form = sheet.getByRole('form', { name: 'Ny story' });
    await form.getByLabel('Titel').fill('Något');

    api.fail('POST', '/linear/issues', 400, 'Titeln är för lång.');
    await form.getByRole('button', { name: 'Skapa story' }).click();

    await expect(sheet.getByRole('alert')).toHaveText('Titeln är för lång.');
    await expect(form.getByLabel('Titel')).toHaveValue('Något');
  });

  test('the sheet shows that it is fetching', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Linear' }).getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');
    const release = api.hold('GET', '/linear/issues');
    await page.getByRole('navigation').getByRole('button', { name: 'Linear' }).click();
    const sheet = page.getByRole('dialog', { name: 'Linear' });
    await expect(sheet.getByRole('heading', { name: 'Hämtar stories…' })).toBeVisible();
    release();
    await expect(sheet.getByRole('heading', { name: '3 öppna stories.' })).toBeVisible();
  });
});

test.describe('the inbox', () => {
  test('a failing action in the sheet shows the reason and keeps the choices', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name: 'Inkorg' }).click();
    const dialog = page.getByRole('dialog', { name: 'Inkorg' });
    api.fail('POST', /\/actions$/, 502, 'Gmail svarar inte.');
    await dialog.getByRole('button', { name: /^Arkivera/ }).click();

    await expect(banner(page)).toContainText('Gmail svarar inte.');
    await expect(dialog.getByRole('button', { name: /^Arkivera/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '2 saker behöver dig.' })).toBeVisible();
  });

  test('clearing the noise can fail too', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name: 'Inkorg' }).click();
    api.fail('POST', '/inbox/clear-noise', 502, 'Gmail svarar inte.');
    await page.getByRole('button', { name: 'Rensa brus' }).click();
    await expect(banner(page)).toContainText('Gmail svarar inte.');
  });
});

test.describe('a project', () => {
  test('shows Linear\'s reason in the stories', async ({ page, api }) => {
    await page.goto('/');
    api.fail('GET', '/projects/veloq-os/stories', 502, 'Linear svarar inte.');
    await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Projekt: Veloq OS' }).getByRole('region', { name: 'Stories' })).toContainText('Linear svarar inte.');
    await expect(page.getByRole('navigation')).toContainText('Online');
  });

  test('shows that it is fetching the stories', async ({ page, api }) => {
    await page.goto('/');
    const release = api.hold('GET', '/projects/veloq-os/stories');
    await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();
    const stories = page.getByRole('dialog', { name: 'Projekt: Veloq OS' }).getByRole('region', { name: 'Stories' });
    await expect(stories).toContainText('Hämtar stories…');
    release();
    await expect(stories).toContainText('Visa CI i orbiten');
  });
});

test('a slow disk reading does not hold back the rest', async ({ page, api }) => {
  const release = api.hold('GET', '/system');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Disk' })).toContainText('…');
  release();
  await expect(page.getByRole('region', { name: 'Disk' })).toContainText('3,2 GB ledigt av 460,0 GB');
});

test.describe('things that used to fail in silence', () => {
  test('a swiped mail comes back when the API says no', async ({ page, api }) => {
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Inkorg' });
    await expect(panel.getByRole('article')).toHaveAccessibleName(/^GitHub/);

    api.fail('POST', /\/actions$/, 502, 'Gmail svarar inte.');
    await panel.getByRole('button', { name: 'Arkivera' }).click();

    await expect(banner(page)).toContainText('Gmail svarar inte.');
    await expect(panel.getByRole('article')).toHaveAccessibleName(/^GitHub/);

    api.heal();
    await panel.getByRole('button', { name: 'Arkivera' }).click();
    await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
    await expect(panel.getByRole('article')).toHaveAccessibleName(/^\[Avsändare\]/);
  });

  for (const [name, path, start] of [
    ['a key in the skills panel', '/chores/memory-cleanup/run', (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta Städa minnet' }).click()],
    ['the scan on the disk panel', '/chores/disk-cleanup/run', (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Disk' }).getByRole('button', { name: 'Skanna disken' }).click()],
    ['the disk warning in the top bar', '/chores/disk-cleanup/run', (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Disken är nästan full/ }).click()],
    ['the sync on the artifacts panel', '/chores/sync-artifacts/run', (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synka' }).click()],
  ] as const) {
    test(`${name} says why it could not start`, async ({ page, api }) => {
      await page.goto('/');
      api.fail('POST', path, 409, 'Det kör redan ett sådant jobb.');
      await start(page);
      await expect(page.getByRole('status')).toHaveText('Det kör redan ett sådant jobb.');
      expect(api.jobs).toEqual([]);
    });
  }

  test('a chore from the skills sheet says why it could not start', async ({ page, api }) => {
    await page.goto('/');
    api.fail('POST', '/chores/sync-projects/run', 409, 'Det kör redan ett sådant jobb.');
    await page.getByRole('navigation').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: 'Kör Synka projekt' }).click();
    await expect(page.getByRole('status')).toHaveText('Det kör redan ett sådant jobb.');
  });

  test('a routine toggle goes back when saving fails', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click();
    const sheet = page.getByRole('dialog', { name: 'Rutiner' });

    api.fail('PUT', '/routines/week-review', 500, 'Kunde inte spara rutinen.');
    await sheet.getByRole('button', { name: 'Slå på Veckorevy' }).click();

    await expect(banner(page)).toContainText('Kunde inte spara rutinen.');
    await expect(sheet.getByRole('button', { name: 'Slå på Veckorevy' })).toHaveAttribute('aria-pressed', 'false');
  });
});
