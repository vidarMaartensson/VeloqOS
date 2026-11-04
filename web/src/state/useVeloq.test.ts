import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { fakeApi } from '../test/fakeApi';
import { brief, runningJob, statuses, systemLow, waitingJob } from '../test/fixtures';
import { useVeloq } from './useVeloq';

describe('useVeloq chores', () => {
  it('runs with project and addition, and hands back why the API said no', async () => {
    const runChore = vi.fn()
      .mockResolvedValueOnce(runningJob('skill-pr'))
      .mockRejectedValueOnce(new ApiError(400, 'Välj ett projekt först.'));
    const api = fakeApi({ runChore, jobs: vi.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useVeloq(api));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let problem: string | null = 'x';
    await act(async () => { problem = await result.current.actions.runChore('skill-pr', { projectId: 'veloq-os', argument: 'Titel' }); });
    expect(problem).toBeNull();
    expect(runChore).toHaveBeenCalledWith('skill-pr', { projectId: 'veloq-os', argument: 'Titel' });
    expect(result.current.state.jobs[0].choreId).toBe('skill-pr');

    await act(async () => { problem = await result.current.actions.runChore('unused-packages', {}); });
    expect(problem).toBe('Välj ett projekt först.');
    expect(result.current.state.error).toBeNull();
  });

  it('stops waiting on a job once its choices are approved', async () => {
    const followUp = { ...runningJob('unused-packages'), id: 'job-remove' };
    const confirmJob = vi.fn().mockResolvedValue(followUp);
    const api = fakeApi({ confirmJob, jobs: vi.fn().mockResolvedValue([waitingJob]) });
    const { result } = renderHook(() => useVeloq(api));
    await waitFor(() => expect(result.current.state.jobs).toHaveLength(1));

    await act(async () => { await result.current.actions.confirmJob('job-unused', ['web-lodash']); });

    expect(confirmJob).toHaveBeenCalledWith('job-unused', ['web-lodash']);
    expect(result.current.state.jobs.map((j) => j.id)).toEqual(['job-remove', 'job-unused']);
    expect(result.current.state.jobs[1].choices).toBeNull();
  });
});

describe('useVeloq extras', () => {
  it('loads disk, project status and the brief without holding up the dashboard', async () => {
    const api = fakeApi({ system: vi.fn().mockResolvedValue(systemLow), brief: vi.fn().mockResolvedValue(brief), projectStatus: vi.fn().mockRejectedValue(new Error('gh saknas')) });
    const { result } = renderHook(() => useVeloq(api));

    await waitFor(() => expect(result.current.state.brief).toEqual(brief));
    expect(result.current.state.system?.disk.low).toBe(true);
    expect(result.current.state.statuses).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it('runs a routine now and lists its job', async () => {
    const runRoutine = vi.fn().mockResolvedValue(runningJob('week-summary'));
    const api = fakeApi({ runRoutine, projectStatus: vi.fn().mockResolvedValue(statuses) });
    const { result } = renderHook(() => useVeloq(api));
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    await act(() => result.current.actions.runRoutine('week-review'));

    expect(runRoutine).toHaveBeenCalledWith('week-review');
    expect(result.current.state.jobs[0].choreId).toBe('week-summary');
  });
});
