import type {
  Artifact,
  CalendarDay,
  CalendarEvent,
  Chore,
  InboxAction,
  InboxItem,
  Job,
  Overview,
  Project,
  Routine,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const KEY = import.meta.env.VITE_VELOQ_KEY as string | undefined;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (KEY) headers.set('X-Veloq-Key', KEY);

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? 'GET'} ${path} gav ${response.status}`);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  overview: () => request<Overview>('/overview'),
  projects: () => request<Project[]>('/projects'),
  chores: () => request<Chore[]>('/chores'),
  runChore: (id: string) => request<Job>(`/chores/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  jobs: () => request<Job[]>('/jobs'),
  routines: () => request<Routine[]>('/routines'),
  setRoutine: (id: string, enabled: boolean) =>
    request<Routine>(`/routines/${encodeURIComponent(id)}`, { method: 'PUT', ...json({ enabled }) }),
  inbox: () => request<InboxItem[]>('/inbox'),
  act: (id: string, action: InboxAction, body?: string) =>
    request<InboxItem>(`/inbox/${encodeURIComponent(id)}/actions`, { method: 'POST', ...json({ action, body }) }),
  undo: (id: string) => request<InboxItem>(`/inbox/${encodeURIComponent(id)}/actions`, { method: 'DELETE' }),
  clearNoise: () => request<{ archived: number }>('/inbox/clear-noise', { method: 'POST' }),
  calendar: (date: string) => request<CalendarDay>(`/calendar?date=${date}`),
  connectCalendar: () => request<{ connected: boolean; authUrl: string | null }>('/calendar/connect', { method: 'POST' }),
  book: (id: string) => request<CalendarEvent>(`/calendar/suggestions/${encodeURIComponent(id)}/book`, { method: 'POST' }),
  artifacts: () => request<Artifact[]>('/artifacts'),
  prompt: (text: string, context?: string) => request<{ reply: string }>('/prompt', { method: 'POST', ...json({ text, context }) }),
};

export type Api = typeof api;
