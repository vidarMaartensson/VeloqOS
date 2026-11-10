import { expect, test as base, type Locator, type Page, type Route } from '@playwright/test';
import type { Brief, CalendarDay, InboxItem, Job, LinearIssue, LinearStatus, Routine, SystemInfo, VoiceStatus, VoiceTurn } from '../src/api/types';
import { artifacts, calendarConnected, calendarDisconnected, chores, diskJob, inbox, linearIssue, linearIssues, linearTeams, linearWorkspaces, NOW, overview, projects, routines, runningJob, statuses, systemLow, voiceStatus, waitingJob } from '../src/test/fixtures';

/** What the fake speech in the browser has done, and the handles to drive it. */
interface FakeSpeech {
  spoken: string[];
  /** While true an utterance never ends, so the voice stays in "speaking". */
  hold: boolean;
  /** Plays what the microphone hears. */
  hear: (text: string) => void;
}

declare global {
  interface Window {
    __speech: FakeSpeech;
  }
}

/** No real speech or microphone in the tests. Runs in the page before the app. */
function installFakeSpeech() {
  let talking: SpeechSynthesisUtterance | null = null;
  const finish = (u: SpeechSynthesisUtterance | null) => {
    if (talking === u) talking = null;
    u?.onend?.call(u, new Event('end') as SpeechSynthesisEvent);
  };
  const speech: FakeSpeech = {
    spoken: [],
    hold: false,
    hear: () => undefined,
  };
  window.__speech = speech;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      getVoices: () => [],
      cancel: () => finish(talking),
      speak: (u: SpeechSynthesisUtterance) => {
        speech.spoken.push(u.text);
        talking = u;
        if (!speech.hold) setTimeout(() => finish(u), 10);
      },
    }),
  });
  class FakeRecognition {
    onresult: ((e: { results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() {
      speech.hear = (text) => this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: false }] });
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  }
  Object.assign(window, { SpeechRecognition: FakeRecognition });
}

/** Matches a path after /api. A string is the exact path, a RegExp may match any of it. */
type PathMatch = string | RegExp;

const matches = (match: PathMatch, path: string) => (typeof match === 'string' ? match === path : match.test(path));

/** A small in-memory fake of the API, so the e2e tests never touch the .NET backend or the outside world. */
async function mockApi(page: Page) {
  // A handler that resolves to 'next' lets the normal mock answer afterwards.
  const overrides: { method: string; path: PathMatch; handle: (route: Route) => Promise<void | 'next'> }[] = [];

  const state = {
    inbox: structuredClone(inbox) as InboxItem[],
    calendar: structuredClone(calendarDisconnected) as CalendarDay,
    jobs: [] as Job[],
    routines: structuredClone(routines) as Routine[],
    linear: structuredClone(linearIssues) as LinearIssue[],
    linearHalo: [{ ...linearIssue(40), id: 'HAL-40', identifier: 'HAL-40', title: 'Hjulet i dockan' }] as LinearIssue[],
    linearStatus: { configured: true, workspaces: linearWorkspaces } as LinearStatus,
    system: systemLow as SystemInfo,
    brief: null as Brief | null,
    voiceStatus: voiceStatus as VoiceStatus,
    /** Where connecting the calendar sends you; null means it connects at once. */
    authUrl: null as string | null,
    stories: [{ ...linearIssue(7), title: 'Visa CI i orbiten' }] as LinearIssue[],
    runs: [] as { id: string; projectId?: string; argument?: string }[],
    confirmed: [] as string[],
    voice: [] as { text: string; history: { role: string; text: string }[]; persona: { id: string; cynism: number; burps: number } }[],
    moves: [] as { id: string; body: Record<string, string> }[],
    /** Every call the app made, in order. */
    requests: [] as { method: string; path: string; search: string; body: unknown }[],
    /** Calls the mock has no answer for; failing the test keeps the mock honest. */
    unmocked: [] as string[],

    /** Answers the call with an error until `heal`. */
    fail(method: string, path: PathMatch, status = 500, detail = 'Något gick fel') {
      overrides.push({ method, path, handle: (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ detail }) }) });
    },
    /** Every call fails as if the API were not running. */
    down() {
      overrides.push({ method: '*', path: /.*/, handle: (route) => route.abort('connectionrefused') });
    },
    /** Answers the call with this body, until `heal`. */
    answer(method: string, path: PathMatch, body: unknown, status = 200) {
      overrides.push({ method, path, handle: (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) });
    },
    /** Keeps the call waiting until the returned function runs, to show what a slow API looks like. */
    hold(method: string, path: PathMatch) {
      let open = () => {};
      const gate = new Promise<void>((resolve) => (open = resolve));
      const held = {
        method,
        path,
        handle: async () => {
          await gate;
          return 'next' as const;
        },
      };
      overrides.unshift(held);
      return () => {
        overrides.splice(overrides.indexOf(held), 1);
        open();
      };
    },
    heal() {
      overrides.length = 0;
    },
  };

  await page.addInitScript(installFakeSpeech);
  // Fonts from Google and the like: nothing leaves the test.
  await page.route((url) => url.hostname !== 'localhost', (route) => route.abort());
  // A fixed day, with the clock running from there; fake timers can also be fast-forwarded.
  await page.clock.install({ time: NOW });

  // Match on the path prefix: a '**/api/**' glob also catches Vite's own modules under src/api/.
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const issuesOf = (teamId: string | null) => (teamId === 't-halo' ? state.linearHalo : teamId === 't-plattform' ? [] : state.linear);

    const body = safeJson(route.request().postData());
    state.requests.push({ method, path, search: url.search, body });

    const override = overrides.find((o) => (o.method === '*' || o.method === method) && matches(o.path, path));
    if (override && (await override.handle(route)) !== 'next') return;

    if (path === '/overview') {
      return json({
        ...overview,
        inboxNeedsYou: state.inbox.filter((i) => !i.handledWith && (i.tag === 'Åtgärd' || i.tag === 'Svar')).length,
        runningJobs: state.jobs.filter((j) => j.status === 'running').length,
        routinesOn: state.routines.filter((r) => r.enabled).length,
      });
    }
    if (path === '/projects') return json(projects);
    if (path === '/chores') return json(chores);
    if (path === '/jobs') return json(state.jobs);
    if (path === '/routines') return json(state.routines);
    if (path === '/artifacts') return json(artifacts);
    if (path === '/inbox') return json(state.inbox);
    if (path === '/inbox/clear-noise') {
      const noise = state.inbox.filter((i) => i.tag === 'Brus' && !i.handledWith);
      noise.forEach((i) => (i.handledWith = 'archive'));
      return json({ archived: noise.length });
    }
    if (path === '/calendar') {
      const date = url.searchParams.get('date') ?? state.calendar.date;
      return json({ ...state.calendar, date, events: state.calendar.events.filter((e) => e.start.startsWith(date)) });
    }
    if (path === '/calendar/connect') {
      if (state.authUrl) return json({ connected: false, authUrl: state.authUrl });
      state.calendar = structuredClone(calendarConnected);
      return json({ connected: true, authUrl: null });
    }
    if (path === '/calendar/events' && method === 'POST') {
      const event = { id: `added-${state.calendar.events.length}`, suggested: false, ...(body as object) } as CalendarDay['events'][number];
      state.calendar = { ...state.calendar, events: [...state.calendar.events, event] };
      return json(event, 201);
    }
    const book = path.match(/^\/calendar\/suggestions\/(.+)\/book$/);
    if (book) {
      state.calendar = { ...state.calendar, events: state.calendar.events.map((e) => (e.id === book[1] ? { ...e, suggested: false } : e)) };
      return json(state.calendar.events.find((e) => e.id === book[1]));
    }
    const run = path.match(/^\/chores\/(.+)\/run$/);
    if (run) {
      const options = (body ?? {}) as { projectId?: string; argument?: string };
      state.runs.push({ id: run[1], ...options });
      // Unused packages comes back at once with a proposal; everything else keeps running.
      const job = run[1] === 'unused-packages'
        ? structuredClone(waitingJob)
        : { ...runningJob(run[1]), project: projects.find((p) => p.id === options.projectId)?.name ?? null };
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const confirm = path.match(/^\/jobs\/(.+)\/confirm$/);
    if (confirm) {
      state.confirmed = (body as { choices: string[] }).choices;
      state.jobs = state.jobs.map((j) => (j.id === confirm[1] ? { ...j, choices: null, confirm: null } : j));
      const job = { ...runningJob('unused-packages'), id: 'job-remove', project: 'Veloq OS' };
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const act = path.match(/^\/inbox\/(.+)\/actions$/);
    if (act) {
      const item = state.inbox.find((i) => i.id === act[1])!;
      item.handledWith = method === 'DELETE' ? null : (body as { action: InboxItem['handledWith'] }).action;
      return json(item);
    }
    if (path === '/linear') return json(state.linearStatus);
    if (path === '/linear/teams') return json(linearTeams);
    if (path === '/linear/issues' && method === 'GET') {
      const issues = issuesOf(url.searchParams.get('teamId'));
      return json(url.searchParams.get('open') === 'true' ? issues.filter((i) => i.state.type !== 'completed') : issues);
    }
    if (path === '/linear/issues' && method === 'POST') {
      const story = body as { teamId: string; title: string; stateId: string | null; priority: number };
      const team = linearTeams.find((t) => t.id === story.teamId)!;
      const issue = { ...linearIssue(state.linear.length + 1, team.states.find((x) => x.id === story.stateId) ?? team.states[0], story.priority), title: story.title };
      state.linear = [issue, ...state.linear];
      return json(issue, 201);
    }
    if (path === '/voice') return json(state.voiceStatus);
    if (path === '/voice/speak') return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'inte riktigt ljud' });
    if (path === '/voice/turn') {
      const turn = body as (typeof state.voice)[number];
      state.voice.push(turn);
      if (/story/i.test(turn.text)) {
        const issue = { ...linearIssue(151), title: 'Portalen' };
        state.linear = [issue, ...state.linear];
        return json({ reply: 'Klart. VEL-151 ligger i backloggen. *rap* Försök hålla den vid liv.', actions: [{ tool: 'create_issue', tile: 'linear', summary: 'Skapade VEL-151 · Portalen', ok: true }], confirm: null } satisfies VoiceTurn);
      }
      if (/disk/i.test(turn.text)) {
        state.jobs = [structuredClone(diskJob), ...state.jobs];
        return json({ reply: 'Två saker kan bort. Säg ja på skärmen.', actions: [{ tool: 'scan_disk', tile: 'disk', summary: '2 saker att rensa', ok: true }], confirm: { jobId: diskJob.id, label: 'Rensa valda', choices: diskJob.choices! } } satisfies VoiceTurn);
      }
      return json({ reply: 'Vad?', actions: [], confirm: null } satisfies VoiceTurn);
    }
    const moveEvent = path.match(/^\/calendar\/events\/(.+)$/);
    if (moveEvent && method === 'PATCH') {
      const move = body as Record<string, string>;
      const id = decodeURIComponent(moveEvent[1]);
      state.moves.push({ id, body: move });
      state.calendar = { ...state.calendar, events: state.calendar.events.map((e) => (e.id === id ? { ...e, ...move } : e)) };
      return json(state.calendar.events.find((e) => e.id === id));
    }
    const moveIssue = path.match(/^\/linear\/issues\/(.+)$/);
    if (moveIssue && method === 'PATCH') {
      const move = body as { stateId: string };
      const id = decodeURIComponent(moveIssue[1]);
      state.moves.push({ id, body: move });
      const to = linearTeams[0].states.find((x) => x.id === move.stateId)!;
      state.linear = state.linear.map((i) => (i.id === id ? { ...i, state: to } : i));
      return json(state.linear.find((i) => i.id === id));
    }
    if (path === '/system') return json(state.system);
    if (path === '/projects/status') return json(statuses);
    if (path === '/brief') return state.brief ? json(state.brief) : route.fulfill({ status: 204 });
    if (/^\/projects\/.+\/stories$/.test(path)) return json(state.stories);
    const routine = path.match(/^\/routines\/([^/]+)\/run$/);
    if (routine) {
      const job = runningJob(state.routines.find((r) => r.id === routine[1])!.choreId);
      state.jobs = [job, ...state.jobs];
      return json(job, 202);
    }
    const toggle = path.match(/^\/routines\/([^/]+)$/);
    if (toggle && method === 'PUT') {
      const { enabled } = body as { enabled: boolean };
      state.routines = state.routines.map((r) => (r.id === toggle[1] ? { ...r, enabled } : r));
      return json(state.routines.find((r) => r.id === toggle[1]));
    }

    state.unmocked.push(`${method} ${path}`);
    return json({ error: `no mock for ${method} ${path}` }, 404);
  });
  return state;
}

function safeJson(text: string | null): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export type MockApi = Awaited<ReturnType<typeof mockApi>>;

/**
 * Every test gets the mocked API. A test also fails on a call the mock does not know, a crash in the
 * page or a console error. Failed requests are left out: the error tests cause those on purpose.
 */
export const test = base.extend<{ api: MockApi }>({
  api: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`console: ${m.text()}`);
      });
      const api = await mockApi(page);
      await use(api);
      expect(api.unmocked, 'calls without a mock').toEqual([]);
      expect(problems, 'errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Answers in plain words instead of as Rick; call before the page loads. */
export const plainPersona = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('veloq-voice', JSON.stringify({ persona: 'neutral' })));

/** Drags with a real mouse from the middle of an element, by this many pixels. */
export async function drag(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  // GSAP reads the pointer once a frame; let it catch up before letting go.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.mouse.up();
}
