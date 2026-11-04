import type { ProjectStatus } from '../api/types';

const CI_LABEL = { passing: 'CI grönt', failing: 'CI rött', running: 'CI kör' } as const;

/** The status in one line: branch, uncommitted files, unpushed commits, pull requests and CI. */
export function statusLine(status: ProjectStatus): string {
  if (status.error) return status.error;
  return [
    status.branch,
    status.changes > 0 ? `${status.changes} ändrade` : 'rent',
    status.ahead ? `${status.ahead} opushade` : null,
    status.pullRequests ? `${status.pullRequests} PR` : null,
    status.ci ? CI_LABEL[status.ci] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
