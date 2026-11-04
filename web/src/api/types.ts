// Mirrors docs/api.md. Keep in sync with api/src/VeloqOS.Api/Models.cs.

export interface Overview {
  projects: number;
  activeProjects: number;
  runningJobs: number;
  inboxNeedsYou: number;
  routinesOn: number;
  routinesTotal: number;
  artifacts: number;
}

export interface Project {
  id: string;
  name: string;
  meta: string;
  status: string;
  tier: 1 | 2 | 3;
  body: string;
  group: string;
  /** The project's folder on the Mac; chores that work in a repo need one. */
  repoPath: string | null;
  /** The key of the project's team in Linear, e.g. `VEL`; null when it is not linked. */
  linearTeam: string | null;
}

export type CiState = 'passing' | 'failing' | 'running';

/** A repo's state on the Mac and on GitHub. */
export interface ProjectStatus {
  projectId: string;
  branch: string | null;
  /** Uncommitted files. */
  changes: number;
  /** Commits not pushed; null without upstream. */
  ahead: number | null;
  lastCommit: { message: string; at: string } | null;
  /** Open pull requests; null when gh is missing or the repo is not on GitHub. */
  pullRequests: number | null;
  ci: CiState | null;
  ciUrl: string | null;
  /** Red CI or uncommitted changes: the orbit shows a dot. */
  attention: boolean;
  error: string | null;
}

export interface SystemInfo {
  disk: { free: number; total: number; label: string; low: boolean };
}

export interface Brief {
  text: string;
  createdAt: string;
  jobId: string;
}

export type ChoreIcon = 'memory' | 'sync' | 'doc' | 'inbox' | 'package' | 'calendar' | 'disk' | 'skill';

/** `chore` is built in; `skill` is one of your Claude Code skills, run as `/name`. */
export type ChoreKind = 'chore' | 'skill';

/** Whether a chore runs in a project's folder. */
export type ChoreProject = 'none' | 'optional' | 'required';

export interface Chore {
  id: string;
  name: string;
  description: string;
  icon: ChoreIcon;
  estimate: string;
  kind: ChoreKind;
  project: ChoreProject;
  /** Placeholder for a free-text addition, null when the chore takes none. */
  argument: string | null;
}

export interface RunOptions {
  projectId?: string;
  argument?: string;
}

/** Something a finished job proposes, for you to approve. */
export interface JobChoice {
  id: string;
  label: string;
  detail: string;
}

export interface Job {
  id: string;
  choreId: string;
  title: string;
  project: string | null;
  step: string;
  progress: number;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  /** The answer when done, the error when failed. */
  result: string | null;
  /** Set while the job waits for you to pick what to carry out. */
  choices: JobChoice[] | null;
  confirm: string | null;
  finishedAt: string | null;
}

export interface Routine {
  id: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  /** The chore the routine runs. */
  choreId: string;
  /** Null when the routine is off. */
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export type InboxTag = 'Åtgärd' | 'Svar' | 'Info' | 'Brus';
export type InboxAction = 'reply' | 'delegate' | 'archive' | 'task' | 'snooze' | 'calendar';

export interface InboxItem {
  id: string;
  from: string;
  receivedAt: string;
  subject: string;
  tag: InboxTag;
  summary: string;
  suggestedAction: InboxAction;
  suggestion: string;
  draft: string | null;
  handledWith: InboxAction | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  suggested: boolean;
}

export interface NewCalendarEvent {
  title: string;
  start: string;
  end: string;
  location: string | null;
}

export interface CalendarDay {
  connected: boolean;
  date: string;
  events: CalendarEvent[];
}

export type ArtifactKind = 'doc' | 'plan' | 'map' | 'screen' | 'web' | 'logo' | 'system' | 'spike' | 'icon';

export interface Artifact {
  id: string;
  title: string;
  url: string;
  kind: ArtifactKind;
  group: string;
  updatedAt: string;
}

/** One per API key; `error` is set when that workspace did not answer. */
export interface LinearWorkspace {
  id: string;
  name: string;
  error: string | null;
}

export interface LinearStatus {
  /** False = no Linear keys, so the API serves sample stories. */
  configured: boolean;
  workspaces: LinearWorkspace[];
}

export type LinearStateType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';

export interface LinearState {
  id: string;
  name: string;
  type: LinearStateType;
  color: string;
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
  workspaceId: string;
  workspace: string;
  states: LinearState[];
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  /** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number;
  priorityLabel: string;
  url: string;
  state: LinearState;
  assignee: string | null;
  updatedAt: string;
}

export interface NewLinearIssue {
  teamId: string;
  title: string;
  description: string | null;
  priority: number;
  stateId: string | null;
}

/** Panels a voice tool can touch; the dashboard draws a beam to it. */
export type VoiceTile = 'overview' | 'calendar' | 'inbox' | 'linear' | 'disk' | 'artifacts' | 'skills' | 'projects';

export type PersonaId = 'rick' | 'neutral';

export interface VoicePersona {
  id: PersonaId;
  /** 0–100. */
  cynism: number;
  /** 0–100; how often `*rap*` may turn up. */
  burps: number;
}

export interface VoiceLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface VoiceAction {
  tool: string;
  tile: VoiceTile;
  summary: string;
  ok: boolean;
}

/** Waits for the user: approve with `POST /jobs/{jobId}/confirm`. */
export interface VoiceConfirm {
  jobId: string;
  label: string;
  choices: JobChoice[];
}

export interface VoiceTurn {
  reply: string;
  actions: VoiceAction[];
  confirm: VoiceConfirm | null;
}

export interface VoiceStatus {
  agent: 'claude' | 'claude-code' | 'sample';
  model: string | null;
  speech: { listen: 'deepgram' | 'browser'; speak: 'elevenlabs' | 'browser' };
  voiceId: string | null;
}
