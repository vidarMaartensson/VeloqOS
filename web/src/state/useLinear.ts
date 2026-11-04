import { useCallback, useEffect, useRef, useState } from 'react';
import { api as defaultApi, type Api } from '../api/client';
import type { LinearIssue, LinearStatus, LinearTeam, NewLinearIssue } from './types';

export interface LinearViewState {
  status: LinearStatus | null;
  teams: LinearTeam[];
  teamId: string | null;
  showDone: boolean;
  issues: LinearIssue[];
  loading: boolean;
  error: string | null;
}

/**
 * Linear stories for the open team. Loads when `active` turns on, so a closed view costs nothing.
 * `preferKey` picks the first team by key (e.g. VEL) instead of the first in the list.
 */
export function useLinear(active: boolean, api: Api = defaultApi, options: { showDone?: boolean; preferKey?: string | null } = {}) {
  const [state, setState] = useState<LinearViewState>({ status: null, teams: [], teamId: null, showDone: options.showDone ?? false, issues: [], loading: false, error: null });
  const preferKey = options.preferKey;
  // A team you picked yourself wins over the preferred one, which may only be known later.
  const picked = useRef(false);
  const patch = useCallback((p: Partial<LinearViewState>) => setState((s) => ({ ...s, ...p })), []);
  const fail = useCallback((e: unknown) => patch({ loading: false, error: e instanceof Error ? e.message : String(e) }), [patch]);

  useEffect(() => {
    if (!active) return;
    patch({ loading: true, error: null });
    Promise.all([api.linear(), api.linearTeams()])
      .then(([status, teams]) => setState((s) => ({ ...s, status, teams, teamId: s.teamId ?? teams.find((t) => t.key === preferKey)?.id ?? teams[0]?.id ?? null })))
      .catch(fail);
  }, [active, api, patch, fail, preferKey]);

  useEffect(() => {
    if (picked.current || !preferKey) return;
    setState((s) => {
      const preferred = s.teams.find((t) => t.key === preferKey);
      return preferred && preferred.id !== s.teamId ? { ...s, teamId: preferred.id, issues: [] } : s;
    });
  }, [preferKey, state.teams]);

  const { teamId, showDone } = state;
  const loadIssues = useCallback(() => {
    if (!teamId) return Promise.resolve();
    patch({ loading: true });
    return api
      .linearIssues(teamId, !showDone)
      .then((issues) => patch({ issues, loading: false, error: null }))
      .catch(fail);
  }, [api, teamId, showDone, patch, fail]);

  useEffect(() => {
    if (active) void loadIssues();
  }, [active, loadIssues]);

  /** Resolves to false (with the error shown) if the API said no. */
  const create = useCallback(
    async (issue: NewLinearIssue) => {
      try {
        await api.createLinearIssue(issue);
        await loadIssues();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [api, loadIssues, fail],
  );

  /** Moves the story at once and tells Linear; on a no, loads the truth again. */
  const move = useCallback(
    async (issue: LinearIssue, stateId: string) => {
      const team = state.teams.find((t) => t.id === state.teamId);
      const to = team?.states.find((s) => s.id === stateId);
      if (!to) return false;
      setState((s) => ({ ...s, issues: s.issues.map((i) => (i.id === issue.id ? { ...i, state: to } : i)) }));
      try {
        await api.moveLinearIssue(issue.id, stateId);
        return true;
      } catch (e) {
        // Load the truth first: a successful load clears the error, which must stay visible.
        await loadIssues();
        fail(e);
        return false;
      }
    },
    [api, state.teams, state.teamId, fail, loadIssues],
  );

  return {
    state,
    actions: {
      move,
      reload: loadIssues,
      pickTeam: (id: string) => {
        picked.current = true;
        patch({ teamId: id, issues: [] });
      },
      setShowDone: (showDone: boolean) => patch({ showDone }),
      create,
    },
  };
}
