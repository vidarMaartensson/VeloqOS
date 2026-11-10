import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('adds a story by voice and it flies into the Linear board', async ({ page, api }) => {
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('Lägg till en story om portalen');
  await voice.getByLabel('Skriv till Rick').press('Enter');

  await expect(voice).toContainText('Klart. VEL-151 ligger i backloggen.');
  await expect(voice.getByRole('list', { name: 'Verktyg som kördes' })).toContainText('create_issue · Skapade VEL-151 · Portalen');
  await expect(page.getByRole('region', { name: 'Linear' })).toContainText('Portalen');
  expect(api.voice[0]).toMatchObject({ text: 'Lägg till en story om portalen', persona: { id: 'rick' } });
});

test('cleans the disk by voice only after an ok, picking bubbles in the portal', async ({ page, api }) => {
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('Städa disken');
  await voice.getByLabel('Skriv till Rick').press('Enter');
  await expect(voice.getByRole('group', { name: 'Väntar på ditt ok' })).toContainText('2 saker kan rensas · 14,2 GB');
  expect(api.confirmed).toEqual([]);

  const disk = page.getByRole('region', { name: 'Disk' });
  await disk.getByRole('button', { name: /^npm, 4,4 GB/ }).press('Enter');
  await disk.getByRole('button', { name: 'Rensa 1 · 4,4 GB' }).click();

  await expect.poll(() => api.confirmed).toEqual(['npm']);
  await expect(voice.getByRole('group', { name: 'Väntar på ditt ok' })).toBeHidden();
});

test.describe('asking', () => {
  const voiceOf = (page: Page) => page.getByRole('region', { name: 'Röstassistent' });

  test('greets you and offers something to say', async ({ page }) => {
    await expect(voiceOf(page)).toContainText('Vad vill du, Vidar?');
    await expect(voiceOf(page).getByRole('button', { name: 'Ge mig en rapport' })).toBeVisible();
    await expect(voiceOf(page)).toContainText('Exempelagent');
  });

  test('a suggestion is sent as it stands, and the suggestions then go away', async ({ page, api }) => {
    await voiceOf(page).getByRole('button', { name: 'Ge mig en rapport' }).click();
    await expect(voiceOf(page)).toContainText('Vad?');
    expect(api.voice[0].text).toBe('Ge mig en rapport');
    await expect(voiceOf(page).getByRole('button', { name: 'Ge mig en rapport' })).toBeHidden();
  });

  test('sends nothing empty', async ({ page, api }) => {
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('   ');
    await input.press('Enter');
    await expect(voiceOf(page).getByRole('button', { name: 'Ge mig en rapport' })).toBeVisible();
    expect(api.voice).toEqual([]);
  });

  test('clears the field and locks it while it thinks', async ({ page, api }) => {
    const release = api.hold('POST', '/voice/turn');
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('Hallå');
    await input.press('Enter');

    await expect(input).toHaveValue('');
    await expect(input).toBeDisabled();
    await expect(voiceOf(page)).toContainText('Tänker…');
    await expect(page.getByRole('img', { name: 'Rick: Tänker…' })).toBeVisible();

    release();
    await expect(voiceOf(page)).toContainText('Vad?');
    await expect(input).toBeEnabled();
  });

  test('sends the earlier lines along', async ({ page, api }) => {
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('Ett');
    await input.press('Enter');
    await expect(voiceOf(page)).toContainText('Vad?');
    await expect(input).toBeEnabled();
    await input.fill('Två');
    await input.press('Enter');

    await expect.poll(() => api.voice.length).toBe(2);
    expect(api.voice[1].history).toEqual([{ role: 'user', text: 'Ett' }, { role: 'assistant', text: 'Vad?' }]);
  });

  test('shows only the four latest lines', async ({ page }) => {
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    for (const text of ['Ett', 'Två', 'Tre']) {
      await input.fill(text);
      await input.press('Enter');
      await expect(voiceOf(page).locator('.vline.user').last()).toHaveText(text);
      await expect(input).toBeEnabled();
    }
    await expect(voiceOf(page).locator('.vline')).toHaveCount(4);
    await expect(voiceOf(page).locator('.voice-log')).not.toContainText('Ett');
  });

  test('marks the burp in the text and leaves it out of the speech', async ({ page }) => {
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('En story om portalen');
    await input.press('Enter');

    await expect(voiceOf(page).locator('.burp')).toHaveAttribute('aria-label', 'rap');
    await expect.poll(() => page.evaluate(() => window.__speech.spoken)).toEqual(['Klart. VEL-151 ligger i backloggen.', 'Försök hålla den vid liv.']);
  });

  test('shows a tool that failed', async ({ page, api }) => {
    api.answer('POST', '/voice/turn', { reply: 'Det gick inte.', actions: [{ tool: 'create_issue', tile: 'linear', summary: 'Linear svarar inte', ok: false }], confirm: null });
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('Hallå');
    await input.press('Enter');
    await expect(voiceOf(page).locator('.tool.bad')).toHaveText('create_issue · Linear svarar inte');
  });

  for (const [tile, path] of [['calendar', '/calendar'], ['inbox', '/inbox'], ['disk', '/jobs'], ['artifacts', '/artifacts'], ['projects', '/projects/status']] as const) {
    test(`reads the ${tile} panel again after a tool touched it`, async ({ page, api }) => {
      api.answer('POST', '/voice/turn', { reply: 'Klart.', actions: [{ tool: 'x', tile, summary: 'Gjort', ok: true }], confirm: null });
      const before = api.requests.filter((r) => r.path === path).length;
      const input = voiceOf(page).getByLabel('Skriv till Rick');
      await input.fill('Hallå');
      await input.press('Enter');
      await expect.poll(() => api.requests.filter((r) => r.path === path).length).toBeGreaterThan(before);
    });
  }
});

test.describe('the ok on screen', () => {
  const ask = async (page: Page) => {
    const voice = page.getByRole('region', { name: 'Röstassistent' });
    await voice.getByLabel('Skriv till Rick').fill('Städa disken');
    await voice.getByLabel('Skriv till Rick').press('Enter');
    return voice.getByRole('group', { name: 'Väntar på ditt ok' });
  };

  test('approves all of it at once', async ({ page, api }) => {
    const confirm = await ask(page);
    await confirm.getByRole('button', { name: 'Rensa allt' }).click();
    await expect.poll(() => api.confirmed).toEqual(['gradle', 'npm']);
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Rensar. Försök att inte fylla den igen innan fredag.');
  });

  test('"not now" removes nothing', async ({ page, api }) => {
    const confirm = await ask(page);
    await confirm.getByRole('button', { name: 'Inte nu' }).click();
    await expect(confirm).toBeHidden();
    expect(api.confirmed).toEqual([]);
    await expect(page.getByRole('region', { name: 'Disk' }).getByRole('button', { name: /^npm/ })).toBeVisible();
  });

  test('shows the way to the disk panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    const confirm = await ask(page);
    await confirm.getByRole('button', { name: 'Visa i disken' }).click();
    await expect(page.getByRole('region', { name: 'Disk' })).toBeInViewport();
    await expect(confirm).toBeVisible();
  });
});

test.describe('push to talk', () => {
  const voiceOf = (page: Page) => page.getByRole('region', { name: 'Röstassistent' });

  /** Holds space once the page is up and the voice knows how it listens. */
  const holdSpace = async (page: Page) => {
    await expect(voiceOf(page).locator('.voice-head .meta')).not.toHaveText('…');
    await page.keyboard.down('Space');
  };

  test('holding the button listens, shows the words and sends on release', async ({ page, api }) => {
    const mic = voiceOf(page).getByRole('button', { name: 'Håll inne för att prata' });
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    const listening = voiceOf(page).getByRole('button', { name: 'Släpp för att skicka' });
    await expect(listening).toHaveAttribute('aria-pressed', 'true');
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Lyssnar…');

    await page.evaluate(() => window.__speech.hear('Städa disken'));
    await expect(voiceOf(page).locator('.partial')).toHaveText('Städa disken');

    await page.mouse.up();
    await expect.poll(() => api.voice[0]?.text).toBe('Städa disken');
  });

  test('space works anywhere on the page', async ({ page, api }) => {
    await holdSpace(page);
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Lyssnar…');
    await page.evaluate(() => window.__speech.hear('Hej'));
    await page.keyboard.up('Space');
    await expect.poll(() => api.voice[0]?.text).toBe('Hej');
  });

  test('space in a field is just a space', async ({ page }) => {
    const input = voiceOf(page).getByLabel('Skriv till Rick');
    await input.fill('a');
    await input.press('Space');
    await expect(input).toHaveValue('a ');
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Håll inne för att prata');
  });

  test('sends nothing when nothing was heard', async ({ page, api }) => {
    await holdSpace(page);
    await page.keyboard.up('Space');
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Håll inne för att prata');
    expect(api.voice).toEqual([]);
  });

  test('"quiet" cancels the listening', async ({ page, api }) => {
    await holdSpace(page);
    await page.evaluate(() => window.__speech.hear('Ta bort allt'));
    await voiceOf(page).getByRole('button', { name: 'Tyst' }).click();
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Håll inne för att prata');
    await page.keyboard.up('Space');
    expect(api.voice).toEqual([]);
  });

  test('"quiet" stops the speech', async ({ page }) => {
    await page.evaluate(() => (window.__speech.hold = true));
    await voiceOf(page).getByLabel('Skriv till Rick').fill('Hallå');
    await voiceOf(page).getByLabel('Skriv till Rick').press('Enter');
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Pratar…');

    await voiceOf(page).getByRole('button', { name: 'Tyst' }).click();
    await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Håll inne för att prata');
  });

  test('a browser that cannot listen says to type', async ({ page }) => {
    await page.addInitScript(() => Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }));
    await page.reload();
    await holdSpace(page);
    await expect(voiceOf(page)).toContainText('Den här webbläsaren kan inte lyssna. Skriv i stället.');
    await page.keyboard.up('Space');
  });

  test.describe('with Deepgram', () => {
    test.beforeEach(({ api }) => {
      api.voiceStatus = { agent: 'claude', model: 'claude-opus-5-5', speech: { listen: 'deepgram', speak: 'browser' }, voiceId: null };
    });

    test('says so when the microphone is refused', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new Error('nej')) } });
      });
      await page.reload();
      await holdSpace(page);
      await expect(voiceOf(page)).toContainText('Fick inte använda mikrofonen.');
      await page.keyboard.up('Space');
    });

    test('records, lets the API transcribe and sends the text', async ({ page, api }) => {
      api.answer('POST', '/voice/transcribe', { text: 'Städa disken' });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) } });
        class FakeRecorder {
          mimeType = 'audio/webm';
          ondataavailable: ((e: { data: Blob }) => void) | null = null;
          onstop: (() => void) | null = null;
          start() {}
          stop() {
            this.ondataavailable?.({ data: new Blob(['ljud']) });
            this.onstop?.();
          }
        }
        Object.assign(window, { MediaRecorder: FakeRecorder });
      });
      await page.reload();
      await expect(voiceOf(page)).toContainText('Claude');
      await holdSpace(page);
      await expect(voiceOf(page).locator('.voice-phase')).toHaveText('Lyssnar…');
      await page.keyboard.up('Space');

      await expect.poll(() => api.voice[0]?.text).toBe('Städa disken');
      expect(api.requests.some((r) => r.path === '/voice/transcribe')).toBe(true);
    });
  });
});

test.describe('the settings', () => {
  const open = async (page: Page) => {
    await page.getByRole('region', { name: 'Röstassistent' }).getByRole('button', { name: 'Röstinställningar' }).click();
    return page.getByRole('dialog', { name: 'Röstinställningar' });
  };

  test('opens from the rail too', async ({ page }) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Röst' }).click();
    await expect(page.getByRole('dialog', { name: 'Röstinställningar' })).toBeVisible();
  });

  test('switching persona changes who answers, and it survives a reload', async ({ page, api }) => {
    const sheet = await open(page);
    await expect(sheet.getByLabel('Rapningar')).toBeVisible();
    await sheet.getByRole('button', { name: 'Saklig' }).click();
    await expect(sheet.getByLabel('Rapningar')).toBeHidden();
    await sheet.getByRole('button', { name: 'Stäng' }).click();

    const voice = page.getByRole('region', { name: 'Röstassistent' });
    await expect(voice).toContainText('Röst · Assistenten');

    await page.reload();
    await expect(voice).toContainText('Röst · Assistenten');
    await voice.getByLabel('Skriv till Assistenten').fill('Hallå');
    await voice.getByLabel('Skriv till Assistenten').press('Enter');
    await expect.poll(() => api.voice[0]?.persona.id).toBe('neutral');
    expect(api.voice[0].persona.burps).toBe(0);
  });

  test('the sliders show their value and go along with the next turn', async ({ page, api }) => {
    const sheet = await open(page);
    await sheet.getByLabel('Cynism').fill('25');
    await expect(sheet.locator('.vs-row', { hasText: 'Cynism' })).toContainText('25 %');
    await sheet.getByLabel('Rapningar').fill('10');
    await sheet.getByLabel('Tempo').fill('1.2');
    await expect(sheet.locator('.vs-row', { hasText: 'Tempo' })).toContainText('1,20×');
    await sheet.getByRole('button', { name: 'Stäng' }).click();

    const voice = page.getByRole('region', { name: 'Röstassistent' });
    await voice.getByLabel('Skriv till Rick').fill('Hallå');
    await voice.getByLabel('Skriv till Rick').press('Enter');
    await expect.poll(() => api.voice[0]?.persona).toEqual({ id: 'rick', cynism: 25, burps: 10 });
  });

  test('tries the voice', async ({ page }) => {
    const sheet = await open(page);
    await sheet.getByRole('button', { name: 'Testa rösten' }).click();
    await expect.poll(() => page.evaluate(() => window.__speech.spoken[0])).toBe('Det här är jag.');
  });

  test('describes the browser voice and offers its settings', async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet).toContainText('Webbläsarens egen röst.');
    await expect(sheet).toContainText('Lyssnar med webbläsaren · svarar med exempelagenten');
    await expect(sheet.getByLabel('Webbläsarröst')).toBeVisible();
  });

  test('with ElevenLabs the browser settings go away and speech goes through the API', async ({ page, api }) => {
    api.voiceStatus = { agent: 'claude', model: 'claude-opus-5-5', speech: { listen: 'deepgram', speak: 'elevenlabs' }, voiceId: 'v1' };
    await page.reload();
    const sheet = await open(page);
    await expect(sheet).toContainText('ElevenLabs med rösten som är satt i API:t.');
    await expect(sheet).toContainText('Lyssnar med Deepgram · svarar med claude-opus-5-5');
    await expect(sheet.getByLabel('Webbläsarröst')).toBeHidden();
    await expect(sheet.getByLabel('Tempo')).toBeHidden();

    await sheet.getByRole('button', { name: 'Testa rösten' }).click();
    await expect.poll(() => api.requests.filter((r) => r.path === '/voice/speak').map((r) => r.body)).toContainEqual({ text: 'Det här är jag.' });
    // The mock's audio does not play, so the browser's voice takes over.
    await expect.poll(() => page.evaluate(() => window.__speech.spoken[0])).toBe('Det här är jag.');
  });
});
