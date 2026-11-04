import type { Chore, Job } from '../api/types';

/** A chore that takes a project or an addition opens the run sheet; the rest run on a tap. */
export const needsRunSheet = (chore: Chore) => chore.project !== 'none' || chore.argument !== null;

export const waitsForChoice = (job: Job) => job.status === 'done' && (job.choices?.length ?? 0) > 0;

/** One line about a job for the jobs card: where it runs, then its step, outcome or the wait for your choice. */
export function jobLine(job: Job): string {
  const state =
    job.status === 'running'
      ? job.step
      : job.status === 'failed'
        ? 'Misslyckades'
        : waitsForChoice(job)
          ? 'Väntar på ditt val'
          : (job.result?.split('\n').find((l) => l.trim()) ?? 'Klart');
  return job.project ? `${job.project} · ${state}` : state;
}
