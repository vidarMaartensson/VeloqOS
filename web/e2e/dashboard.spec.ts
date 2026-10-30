import { expect, test, type Page } from '@playwright/test';
import { artifacts, calendarConnected, calendarDisconnected, chores, inbox, overview, projects, routines, runningJob } from '../src/test/fixtures';

/** A small in-memory fake of the API so the e2e tests run without the .NET backend. */
async function mockApi(page: Page) {
  const state = {
    inbox: structuredClone(inbox),
    calendar: structuredClone(calendarDisconnected),
    jobs: [] as ReturnType<typeof runningJob>[],
  };

  // Match on the path prefix: a '**/api/**' glob also catches Vite's own modules under src/api/.
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/overview') return json({ ...overview, inboxNeedsYou: state.inbox.filter((i) => !i.handledWith && (i.tag === 'Åtgärd' || i.tag === 'Svar')).length });
    if (path === '/projects') return json(projects);
    if (path === '/chores') return json(chores);
    if (path === '/jobs') return json(state.jobs);
    if (path === '/routines') return json(routines);
    if (path === '/artifacts') return json(artifacts);
    if (path === '/inbox') return json(state.inbox);
    if (path === '/calendar') return json(state.calendar);
    if (path === '/calendar/connect') {
      state.calendar = structuredClone(calendarConnected);
      return json({ connected: true, authUrl: null });
    }
    const run = path.match(/^\/chores\/(.+)\/run$/);
    if (run) {
      const job = runningJob(run[1]);
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const act = path.match(/^\/inbox\/(.+)\/actions$/);
    if (act) {
      const item = state.inbox.find((i) => i.id === act[1])!;
      item.handledWith = method === 'DELETE' ? null : route.request().postDataJSON().action;
      return json(item);
    }
    if (path === '/prompt') return json({ reply: 'Uppfattat. Jag gör en plan först.' });
    return json({ error: `no mock for ${method} ${path}` }, 404);
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('shows the dashboard with orbit, stats and artifacts', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vidar.');
  await expect(page.getByRole('button', { name: 'HaloDeck, I utveckling' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Inkorg: 2 behöver dig/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Yagi Sports logo/ })).toHaveAttribute('href', 'https://claude.ai/artifact/a2');
});

test('runs a chore from the orbit core', async ({ page }) => {
  await page.getByRole('button', { name: 'Kör chore: Städa minnet' }).click();
  await expect(page.getByRole('region', { name: 'Orbit: projekt och chores' })).toContainText('Städa minnet…');
  await expect(page.getByRole('progressbar', { name: 'Städa minnet' })).toBeVisible();
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

test('connects the calendar and shows the day', async ({ page }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await calendar.getByRole('button', { name: /Anslut Google Kalender/ }).click();
  await expect(calendar.getByText('Fokus · Halo Home motion')).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Boka Fokus · Halo Home motion' })).toBeVisible();
});

test('prompts about a project picked in the orbit', async ({ page }) => {
  await page.getByRole('button', { name: 'Veloq OS, Design' }).click();
  await page.getByRole('button', { name: 'Prompta' }).click();
  const sheet = page.getByRole('dialog', { name: 'Prompt' });
  await expect(sheet).toContainText('Prompt · Veloq OS');
  await sheet.getByLabel('Meddelande').fill('Sätt upp CI');
  await sheet.getByRole('button', { name: 'Skicka' }).click();
  await expect(sheet).toContainText('Uppfattat. Jag gör en plan först.');
});
