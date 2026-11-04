import { vi } from 'vitest';
import type { Api } from '../api/client';
import { artifacts, calendarDisconnected, chores, inbox, linearIssues, linearTeams, linearWorkspaces, overview, projects, routines, statuses, systemOk, voiceStatus } from './fixtures';

/** Just the calls the dashboard makes on load (its Linear board and voice included), plus whatever a test overrides. */
export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    overview: vi.fn().mockResolvedValue(overview),
    projects: vi.fn().mockResolvedValue(projects),
    chores: vi.fn().mockResolvedValue(chores),
    jobs: vi.fn().mockResolvedValue([]),
    routines: vi.fn().mockResolvedValue(routines),
    inbox: vi.fn().mockResolvedValue(inbox),
    calendar: vi.fn().mockResolvedValue(calendarDisconnected),
    artifacts: vi.fn().mockResolvedValue(artifacts),
    system: vi.fn().mockResolvedValue(systemOk),
    projectStatus: vi.fn().mockResolvedValue(statuses),
    brief: vi.fn().mockResolvedValue(null),
    linear: vi.fn().mockResolvedValue({ configured: true, workspaces: linearWorkspaces }),
    linearTeams: vi.fn().mockResolvedValue(linearTeams),
    linearIssues: vi.fn().mockResolvedValue(linearIssues),
    voice: vi.fn().mockResolvedValue(voiceStatus),
    ...overrides,
  } as unknown as Api;
}
