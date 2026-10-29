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
}

export type ChoreIcon = 'memory' | 'sync' | 'doc' | 'inbox' | 'package' | 'calendar';

export interface Chore {
  id: string;
  name: string;
  description: string;
  icon: ChoreIcon;
  estimate: string;
}

export interface Job {
  id: string;
  choreId: string;
  title: string;
  step: string;
  progress: number;
  status: 'running' | 'done';
  startedAt: string;
  result: string | null;
}

export interface Routine {
  id: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
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
