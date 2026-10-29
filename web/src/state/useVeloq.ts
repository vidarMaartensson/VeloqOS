import { useCallback, useEffect, useRef, useState } from 'react';
import { api as defaultApi, type Api } from '../api/client';
import type { Artifact, CalendarDay, Chore, InboxAction, InboxItem, Job, Message, Overview, Project, Routine } from './types';
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
  messages: Message[];
  thinking: boolean;
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
  messages: [],
  thinking: false,
};

/** All dashboard data and the actions on it. The API owns the rules; this only mirrors them. */
export function useVeloq(api: Api = defaultApi) {
  const [state, setState] = useState<VeloqState>(initial);
  const patch = useCallback((p: Partial<VeloqState>) => setState((s) => ({ ...s, ...p })), []);
  const dateRef = useRef(initial.calendarDate);

  const fail = useCallback((e: unknown) => patch({ error: e instanceof Error ? e.message : String(e) }), [patch]);

  const refreshOverview = useCallback(() => api.overview().then((overview) => patch({ overview })).catch(fail), [api, patch, fail]);

  useEffect(() => {
    Promise.all([
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

  // Poll jobs while anything is running.
  const running = state.jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      api
        .jobs()
        .then((jobs) => {
          patch({ jobs });
          if (!jobs.some((j) => j.status === 'running')) refreshOverview();
        })
        .catch(fail);
    }, 1000);
    return () => clearInterval(timer);
  }, [api, running, patch, fail, refreshOverview]);

  const runChore = useCallback(
    async (id: string) => {
      try {
        const job = await api.runChore(id);
        setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));
        refreshOverview();
      } catch (e) {
        fail(e);
      }
    },
    [api, fail, refreshOverview],
  );

  const setRoutine = useCallback(
    async (id: string, enabled: boolean) => {
      setState((s) => ({ ...s, routines: s.routines.map((r) => (r.id === id ? { ...r, enabled } : r)) }));
      try {
        await api.setRoutine(id, enabled);
        refreshOverview();
      } catch (e) {
        fail(e);
      }
    },
    [api, fail, refreshOverview],
  );

  const replaceItem = useCallback(
    (item: InboxItem) => setState((s) => ({ ...s, inbox: s.inbox.map((i) => (i.id === item.id ? item : i)) })),
    [],
  );

  const act = useCallback(
    async (id: string, action: InboxAction, body?: string) => {
      try {
        replaceItem(await api.act(id, action, body));
        if (action === 'calendar') {
          const calendar = await api.calendar(dateRef.current);
          patch({ calendar });
        }
        refreshOverview();
      } catch (e) {
        fail(e);
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

  const send = useCallback(
    async (text: string, context?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setState((s) => ({ ...s, thinking: true, messages: [...s.messages, { role: 'user', text: trimmed }] }));
      try {
        const { reply } = await api.prompt(trimmed, context);
        setState((s) => ({ ...s, thinking: false, messages: [...s.messages, { role: 'assistant', text: reply }] }));
      } catch (e) {
        patch({ thinking: false });
        fail(e);
      }
    },
    [api, patch, fail],
  );

  return {
    state,
    actions: { runChore, setRoutine, act, undo, clearNoise, showDate, connectCalendar, book, send, dismissError: () => patch({ error: null }) },
  };
}

export type VeloqActions = ReturnType<typeof useVeloq>['actions'];
