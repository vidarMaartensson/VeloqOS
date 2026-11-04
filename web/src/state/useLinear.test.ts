import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fakeApi';
import { linearIssue, linearIssues, linearTeams, linearWorkspaces } from '../test/fixtures';
import { useLinear } from './useLinear';

function linearApi() {
  return fakeApi({
    linear: vi.fn().mockResolvedValue({ configured: true, workspaces: linearWorkspaces }),
    linearTeams: vi.fn().mockResolvedValue(linearTeams),
    linearIssues: vi.fn().mockResolvedValue(linearIssues),
    createLinearIssue: vi.fn().mockResolvedValue(linearIssue(9)),
  });
}

describe('useLinear', () => {
  it('loads nothing until the view opens, then the first team', async () => {
    const api = linearApi();
    const { result, rerender } = renderHook(({ active }) => useLinear(active, api), { initialProps: { active: false } });
    expect(api.linear).not.toHaveBeenCalled();

    rerender({ active: true });

    await waitFor(() => expect(result.current.state.issues).toHaveLength(3));
    expect(result.current.state.teamId).toBe('t-veloq');
    expect(api.linearIssues).toHaveBeenCalledWith('t-veloq', true);
  });

  it('reloads for another team, done stories and after creating', async () => {
    const api = linearApi();
    const { result } = renderHook(() => useLinear(true, api));
    await waitFor(() => expect(result.current.state.teamId).toBe('t-veloq'));

    act(() => result.current.actions.pickTeam('t-halo'));
    await waitFor(() => expect(api.linearIssues).toHaveBeenLastCalledWith('t-halo', true));
    act(() => result.current.actions.setShowDone(true));
    await waitFor(() => expect(api.linearIssues).toHaveBeenLastCalledWith('t-halo', false));

    const calls = vi.mocked(api.linearIssues).mock.calls.length;
    await act(async () => {
      expect(await result.current.actions.create({ teamId: 't-halo', title: 'Ny', description: null, priority: 0, stateId: null })).toBe(true);
    });
    expect(vi.mocked(api.linearIssues).mock.calls.length).toBe(calls + 1);
  });

  it('switches to the preferred team once it is known, unless you picked one yourself', async () => {
    const api = linearApi();
    const { result, rerender } = renderHook(({ prefer }) => useLinear(true, api, { preferKey: prefer }), { initialProps: { prefer: null as string | null } });
    await waitFor(() => expect(result.current.state.teamId).toBe('t-veloq'));

    rerender({ prefer: 'HAL' });
    await waitFor(() => expect(result.current.state.teamId).toBe('t-halo'));

    act(() => result.current.actions.pickTeam('t-plattform'));
    rerender({ prefer: 'VEL' });
    expect(result.current.state.teamId).toBe('t-plattform');
  });

  it('moves a story at once and loads again when Linear says no', async () => {
    const api = linearApi();
    api.moveLinearIssue = vi.fn().mockRejectedValue(new Error('Linear: nope'));
    const { result } = renderHook(() => useLinear(true, api));
    await waitFor(() => expect(result.current.state.issues).toHaveLength(3));

    let ok = true;
    await act(async () => { ok = await result.current.actions.move(linearIssues[1], 'done'); });

    expect(ok).toBe(false);
    expect(api.moveLinearIssue).toHaveBeenCalledWith('VEL-2', 'done');
    expect(result.current.state.error).toBe('Linear: nope');
    expect(vi.mocked(api.linearIssues).mock.calls.length).toBeGreaterThan(1);
  });
});
