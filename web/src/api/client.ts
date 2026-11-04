import type {
  Artifact,
  CalendarDay,
  CalendarEvent,
  Chore,
  InboxAction,
  InboxItem,
  NewCalendarEvent,
  Job,
  LinearIssue,
  LinearStatus,
  LinearTeam,
  NewLinearIssue,
  Overview,
  Project,
  ProjectStatus,
  Brief,
  Routine,
  RunOptions,
  SystemInfo,
  VoiceLine,
  VoicePersona,
  VoiceStatus,
  VoiceTurn,
} from './types';
import { API_BASE } from './base';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const KEY = import.meta.env.VITE_VELOQ_KEY as string | undefined;

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (KEY) headers.set('X-Veloq-Key', KEY);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    // Problem details carry a readable reason, e.g. Claude Code's own error from a chore;
    // validation problems put theirs per field, and a conflict as `error`.
    const problem = (await response.json().catch(() => null)) as { detail?: string; errors?: Record<string, string[]>; error?: string } | null;
    const reason = problem?.detail ?? Object.values(problem?.errors ?? {})[0]?.[0] ?? problem?.error;
    throw new ApiError(response.status, reason ?? `${init.method ?? 'GET'} ${path} gav ${response.status}`);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await (await send(path, init)).json()) as T;
}

/** Like request, but `204 No Content` is null. */
async function maybe<T>(path: string): Promise<T | null> {
  const response = await send(path, {});
  return response.status === 204 ? null : ((await response.json()) as T);
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  overview: () => request<Overview>('/overview'),
  projects: () => request<Project[]>('/projects'),
  chores: () => request<Chore[]>('/chores'),
  runChore: (id: string, options: RunOptions = {}) =>
    request<Job>(`/chores/${encodeURIComponent(id)}/run`, { method: 'POST', ...json(options) }),
  jobs: () => request<Job[]>('/jobs'),
  confirmJob: (id: string, choices: string[]) =>
    request<Job>(`/jobs/${encodeURIComponent(id)}/confirm`, { method: 'POST', ...json({ choices }) }),
  routines: () => request<Routine[]>('/routines'),
  runRoutine: (id: string) => request<Job>(`/routines/${encodeURIComponent(id)}/run`, { method: 'POST' }),
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
  moveEvent: (id: string, start: string, end: string) =>
    request<CalendarEvent>(`/calendar/events/${encodeURIComponent(id)}`, { method: 'PATCH', ...json({ start, end }) }),
  createEvent: (event: NewCalendarEvent) => request<CalendarEvent>('/calendar/events', { method: 'POST', ...json(event) }),
  artifacts: () => request<Artifact[]>('/artifacts'),
  linear: () => request<LinearStatus>('/linear'),
  linearTeams: () => request<LinearTeam[]>('/linear/teams'),
  linearIssues: (teamId: string, open: boolean) =>
    request<LinearIssue[]>(`/linear/issues?teamId=${encodeURIComponent(teamId)}&open=${open}`),
  createLinearIssue: (issue: NewLinearIssue) => request<LinearIssue>('/linear/issues', { method: 'POST', ...json(issue) }),
  moveLinearIssue: (id: string, stateId: string) =>
    request<LinearIssue>(`/linear/issues/${encodeURIComponent(id)}`, { method: 'PATCH', ...json({ stateId }) }),
  voice: () => request<VoiceStatus>('/voice'),
  voiceTurn: (text: string, history: VoiceLine[], persona: VoicePersona) =>
    request<VoiceTurn>('/voice/turn', { method: 'POST', ...json({ text, history, persona }) }),
  /** MP3 from ElevenLabs. */
  speak: async (text: string) => (await send('/voice/speak', { method: 'POST', ...json({ text }) })).blob(),
  transcribe: (audio: Blob) =>
    request<{ text: string }>('/voice/transcribe', { method: 'POST', body: audio, headers: { 'Content-Type': audio.type || 'audio/webm' } }),
  system: () => request<SystemInfo>('/system'),
  projectStatus: (refresh = false) => request<ProjectStatus[]>(`/projects/status${refresh ? '?refresh=true' : ''}`),
  stories: (projectId: string) => request<LinearIssue[]>(`/projects/${encodeURIComponent(projectId)}/stories`),
  brief: () => maybe<Brief>('/brief'),
};

export type Api = typeof api;
