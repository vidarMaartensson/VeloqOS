// Shared test data for unit tests and the Playwright mocks. Times are fixed to
// Thursday 29 October 2026 in Stockholm (UTC+1).
import type { Artifact, Brief, ProjectStatus, SystemInfo, CalendarDay, Chore, InboxItem, Job, LinearIssue, LinearState, LinearTeam, Overview, Project, Routine, VoiceStatus } from '../api/types';

export const NOW = new Date('2026-10-29T15:20:00+01:00');

export const projects: Project[] = [
  { id: 'halodeck', name: 'HaloDeck', meta: 'Docka · Android', status: 'I utveckling', tier: 3, body: 'Hjul-docka.', group: 'Appar', repoPath: '/Users/vidar/Developer/VeloqLabs/HaloDeck', linearTeam: 'HAL' },
  { id: 'veloq-os', name: 'Veloq OS', meta: 'React · .NET · Kotlin', status: 'Design', tier: 3, body: 'Den här ytan.', group: 'Verktyg', repoPath: '/Users/vidar/Developer/VeloqLabs/VeloqOS', linearTeam: 'VEL' },
  { id: 'halo-home', name: 'Halo Home', meta: 'Launcher', status: 'Planerad', tier: 2, body: 'Launcher.', group: 'Appar', repoPath: null, linearTeam: null },
  { id: 'quizter', name: 'Quizter', meta: 'Musikquiz', status: 'På paus', tier: 1, body: 'Musikquiz.', group: 'Appar', repoPath: null, linearTeam: null },
];

export const chores: Chore[] = [
  { id: 'memory-cleanup', name: 'Städa minnet', description: '', icon: 'memory', estimate: '≈ 1 min', kind: 'chore', project: 'none', argument: null },
  { id: 'sync-projects', name: 'Synka projekt', description: '', icon: 'sync', estimate: '≈ 2 min', kind: 'chore', project: 'none', argument: null },
  {
    id: 'unused-packages', name: 'Oanvända paket', description: 'Letar efter beroenden som aldrig används.', icon: 'package', estimate: '≈ 3 min',
    kind: 'chore', project: 'required', argument: null,
  },
  { id: 'skill-ny-branch', name: '/ny-branch', description: 'Skapa en ny branch från main.', icon: 'skill', estimate: 'Skill', kind: 'skill', project: 'optional', argument: '<namn>' },
  { id: 'skill-pr', name: '/pr', description: 'Committa och pusha.', icon: 'skill', estimate: 'Skill', kind: 'skill', project: 'optional', argument: 'Tillägg (valfritt)' },
];

export const routines: Routine[] = [
  { id: 'morning-brief', name: 'Morgonbrief', schedule: 'Vardagar · 07:40', description: '', enabled: true, choreId: 'morning-brief', nextRunAt: '2026-10-30T07:40:00+01:00', lastRunAt: null },
  { id: 'inbox-review', name: 'Inkorgsgenomgång', schedule: 'Dagligen · 16:30', description: '', enabled: true, choreId: 'clear-inbox', nextRunAt: '2026-10-29T16:30:00+01:00', lastRunAt: null },
  { id: 'memory-cleanup', name: 'Minnesstädning', schedule: 'Söndagar · 20:00', description: '', enabled: true, choreId: 'memory-cleanup', nextRunAt: '2026-11-01T20:00:00+01:00', lastRunAt: null },
  { id: 'week-review', name: 'Veckorevy', schedule: 'Fredagar · 15:00', description: '', enabled: false, choreId: 'week-summary', nextRunAt: null, lastRunAt: null },
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
  project: null, choices: null, confirm: null, finishedAt: null,
});

/** A finished unused-packages job that waits for you to pick what to remove. */
export const waitingJob: Job = {
  id: 'job-unused', choreId: 'unused-packages', title: 'Oanvända paket', project: 'Veloq OS', step: 'Klart', progress: 1,
  status: 'done', startedAt: NOW.toISOString(), result: 'Två paket används inte.\nResten används.',
  choices: [
    { id: 'web-lodash', label: 'lodash', detail: 'web · npm' },
    { id: 'api-polly', label: 'Polly', detail: 'api · NuGet' },
  ],
  confirm: 'Ta bort valda',
  finishedAt: NOW.toISOString(),
};

const linearStates: LinearState[] = [
  { id: 'todo', name: 'Todo', type: 'unstarted', color: '#e2e2e2' },
  { id: 'progress', name: 'In Progress', type: 'started', color: '#f2c94c' },
  { id: 'done', name: 'Done', type: 'completed', color: '#5e6ad2' },
];

export const linearTeams: LinearTeam[] = [
  { id: 't-veloq', key: 'VEL', name: 'Veloq', workspaceId: 'w-veloq', workspace: 'Veloq Labs', states: [...linearStates] },
  { id: 't-halo', key: 'HAL', name: 'Halo', workspaceId: 'w-veloq', workspace: 'Veloq Labs', states: [...linearStates] },
  { id: 't-plattform', key: 'PLA', name: 'Plattform', workspaceId: 'w-jobb', workspace: 'Jobbet', states: [...linearStates] },
];

export const linearWorkspaces = [
  { id: 'w-veloq', name: 'Veloq Labs', error: null },
  { id: 'w-jobb', name: 'Jobbet', error: null },
];

export function linearIssue(n: number, state: LinearState = linearStates[0], priority = 0): LinearIssue {
  return {
    id: `VEL-${n}`,
    identifier: `VEL-${n}`,
    title: `Story ${n}`,
    description: null,
    priority,
    priorityLabel: ['Ingen', 'Brådskande', 'Hög', 'Medel', 'Låg'][priority],
    url: `https://linear.app/veloq/issue/VEL-${n}`,
    state: { ...state },
    assignee: null,
    updatedAt: '2026-10-30T09:00:00Z',
  };
}

export const linearIssues: LinearIssue[] = [linearIssue(1, linearStates[1], 2), linearIssue(2), linearIssue(3)];

export const systemOk: SystemInfo = { disk: { free: 200 * 2 ** 30, total: 460 * 2 ** 30, label: '200,0 GB ledigt av 460,0 GB', low: false } };
export const systemLow: SystemInfo = { disk: { free: 3.2 * 2 ** 30, total: 460 * 2 ** 30, label: '3,2 GB ledigt av 460,0 GB', low: true } };

export const statuses: ProjectStatus[] = [
  {
    projectId: 'halodeck', branch: 'main', changes: 0, ahead: 0, lastCommit: { message: 'Tune the wheel', at: '2026-10-28T10:00:00+01:00' },
    pullRequests: 0, ci: 'passing', ciUrl: 'https://github.com/v/halodeck/actions/runs/1', attention: false, error: null,
  },
  {
    projectId: 'veloq-os', branch: 'feature/skills', changes: 12, ahead: 2, lastCommit: { message: 'Add skills', at: '2026-10-29T09:00:00+01:00' },
    pullRequests: 1, ci: 'failing', ciUrl: 'https://github.com/v/veloqos/actions/runs/2', attention: true, error: null,
  },
];

export const brief: Brief = { text: 'Fixa CI i Veloq OS först.\nMöte 08:30.', createdAt: '2026-10-29T07:41:00+01:00', jobId: 'job-brief' };

export const voiceStatus: VoiceStatus = { agent: 'sample', model: null, speech: { listen: 'browser', speak: 'browser' }, voiceId: null };

export const diskJob: Job = {
  id: 'job-disk', choreId: 'disk-cleanup', title: 'Rensa cache', project: null, step: 'Klart', progress: 1,
  status: 'done', startedAt: NOW.toISOString(), result: 'Hittade 14,2 GB att frigöra.',
  choices: [
    { id: 'gradle', label: 'Gradle', detail: '~/.gradle/caches · 9,8 GB' },
    { id: 'npm', label: 'npm', detail: '~/.npm · 4,4 GB' },
  ],
  confirm: 'Rensa valda',
  finishedAt: NOW.toISOString(),
};
