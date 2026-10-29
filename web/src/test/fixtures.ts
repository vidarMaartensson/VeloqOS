// Shared test data for unit tests and the Playwright mocks. Times are fixed to
// Thursday 29 October 2026 in Stockholm (UTC+1).
import type { Artifact, CalendarDay, Chore, InboxItem, Job, Overview, Project, Routine } from '../api/types';

export const NOW = new Date('2026-10-29T15:20:00+01:00');

export const projects: Project[] = [
  { id: 'halodeck', name: 'HaloDeck', meta: 'Docka · Android', status: 'I utveckling', tier: 3, body: 'Hjul-docka.', group: 'Appar' },
  { id: 'veloq-os', name: 'Veloq OS', meta: 'React · .NET · Kotlin', status: 'Design', tier: 3, body: 'Den här ytan.', group: 'Verktyg' },
  { id: 'halo-home', name: 'Halo Home', meta: 'Launcher', status: 'Planerad', tier: 2, body: 'Launcher.', group: 'Appar' },
  { id: 'quizter', name: 'Quizter', meta: 'Musikquiz', status: 'På paus', tier: 1, body: 'Musikquiz.', group: 'Appar' },
];

export const chores: Chore[] = [
  { id: 'memory-cleanup', name: 'Städa minnet', description: '', icon: 'memory', estimate: '≈ 1 min' },
  { id: 'sync-projects', name: 'Synka projekt', description: '', icon: 'sync', estimate: '≈ 2 min' },
];

export const routines: Routine[] = [
  { id: 'morning-brief', name: 'Morgonbrief', schedule: 'Vardagar · 07:40', description: '', enabled: true },
  { id: 'inbox-review', name: 'Inkorgsgenomgång', schedule: 'Dagligen · 16:30', description: '', enabled: true },
  { id: 'memory-cleanup', name: 'Minnesstädning', schedule: 'Söndagar · 20:00', description: '', enabled: true },
  { id: 'week-review', name: 'Veckorevy', schedule: 'Fredagar · 15:00', description: '', enabled: false },
];

export const inbox: InboxItem[] = [
  {
    id: 'm1', from: 'GitHub', receivedAt: '2026-10-29T14:52:00+01:00', subject: 'CI misslyckades på main', tag: 'Åtgärd',
    summary: 'Ett steg i testsviten fallerar.', suggestedAction: 'delegate', suggestion: 'låt Veloq OS föreslå en fix', draft: null, handledWith: null,
  },
  {
    id: 'm2', from: '[Avsändare]', receivedAt: '2026-10-29T11:20:00+01:00', subject: 'Re: [ämne]', tag: 'Svar',
    summary: 'Vill ha besked.', suggestedAction: 'reply', suggestion: 'svara med utkastet', draft: 'Hej [namn]', handledWith: null,
  },
  {
    id: 'm3', from: 'Google Play Console', receivedAt: '2026-10-28T09:00:00+01:00', subject: '[app]: granskningen är klar', tag: 'Info',
    summary: 'Klar.', suggestedAction: 'archive', suggestion: 'arkivera', draft: null, handledWith: null,
  },
  {
    id: 'm4', from: '[Nyhetsbrev]', receivedAt: '2026-10-26T09:00:00+01:00', subject: '[rubrik]', tag: 'Brus',
    summary: 'Inget som rör dina projekt.', suggestedAction: 'archive', suggestion: 'arkivera', draft: null, handledWith: null,
  },
];

export const calendarConnected: CalendarDay = {
  connected: true,
  date: '2026-10-29',
  events: [
    { id: '20261029-e1', title: '[Möte]', start: '2026-10-29T08:30:00+01:00', end: '2026-10-29T09:00:00+01:00', location: 'Google Meet', suggested: false },
    { id: '20261029-e2', title: 'Pågående möte', start: '2026-10-29T15:00:00+01:00', end: '2026-10-29T16:00:00+01:00', location: null, suggested: false },
    { id: '20261029-s1', title: 'Fokus · Halo Home motion', start: '2026-10-29T16:00:00+01:00', end: '2026-10-29T18:00:00+01:00', location: null, suggested: true },
  ],
};

export const calendarDisconnected: CalendarDay = { connected: false, date: '2026-10-29', events: [] };

export const artifacts: Artifact[] = [
  { id: 'a1', title: 'Veloq OS', url: 'https://claude.ai/artifact/a1', kind: 'screen', group: 'Veloq', updatedAt: '2026-10-29' },
  { id: 'a2', title: 'Yagi Sports logo', url: 'https://claude.ai/artifact/a2', kind: 'logo', group: 'Yagi', updatedAt: '2026-10-26' },
  { id: 'a3', title: 'Fusklapp – VX Fiber', url: 'https://claude.ai/artifact/a3', kind: 'doc', group: 'Jobb', updatedAt: '2026-10-22' },
];

export const overview: Overview = {
  projects: 4, activeProjects: 2, runningJobs: 0, inboxNeedsYou: 2, routinesOn: 3, routinesTotal: 4, artifacts: 3,
};

export const runningJob = (choreId: string, progress = 0.2): Job => ({
  id: `job-${choreId}`, choreId, title: chores.find((c) => c.id === choreId)?.name ?? choreId,
  step: 'Kör på datorn…', progress, status: 'running', startedAt: NOW.toISOString(), result: null,
});
