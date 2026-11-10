import { calendarConnected } from '../src/test/fixtures';
import { drag, expect, plainPersona, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('moves a calendar event a quarter and a story to done', async ({ page, api }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await calendar.getByRole('button', { name: /Anslut Google/ }).click();
  await calendar.getByRole('button', { name: /^\[Möte\], 08:30–09:00/ }).press('ArrowDown');
  await expect.poll(() => api.moves[0]).toEqual({ id: '20261029-e1', body: { start: '2026-10-29T08:45:00+01:00', end: '2026-10-29T09:15:00+01:00' } });

  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');
  await expect.poll(() => api.moves[1]).toEqual({ id: 'VEL-1', body: { stateId: 'done' } });
  await expect(board.getByRole('list', { name: 'Klart' })).toContainText('VEL-1');
});

test('connects the calendar and shows the day', async ({ page }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await calendar.getByRole('button', { name: /Anslut Google/ }).click();
  await expect(calendar.getByText('Fokus · Halo Home motion')).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Boka Fokus · Halo Home motion' })).toBeVisible();
});

test('adds an event to the calendar', async ({ page }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await calendar.getByRole('button', { name: /Anslut Google/ }).click();
  await calendar.getByRole('button', { name: /Ny händelse/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
  await sheet.getByLabel('Titel').fill('Tandläkare');
  await sheet.getByLabel('Start').fill('10:00');
  await sheet.getByLabel('Slut').fill('10:45');
  await sheet.getByLabel('Plats').fill('Sveavägen 1');
  await sheet.getByRole('button', { name: /Lägg in/ }).click();

  await expect(sheet).toBeHidden();
  await expect(calendar.getByRole('button', { name: /^Tandläkare, 10:00–10:45/ })).toBeVisible();
});

test.describe('with the calendar connected', () => {
  test.beforeEach(async ({ page, api }) => {
    api.calendar = structuredClone(calendarConnected);
    await page.reload();
  });

  test('shows where the day is right now and moves the marker as time passes', async ({ page }) => {
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await expect(calendar.getByText('Nu 15:20')).toBeVisible();
    await page.clock.fastForward('10:00');
    await expect(calendar.getByText('Nu 15:30')).toBeVisible();
  });

  test('switches to tomorrow and back', async ({ page, api }) => {
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await calendar.getByRole('button', { name: 'I morgon' }).click();

    await expect(calendar.getByRole('button', { name: 'I morgon' })).toHaveAttribute('aria-pressed', 'true');
    await expect(calendar.getByText('Inget inbokat mellan 08:00 och 19:00.')).toBeVisible();
    await expect(calendar.getByText(/^Nu /)).toBeHidden();
    expect(api.requests.filter((r) => r.path === '/calendar').at(-1)?.search).toBe('?date=2026-10-30');

    await calendar.getByRole('button', { name: 'I dag' }).click();
    await expect(calendar.getByRole('button', { name: /^\[Möte\]/ })).toBeVisible();
  });

  test('books a suggestion, which then counts as a meeting', async ({ page }) => {
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await expect(page.getByRole('button', { name: 'Möten kvar: 1' })).toBeVisible();

    await calendar.getByRole('button', { name: 'Boka Fokus · Halo Home motion' }).click();

    await expect(calendar.getByRole('button', { name: /^Fokus · Halo Home motion, 16:00–18:00/ })).toBeVisible();
    await expect(calendar.getByRole('button', { name: /^Boka/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Möten kvar: 2' })).toBeVisible();
  });

  test('moves an event with the arrow keys and says so', async ({ page, api }) => {
    const event = page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^\[Möte\]/ });
    await event.press('ArrowDown');

    await expect(page.getByRole('status').filter({ hasText: 'Flyttat till 08:45. Google har fått veta.' })).toBeVisible();
    await expect(event).toContainText('08:45–09:15');
    expect(api.moves).toEqual([{ id: '20261029-e1', body: { start: '2026-10-29T08:45:00+01:00', end: '2026-10-29T09:15:00+01:00' } }]);
  });

  test('the toast goes away by itself', async ({ page }) => {
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^\[Möte\]/ }).press('ArrowDown');
    const toast = page.getByRole('status').filter({ hasText: 'Flyttat till' });
    await expect(toast).toBeVisible();
    await page.clock.fastForward(4000);
    await expect(toast).toBeHidden();
  });

  test('drags an event an hour later with the mouse', async ({ page, api }) => {
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await drag(page, calendar.getByRole('button', { name: /^\[Möte\]/ }), 0, 44);

    await expect.poll(() => api.moves).toEqual([{ id: '20261029-e1', body: { start: '2026-10-29T09:30:00+01:00', end: '2026-10-29T10:00:00+01:00' } }]);
    await expect(calendar.getByRole('button', { name: /^\[Möte\], 09:30–10:00/ })).toBeVisible();
  });

  test('a drag onto another meeting springs back and tells you why', async ({ page, api }) => {
    const calendar = page.getByRole('region', { name: 'Kalender' });
    const event = calendar.getByRole('button', { name: /^\[Möte\]/ });
    await drag(page, event, 0, 6.5 * 44);

    await expect(page.getByRole('status')).toContainText('Krockar med Pågående möte.');
    await expect(event).toContainText('08:30–09:00');
    expect(api.moves).toEqual([]);
  });

  test('a move onto a suggestion is fine, since suggestions are not booked', async ({ page, api }) => {
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^Pågående möte/ }).press('ArrowDown');
    await expect.poll(() => api.moves.map((m) => m.id)).toEqual(['20261029-e2']);
  });

  test('a suggestion cannot be dragged or moved with the keys', async ({ page, api }) => {
    const suggestion = page.locator('.cal-ev.suggested');
    await drag(page, suggestion, 0, 44);
    await suggestion.press('ArrowDown').catch(() => undefined);
    expect(api.moves).toEqual([]);
  });
});

test('says a collision plainly with the neutral persona', async ({ page, api }) => {
  api.calendar = {
    ...structuredClone(calendarConnected),
    events: [
      { id: 'a', title: 'Först', start: '2026-10-29T09:00:00+01:00', end: '2026-10-29T09:30:00+01:00', location: null, suggested: false },
      { id: 'b', title: 'Sen', start: '2026-10-29T09:30:00+01:00', end: '2026-10-29T10:00:00+01:00', location: null, suggested: false },
    ],
  };
  await plainPersona(page);
  await page.reload();

  await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /^Först/ }).press('ArrowDown');
  await expect(page.getByRole('status')).toHaveText('Krockar med Sen.');
  expect(api.moves).toEqual([]);
});

test('sends you to Google when connecting needs a sign-in', async ({ page, api }) => {
  api.authUrl = 'http://localhost:7470/google-sign-in';
  await page.route('**/google-sign-in', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Google</h1>' }));

  await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: /Anslut Google/ }).click();
  await expect(page).toHaveURL(/google-sign-in$/);
});

test('looks again when you come back from signing in elsewhere', async ({ page, api }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await expect(calendar.getByText('Kalendern är inte ansluten.')).toBeVisible();

  api.calendar = structuredClone(calendarConnected);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(calendar.getByRole('button', { name: /^\[Möte\]/ })).toBeVisible();
});

test.describe('the new event sheet', () => {
  test.beforeEach(async ({ page, api }) => {
    api.calendar = structuredClone(calendarConnected);
    await page.reload();
    await page.getByRole('region', { name: 'Kalender' }).getByRole('button', { name: 'Ny händelse' }).click();
  });

  test('starts on the next whole hour with the title in focus', async ({ page }) => {
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    await expect(sheet.getByLabel('Titel')).toBeFocused();
    await expect(sheet.getByLabel('Datum')).toHaveValue('2026-10-29');
    await expect(sheet.getByLabel('Start')).toHaveValue('16:00');
    await expect(sheet.getByLabel('Slut')).toHaveValue('17:00');
  });

  test('needs a title and an end after the start', async ({ page }) => {
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    const submit = sheet.getByRole('button', { name: /Lägg in/ });
    await expect(submit).toBeDisabled();

    await sheet.getByLabel('Titel').fill('Tandläkare');
    await expect(submit).toBeEnabled();

    await sheet.getByLabel('Slut').fill('15:00');
    await expect(sheet.getByRole('alert')).toHaveText('Slutet måste ligga efter starten.');
    await expect(submit).toBeDisabled();
  });

  test('moves the end along when the start passes it', async ({ page }) => {
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    await sheet.getByLabel('Start').fill('18:30');
    await expect(sheet.getByLabel('Slut')).toHaveValue('19:30');
  });

  test('adds to another day and shows that day', async ({ page, api }) => {
    const sheet = page.getByRole('dialog', { name: 'Ny händelse' });
    await sheet.getByLabel('Titel').fill('Tandläkare');
    await sheet.getByLabel('Datum').fill('2026-10-30');
    await sheet.getByRole('button', { name: /Lägg in/ }).click();

    await expect(sheet).toBeHidden();
    const calendar = page.getByRole('region', { name: 'Kalender' });
    await expect(calendar.getByRole('button', { name: 'I morgon' })).toHaveAttribute('aria-pressed', 'true');
    await expect(calendar.getByRole('button', { name: /^Tandläkare, 16:00–17:00/ })).toBeVisible();
    expect(api.requests.find((r) => r.path === '/calendar/events')?.body).toEqual({ title: 'Tandläkare', start: '2026-10-30T16:00:00+01:00', end: '2026-10-30T17:00:00+01:00', location: null });
  });
});
