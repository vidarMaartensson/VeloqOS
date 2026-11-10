import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api as defaultApi, type Api } from '../api/client';
import type { Artifact, Brief, ProjectStatus, SystemInfo, CalendarDay, Chore, InboxAction, InboxItem, Job, NewCalendarEvent, Overview, Project, Routine, RunOptions } from './types';
import { isoDate } from '../lib/time';

export interface VeloqState {
  loading: boolean;
  error: string | null;
  overview: Overview | null;
  projects: Project[];
  chores: Chore[];
  jobs: Job[];
  routines: Routine[];
  inbox: InboxItem[];
  calendar: CalendarDay | null;
  calendarDate: string;
  artifacts: Artifact[];
  /** Disk and the like; null until it has loaded, which never blocks the dashboard. */
  system: SystemInfo | null;
  /** git, PRs and CI for the projects with a folder. */
  statuses: ProjectStatus[];
  brief: Brief | null;
}

const initial: VeloqState = {
  loading: true,
  error: null,
  overview: null,
  projects: [],
  chores: [],
  jobs: [],
  routines: [],
  inbox: [],
  calendar: null,
  calendarDate: isoDate(new Date()),
  artifacts: [],
  system: null,
  statuses: [],
  brief: null,
};

/** All dashboard data and the actions on it. The API owns the rules; this only mirrors them. */
export function useVeloq(api: Api = defaultApi) {
  const [state, setState] = useState<VeloqState>(initial);
  const patch = useCallback((p: Partial<VeloqState>) => setState((s) => ({ ...s, ...p })), []);
  const dateRef = useRef(initial.calendarDate);

  const fail = useCallback((e: unknown) => patch({ error: e instanceof Error ? e.message : String(e) }), [patch]);

  const refreshOverview = useCallback(() => api.overview().then((overview) => patch({ overview })).catch(fail), [api, patch, fail]);

  /** The slower, optional parts: GitHub can take a few seconds, and none of them may hold up the dashboard or call it offline. */
  const refreshExtras = useCallback(
    (refresh = false) =>
      Promise.allSettled([
        api.system().then((system) => patch({ system })),
        api.projectStatus(refresh).then((statuses) => patch({ statuses })),
        api.brief().then((brief) => patch({ brief })),
      ]),
    [api, patch],
  );

  const reload = useCallback(() => {
    patch({ loading: true });
    return Promise.all([
      api.overview(),
      api.projects(),
      api.chores(),
      api.jobs(),
      api.routines(),
      api.inbox(),
      api.calendar(dateRef.current),
      api.artifacts(),
    ])
      .then(([overview, projects, chores, jobs, routines, inbox, calendar, artifacts]) =>
        patch({ loading: false, error: null, overview, projects, chores, jobs, routines, inbox, calendar, artifacts }),
      )
      .catch((e) => patch({ loading: false, error: e instanceof Error ? e.message : String(e) }));
  }, [api, patch]);

  useEffect(() => {
    reload();
    refreshExtras();
    const timer = setInterval(() => refreshExtras(), 60_000);
    return () => clearInterval(timer);
  }, [reload, refreshExtras]);

  // Google's sign-in happens in another tab or the system browser. Coming back while still not
  // connected may mean it just finished, so look again.
  const connected = state.calendar?.connected ?? true;
  useEffect(() => {
    if (connected) return;
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      Promise.all([api.calendar(dateRef.current), api.inbox(), api.overview()])
        .then(([calendar, inbox, overview]) => patch({ calendar, inbox, overview }))
        .catch(fail);
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [api, connected, patch, fail]);

  // Poll jobs while anything is running.
  const running = state.jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      api
        .jobs()
        .then((jobs) => {
          patch({ jobs });
          if (!jobs.some((j) => j.status === 'running')) {
            // A finished job may have freed disk, written the brief or synced the shelf.
            refreshOverview();
            refreshExtras();
            api.artifacts().then((artifacts) => patch({ artifacts })).catch(() => undefined);
          }
        })
        .catch(fail);
    }, 1000);
    return () => clearInterval(timer);
  }, [api, running, patch, fail, refreshOverview, refreshExtras]);

  /** Resolves to the API's complaint (a missing project, say) for the run sheet to show, or null when the job started. */
  const runChore = useCallback(
    async (id: string, options?: RunOptions): Promise<string | null> => {
      try {
        const job = await api.runChore(id, options);
        setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));
        refreshOverview();
        return null;
      } catch (e) {
        if (e instanceof ApiError) return e.message;
        fail(e);
        return 'Kunde inte nå Veloq OS-API:t.';
      }
    },
    [api, fail, refreshOverview],
  );

  /** Runs a routine now; its job joins the list like a chore's. */
  const runRoutine = useCallback(
    async (id: string) => {
      try {
        const job = await api.runRoutine(id);
        setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));
        patch({ routines: await api.routines() });
      } catch (e) {
        fail(e);
      }
    },
    [api, patch, fail],
  );

  /** Approves some of a job's choices; the old job stops waiting and a new one carries them out. */
  const confirmJob = useCallback(
    async (id: string, choices: string[]): Promise<string | null> => {
      try {
        const job = await api.confirmJob(id, choices);
        setState((s) => ({
          ...s,
          jobs: [job, ...s.jobs.map((j) => (j.id === id ? { ...j, choices: null, confirm: null } : j))],
        }));
        return null;
      } catch (e) {
        if (e instanceof ApiError) return e.message;
        fail(e);
        return 'Kunde inte nå Veloq OS-API:t.';
      }
    },
    [api, fail],
  );

  const setRoutine = useCallback(
    async (id: string, enabled: boolean) => {
      setState((s) => ({ ...s, routines: s.routines.map((r) => (r.id === id ? { ...r, enabled } : r)) }));
      try {
        await api.setRoutine(id, enabled);
        refreshOverview();
      } catch (e) {
        setState((s) => ({ ...s, routines: s.routines.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)) }));
        fail(e);
      }
    },
    [api, fail, refreshOverview],
  );

  const replaceItem = useCallback(
    (item: InboxItem) => setState((s) => ({ ...s, inbox: s.inbox.map((i) => (i.id === item.id ? item : i)) })),
    [],
  );

  /** Resolves to false (with the error shown) if the API said no. */
  const act = useCallback(
    async (id: string, action: InboxAction, body?: string) => {
      try {
        replaceItem(await api.act(id, action, body));
        if (action === 'calendar') {
          const calendar = await api.calendar(dateRef.current);
          patch({ calendar });
        }
        refreshOverview();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [api, replaceItem, patch, fail, refreshOverview],
  );

  const undo = useCallback(
    async (id: string) => {
      try {
        replaceItem(await api.undo(id));
        refreshOverview();
      } catch (e) {
        fail(e);
      }
    },
    [api, replaceItem, fail, refreshOverview],
  );

  const clearNoise = useCallback(async () => {
    try {
      await api.clearNoise();
      patch({ inbox: await api.inbox() });
      refreshOverview();
    } catch (e) {
      fail(e);
    }
  }, [api, patch, fail, refreshOverview]);

  const showDate = useCallback(
    async (date: string) => {
      dateRef.current = date;
      patch({ calendarDate: date });
      try {
        patch({ calendar: await api.calendar(date) });
      } catch (e) {
        fail(e);
      }
    },
    [api, patch, fail],
  );

  const connectCalendar = useCallback(async () => {
    try {
      const { authUrl } = await api.connectCalendar();
      if (authUrl) {
        window.location.assign(authUrl);
        return;
      }
      patch({ calendar: await api.calendar(dateRef.current) });
    } catch (e) {
      fail(e);
    }
  }, [api, patch, fail]);

  const book = useCallback(
    async (id: string) => {
      try {
        await api.book(id);
        patch({ calendar: await api.calendar(dateRef.current) });
      } catch (e) {
        fail(e);
      }
    },
    [api, patch, fail],
  );

  /** Adds the event and shows its day. Resolves to false (with the error shown) if the API said no. */
  const addEvent = useCallback(
    async (event: NewCalendarEvent) => {
      try {
        await api.createEvent(event);
        const date = event.start.slice(0, 10);
        dateRef.current = date;
        patch({ calendarDate: date, calendar: await api.calendar(date) });
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [api, patch, fail],
  );

  /** Moves an event; on a no the error shows and the day is read again. */
  const moveEvent = useCallback(
    async (id: string, start: string, end: string) => {
      setState((s) => ({
        ...s,
        calendar: s.calendar && { ...s.calendar, events: s.calendar.events.map((e) => (e.id === id ? { ...e, start, end } : e)) },
      }));
      try {
        await api.moveEvent(id, start, end);
        return true;
      } catch (e) {
        fail(e);
        patch({ calendar: await api.calendar(dateRef.current).catch(() => null) });
        return false;
      }
    },
    [api, patch, fail],
  );

  /** Reads again what a voice command touched. */
  const refresh = useCallback(
    async (parts: ('calendar' | 'inbox' | 'jobs' | 'artifacts')[]) => {
      const wanted = new Set(parts);
      await Promise.allSettled([
        refreshOverview(),
        wanted.has('calendar') && api.calendar(dateRef.current).then((calendar) => patch({ calendar })),
        wanted.has('inbox') && api.inbox().then((inbox) => patch({ inbox })),
        wanted.has('jobs') && api.jobs().then((jobs) => patch({ jobs })),
        wanted.has('artifacts') && api.artifacts().then((artifacts) => patch({ artifacts })),
      ]);
    },
    [api, patch, refreshOverview],
  );

  return {
    state,
    actions: { runChore, confirmJob, moveEvent, refresh, runRoutine, refreshExtras, setRoutine, act, undo, clearNoise, showDate, connectCalendar, book, addEvent, reload, dismissError: () => patch({ error: null }) },
  };
}

export type VeloqActions = ReturnType<typeof useVeloq>['actions'];
