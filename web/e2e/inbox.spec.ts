import { drag, expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('archives the top mail from the inbox panel', async ({ page, api }) => {
  const panel = page.getByRole('region', { name: 'Inkorg' });
  await expect(panel).toContainText('CI misslyckades på main');
  await panel.getByRole('button', { name: 'Arkivera' }).click();
  await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
  await expect(page.getByRole('button', { name: 'Behöver dig: 1' })).toBeVisible();
});

test('opens the inbox from the menu and acts on an item', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name: 'Inkorg' }).click();
  const dialog = page.getByRole('dialog', { name: 'Inkorg' });
  await expect(dialog.getByRole('heading', { name: '2 saker behöver dig.' })).toBeVisible();

  await dialog.getByRole('button', { name: /Arkivera/ }).click();
  await expect(dialog.getByRole('status')).toHaveText(/Arkiverat\./);
  await expect(dialog.getByRole('heading', { name: '1 sak behöver dig.' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Ångra' }).click();
  await expect(dialog.getByRole('heading', { name: '2 saker behöver dig.' })).toBeVisible();
});

test.describe('the panel', () => {
  const top = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Inkorg' }).getByRole('article');

  test('stacks what needs you and leaves out the noise', async ({ page }) => {
    const panel = page.getByRole('region', { name: 'Inkorg' });
    await expect(panel).toContainText('3 behöver dig');
    await expect(panel.getByRole('article')).toHaveCount(1);
    await expect(panel.locator('.mail')).toHaveCount(3);
    await expect(panel).not.toContainText('[rubrik]');
  });

  test('saves the top mail for tomorrow', async ({ page, api }) => {
    await page.getByRole('region', { name: 'Inkorg' }).getByRole('button', { name: 'Senare' }).click();
    await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('snooze');
    await expect(top(page)).toHaveAccessibleName(/^\[Avsändare\]: Re: \[ämne\]/);
  });

  test('archives with the right arrow and snoozes with the left', async ({ page, api }) => {
    await top(page).press('ArrowRight');
    await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
    await expect(top(page)).toHaveAccessibleName(/^\[Avsändare\]/);

    await top(page).press('ArrowLeft');
    await expect.poll(() => api.inbox.find((i) => i.id === 'm2')?.handledWith).toBe('snooze');
  });

  test('opens the top mail with Enter', async ({ page }) => {
    await top(page).press('Enter');
    await expect(page.getByRole('dialog', { name: 'Inkorg' }).getByRole('heading', { name: 'CI misslyckades på main' })).toBeVisible();
  });

  test('opens the top mail with a click', async ({ page }) => {
    await top(page).click();
    await expect(page.getByRole('dialog', { name: 'Inkorg' }).getByRole('heading', { name: 'CI misslyckades på main' })).toBeVisible();
  });

  test('swipes right to archive and left for tomorrow', async ({ page, api }) => {
    await drag(page, top(page), 160, 0);
    await expect.poll(() => api.inbox.find((i) => i.id === 'm1')?.handledWith).toBe('archive');
    await expect(top(page)).toHaveAccessibleName(/^\[Avsändare\]/);

    await drag(page, top(page), -160, 0);
    await expect.poll(() => api.inbox.find((i) => i.id === 'm2')?.handledWith).toBe('snooze');
  });

  test('a short swipe does nothing', async ({ page, api }) => {
    await drag(page, top(page), 60, 0);
    await expect(top(page)).toHaveAccessibleName(/^GitHub/);
    expect(api.inbox.every((i) => !i.handledWith)).toBe(true);
    await expect(page.getByRole('dialog', { name: 'Inkorg' })).toBeHidden();
  });

  test('is empty once everything is handled', async ({ page, api }) => {
    api.inbox.forEach((i) => (i.handledWith = 'archive'));
    await page.reload();
    const panel = page.getByRole('region', { name: 'Inkorg' });
    await expect(panel).toContainText('Inkorgen är tom. Jag är nästan imponerad.');
    await expect(panel.getByRole('button', { name: 'Arkivera' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Senare' })).toBeDisabled();
  });

  test('opens the whole inbox', async ({ page }) => {
    await page.getByRole('region', { name: 'Inkorg' }).getByRole('button', { name: 'Alla' }).click();
    await expect(page.getByRole('dialog', { name: 'Inkorg' })).toBeVisible();
  });
});

test.describe('the sheet', () => {
  const open = async (page: import('@playwright/test').Page) => {
    await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('button', { name: 'Inkorg' }).click();
    return page.getByRole('dialog', { name: 'Inkorg' });
  };

  test('filters by tag and counts what is open', async ({ page }) => {
    const dialog = await open(page);
    const list = dialog.getByRole('list', { name: 'Mejl' }).getByRole('listitem');
    await expect(list).toHaveCount(4);
    await expect(dialog.getByRole('button', { name: 'Alla4' })).toHaveAttribute('aria-pressed', 'true');

    await dialog.getByRole('button', { name: 'Brus1' }).click();
    await expect(list).toHaveCount(1);
    await expect(list).toContainText('[Nyhetsbrev]');
  });

  test('shows the chosen mail with its summary and suggestion', async ({ page }) => {
    const dialog = await open(page);
    await dialog.getByRole('button', { name: /Re: \[ämne\]/ }).click();
    await expect(dialog.getByRole('heading', { name: 'Re: [ämne]' })).toBeVisible();
    await expect(dialog).toContainText('Vill ha besked.');
    await expect(dialog).toContainText('Förslag: svara med utkastet');
  });

  for (const [title, action, result] of [
    [/^Låt Veloq OS/, 'delegate', 'Veloq OS tar hand om det.'],
    [/^Arkivera/, 'archive', 'Arkiverat.'],
    [/^Gör till uppgift/, 'task', 'Lagt som uppgift i projektet.'],
    [/^Påminn senare/, 'snooze', 'Kommer tillbaka i inkorgen i morgon 08:00.'],
    [/^Lägg i kalendern/, 'calendar', 'Inlagt i kalendern och svar skickat.'],
  ] as const) {
    test(`runs ${action} and tells you what happened`, async ({ page, api }) => {
      const dialog = await open(page);
      await dialog.getByRole('button', { name: title }).click();
      await expect(dialog.getByRole('status')).toContainText(result);
      expect(api.requests.find((r) => r.path === '/inbox/m1/actions')?.body).toEqual({ action });
    });
  }

  test('adding to the calendar reads the calendar again', async ({ page, api }) => {
    const dialog = await open(page);
    const before = api.requests.filter((r) => r.path === '/calendar').length;
    await dialog.getByRole('button', { name: /^Lägg i kalendern/ }).click();
    await expect(dialog.getByRole('status')).toBeVisible();
    await expect.poll(() => api.requests.filter((r) => r.path === '/calendar').length).toBeGreaterThan(before);
  });

  test('replies with the edited draft, which cannot be undone', async ({ page, api }) => {
    const dialog = await open(page);
    await dialog.getByRole('button', { name: /Re: \[ämne\]/ }).click();
    await dialog.getByRole('button', { name: /^Svara/ }).click();

    const draft = dialog.getByLabel('Utkast till svar');
    await expect(draft).toHaveValue('Hej [namn]');
    await draft.fill('');
    await expect(dialog.getByRole('button', { name: /Skicka svar/ })).toBeDisabled();

    await draft.fill('Hej, det blir bra.');
    await dialog.getByRole('button', { name: /Skicka svar/ }).click();

    await expect(dialog.getByRole('status')).toContainText('Svar skickat.');
    await expect(dialog.getByRole('button', { name: 'Ångra' })).toBeHidden();
    expect(api.requests.find((r) => r.path === '/inbox/m2/actions')?.body).toEqual({ action: 'reply', body: 'Hej, det blir bra.' });
  });

  test('starts from a template when the mail has no draft, and a cancelled reply sends nothing', async ({ page, api }) => {
    const dialog = await open(page);
    await dialog.getByRole('button', { name: /^Svara/ }).click();
    await expect(dialog.getByLabel('Utkast till svar')).toHaveValue(/^Hej,\n\n\[Ditt svar här\]/);

    await dialog.getByRole('button', { name: 'Avbryt' }).click();
    await expect(dialog.getByLabel('Utkast till svar')).toBeHidden();
    expect(api.requests.some((r) => r.path.endsWith('/actions'))).toBe(false);
  });

  test('clears the noise', async ({ page, api }) => {
    const dialog = await open(page);
    await dialog.getByRole('button', { name: 'Rensa brus' }).click();
    await expect(dialog.getByRole('button', { name: /\[Nyhetsbrev\]/ })).toContainText('Arkiverat');
    expect(api.inbox.find((i) => i.id === 'm4')?.handledWith).toBe('archive');
    await expect(dialog.getByRole('button', { name: 'Brus0' })).toBeVisible();
  });

  test('says when everything is handled', async ({ page, api }) => {
    api.inbox.forEach((i) => (i.handledWith = 'archive'));
    await page.reload();
    await expect((await open(page)).getByRole('heading', { name: 'Allt är hanterat.' })).toBeVisible();
  });

  test('closes with its button', async ({ page }) => {
    const dialog = await open(page);
    await dialog.getByRole('button', { name: 'Stäng inkorgen' }).click();
    await expect(dialog).toBeHidden();
  });
});
