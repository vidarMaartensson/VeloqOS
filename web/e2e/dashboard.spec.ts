import { expect, test, type Page } from '@playwright/test';
import { artifacts, calendarConnected, calendarDisconnected, chores, diskJob, inbox, linearIssue, linearIssues, linearTeams, linearWorkspaces, overview, projects, routines, runningJob, statuses, systemLow, voiceStatus, waitingJob } from '../src/test/fixtures';

/** A small in-memory fake of the API so the e2e tests run without the .NET backend. */
async function mockApi(page: Page) {
  const state = {
    inbox: structuredClone(inbox),
    calendar: structuredClone(calendarDisconnected),
    jobs: [] as ReturnType<typeof runningJob>[],
    linear: structuredClone(linearIssues),
    runs: [] as { id: string; projectId?: string; argument?: string }[],
    confirmed: [] as string[],
    voice: [] as { text: string; persona: { id: string } }[],
    moves: [] as { id: string; body: Record<string, string> }[],
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
    if (path === '/calendar/events' && method === 'POST') {
      const event = { id: `added-${state.calendar.events.length}`, suggested: false, ...route.request().postDataJSON() };
      state.calendar = { ...state.calendar, events: [...state.calendar.events, event] };
      return json(event, 201);
    }
    const run = path.match(/^\/chores\/(.+)\/run$/);
    if (run) {
      const body = route.request().postDataJSON() ?? {};
      state.runs.push({ id: run[1], ...body });
      // Unused packages comes back at once with a proposal; everything else keeps running.
      const job = run[1] === 'unused-packages'
        ? structuredClone(waitingJob)
        : { ...runningJob(run[1]), project: projects.find((p) => p.id === body.projectId)?.name ?? null };
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const confirm = path.match(/^\/jobs\/(.+)\/confirm$/);
    if (confirm) {
      state.confirmed = route.request().postDataJSON().choices;
      state.jobs = state.jobs.map((j) => (j.id === confirm[1] ? { ...j, choices: null, confirm: null } : j));
      const job = { ...runningJob('unused-packages'), id: 'job-remove', project: 'Veloq OS' };
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const act = path.match(/^\/inbox\/(.+)\/actions$/);
    if (act) {
      const item = state.inbox.find((i) => i.id === act[1])!;
      item.handledWith = method === 'DELETE' ? null : route.request().postDataJSON().action;
      return json(item);
    }
    if (path === '/linear') return json({ configured: true, workspaces: linearWorkspaces });
    if (path === '/linear/teams') return json(linearTeams);
    if (path === '/linear/issues' && method === 'GET') return json(state.linear);
    if (path === '/linear/issues' && method === 'POST') {
      const body = route.request().postDataJSON();
      const team = linearTeams.find((t) => t.id === body.teamId)!;
      const issue = { ...linearIssue(state.linear.length + 1, team.states.find((x) => x.id === body.stateId) ?? team.states[0], body.priority), title: body.title };
      state.linear = [issue, ...state.linear];
      return json(issue, 201);
    }
    if (path === '/voice') return json(voiceStatus);
    if (path === '/voice/turn') {
      const body = route.request().postDataJSON();
      state.voice.push(body);
      if (/story/i.test(body.text)) {
        const issue = { ...linearIssue(151), title: 'Portalen' };
        state.linear = [issue, ...state.linear];
        return json({ reply: 'Klart. VEL-151 ligger i backloggen. *rap* Försök hålla den vid liv.', actions: [{ tool: 'create_issue', tile: 'linear', summary: 'Skapade VEL-151 · Portalen', ok: true }], confirm: null });
      }
      if (/disk/i.test(body.text)) {
        state.jobs = [structuredClone(diskJob), ...state.jobs];
        return json({ reply: 'Två saker kan bort. Säg ja på skärmen.', actions: [{ tool: 'scan_disk', tile: 'disk', summary: '2 saker att rensa', ok: true }], confirm: { jobId: diskJob.id, label: 'Rensa valda', choices: diskJob.choices } });
      }
      return json({ reply: 'Vad?', actions: [], confirm: null });
    }
    const moveEvent = path.match(/^\/calendar\/events\/(.+)$/);
    if (moveEvent && method === 'PATCH') {
      const body = route.request().postDataJSON();
      state.moves.push({ id: decodeURIComponent(moveEvent[1]), body });
      state.calendar = { ...state.calendar, events: state.calendar.events.map((e) => (e.id === decodeURIComponent(moveEvent[1]) ? { ...e, ...body } : e)) };
      return json(state.calendar.events.find((e) => e.id === decodeURIComponent(moveEvent[1])));
    }
    const moveIssue = path.match(/^\/linear\/issues\/(.+)$/);
    if (moveIssue && method === 'PATCH') {
      const body = route.request().postDataJSON();
      state.moves.push({ id: decodeURIComponent(moveIssue[1]), body });
      const to = linearTeams[0].states.find((x) => x.id === body.stateId)!;
      state.linear = state.linear.map((i) => (i.id === decodeURIComponent(moveIssue[1]) ? { ...i, state: to } : i));
      return json(state.linear.find((i) => i.id === decodeURIComponent(moveIssue[1])));
    }
    if (path === '/system') return json(systemLow);
    if (path === '/projects/status') return json(statuses);
    if (path === '/brief') return route.fulfill({ status: 204 });
    const stories = path.match(/^\/projects\/(.+)\/stories$/);
    if (stories) return json([{ ...linearIssue(7), title: 'Visa CI i orbiten' }]);
    const routine = path.match(/^\/routines\/(.+)\/run$/);
    if (routine) {
      const job = runningJob(routines.find((r) => r.id === routine[1])!.choreId);
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    return json({ error: `no mock for ${method} ${path}` }, 404);
  });
  return state;
}

let api: Awaited<ReturnType<typeof mockApi>>;

test.beforeEach(async ({ page }) => {
  api = await mockApi(page);
  await page.goto('/');
});

test('shows the dashboard with the voice in the middle and the panels around it', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vidar.');
  await expect(page.getByRole('region', { name: 'Röstassistent' })).toContainText('Röst · Rick');
  await expect(page.getByRole('button', { name: 'Behöver dig: 2' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Linear' }).getByRole('list', { name: 'Pågår' })).toContainText('VEL-1');
  await page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: /^Yagi Sports logo/ }).click();
  await expect(page.getByRole('region', { name: 'Artefakter' }).getByRole('link', { name: 'Öppna' }).first()).toBeAttached();
});

test('runs a chore from its key in the skills panel', async ({ page }) => {
  await page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta Städa minnet' }).click();
  await expect.poll(() => api.runs.map((r) => r.id)).toEqual(['memory-cleanup']);
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('Kör på datorn…');
});

test('opens the run sheet for a skill that takes a project', async ({ page }) => {
  await page.getByRole('region', { name: 'Skills' }).getByRole('button', { name: 'Starta /ny-branch' }).click();
  await expect(page.getByRole('dialog', { name: 'Kör /ny-branch' })).toBeVisible();
});

test('adds a story by voice and it flies into the Linear board', async ({ page }) => {
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  await voice.getByLabel('Skriv till Rick').fill('Lägg till en story om portalen');
  await voice.getByLabel('Skriv till Rick').press('Enter');

  await expect(voice).toContainText('Klart. VEL-151 ligger i backloggen.');
  await expect(voice.getByRole('list', { name: 'Verktyg som kördes' })).toContainText('create_issue · Skapade VEL-151 · Portalen');
  await expect(page.getByRole('region', { name: 'Linear' })).toContainText('Portalen');
  expect(api.voice[0]).toMatchObject({ text: 'Lägg till en story om portalen', persona: { id: 'rick' } });
});

test('cleans the disk by voice only after an ok, picking bubbles in the portal', async ({ page }) => {
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

test('moves a calendar event a quarter and a story to done', async ({ page }) => {
  const calendar = page.getByRole('region', { name: 'Kalender' });
  await calendar.getByRole('button', { name: /Anslut Google/ }).click();
  await calendar.getByRole('button', { name: /^\[Möte\], 08:30 till 09:00/ }).press('ArrowDown');
  await expect.poll(() => api.moves[0]).toEqual({ id: '20261029-e1', body: { start: '2026-10-29T08:45:00+01:00', end: '2026-10-29T09:15:00+01:00' } });

  const board = page.getByRole('region', { name: 'Linear' });
  await board.getByRole('listitem', { name: /^VEL-1:/ }).press('ArrowRight');
  await expect.poll(() => api.moves[1]).toEqual({ id: 'VEL-1', body: { stateId: 'done' } });
  await expect(board.getByRole('list', { name: 'Klart' })).toContainText('VEL-1');
});

test('archives the top mail from the inbox panel', async ({ page }) => {
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
  await expect(calendar.getByRole('button', { name: /^Tandläkare, 10:00 till 10:45/ })).toBeVisible();
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

test('runs one of your skills in a project from the skills sheet', async ({ page }) => {
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

test('finds unused packages and removes only the picked ones', async ({ page }) => {
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

test('warns about a full disk and cleans from the top bar', async ({ page }) => {
  await page.getByRole('button', { name: /Disken är nästan full/ }).click();

  await expect.poll(() => api.runs.map((r) => r.id)).toEqual(['disk-cleanup']);
});

test('opens a project from its red CI and lists its stories', async ({ page }) => {
  await page.getByRole('region', { name: 'CI' }).getByRole('button', { name: /^Veloq OS:/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Projekt: Veloq OS' });
  await expect(sheet.getByRole('region', { name: 'Repo' })).toContainText('feature/skills · 12 ändrade · 2 opushade · 1 PR · CI rött');
  await expect(sheet.getByRole('region', { name: 'Stories' })).toContainText('Visa CI i orbiten');
});

test('runs a routine now and syncs the artifacts', async ({ page }) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Rutiner' }).click();
  await page.getByRole('button', { name: 'Kör Veckorevy nu' }).click();
  await expect(page.getByRole('region', { name: 'Pågående jobb' })).toContainText('week-summary');
  await page.keyboard.press('Escape');

  await page.getByRole('region', { name: 'Artefakter' }).getByRole('button', { name: 'Synka' }).click();
  await expect.poll(() => api.runs.map((r) => r.id)).toContain('sync-artifacts');
});
