import type { LinearIssue, LinearState, LinearTeam } from '../api/types';

export const PRIORITIES = ['Ingen', 'Brådskande', 'Hög', 'Medel', 'Låg'] as const;

export const isOpen = (state: LinearState) => state.type !== 'completed' && state.type !== 'canceled';

/** Issues under their team's states, in Linear's order; empty states are left out. */
export function groupByState(team: LinearTeam | undefined, issues: LinearIssue[]): { state: LinearState; issues: LinearIssue[] }[] {
  const states = [...(team?.states ?? [])];
  for (const issue of issues) if (!states.some((s) => s.id === issue.state.id)) states.push(issue.state);
  return states.map((state) => ({ state, issues: issues.filter((i) => i.state.id === state.id) })).filter((g) => g.issues.length > 0);
}

/** Teams under their workspace, keeping the API's order (key order, then name). */
export function teamsByWorkspace(teams: LinearTeam[]): { id: string; name: string; teams: LinearTeam[] }[] {
  const groups: { id: string; name: string; teams: LinearTeam[] }[] = [];
  for (const team of teams) {
    const group = groups.find((g) => g.id === team.workspaceId);
    if (group) group.teams.push(team);
    else groups.push({ id: team.workspaceId, name: team.workspace, teams: [team] });
  }
  return groups;
}

export function storiesTitle(count: number): string {
  if (count === 0) return 'Inget öppet.';
  return count === 1 ? 'En öppen story.' : `${count} öppna stories.`;
}
