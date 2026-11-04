import { useState } from 'react';
import type { Brief, LinearIssue, Project, ProjectStatus, SystemInfo } from '../api/types';
import { statusLine } from '../lib/projects';
import { relativeDay } from '../lib/time';
import { Sheet } from './Sheets';

/** The disk in the top bar; when it runs low it turns red and offers to clean up. */
export function DiskBadge({ system, onClean }: { system: SystemInfo | null; onClean: () => void }) {
  if (!system) return null;
  const { label, low } = system.disk;
  return low ? (
    <button className="conn disk low" onClick={onClean} aria-label={`Disken är nästan full, ${label}. Rensa cache`}>
      Disk · {label} – Rensa cache
    </button>
  ) : (
    <div className="conn disk">Disk · {label}</div>
  );
}

/** Today's brief, or a way to write one. */
export function BriefCard({ brief, now, onWrite }: { brief: Brief | null; now: Date; onWrite: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card enter d1" aria-label="Morgonbrief">
      <div className="card-head">
        <span className="label">Morgonbrief</span>
        <span className="meta">{brief ? relativeDay(brief.createdAt, now) : 'Vardagar · 07:40'}</span>
      </div>
      {brief ? <p className={open ? 'job-result' : 'job-result brief-short'} style={{ margin: 0 }}>{brief.text}</p> : <p className="empty">Ingen brief än.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {brief && <button className="ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Visa mindre' : 'Visa allt'}</button>}
        <button className="ghost small" onClick={onWrite}>{brief ? 'Skriv en ny' : 'Skriv nu'}</button>
      </div>
    </section>
  );
}

/** GitHub Actions and pull requests for every repo that has them. */
export function CiCard({ projects, statuses, onOpen }: { projects: Project[]; statuses: ProjectStatus[]; onOpen: (project: Project) => void }) {
  const rows = statuses
    .filter((s) => s.ci || s.pullRequests)
    .map((s) => ({ status: s, project: projects.find((p) => p.id === s.projectId) }))
    .filter((r): r is { status: ProjectStatus; project: Project } => !!r.project);
  return (
    <section className="card enter d3" aria-label="CI">
      <div className="card-head">
        <span className="label">CI · GitHub</span>
        <span className="meta">{rows.filter((r) => r.status.ci === 'failing').length} röda</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty">Inga körningar hittades. Kräver gh på datorn.</p>
      ) : (
        rows.map(({ status, project }) => (
          <button key={project.id} className="lrow ci-row" onClick={() => onOpen(project)} aria-label={`${project.name}: ${statusLine(status)}`}>
            <span className={`ci-dot ${status.ci ?? 'none'}`} />
            <span className="chore-name" style={{ flex: 1 }}>{project.name}</span>
            <span className="meta">{status.ci === 'failing' ? 'Rött' : status.ci === 'running' ? 'Kör' : status.ci === 'passing' ? 'Grönt' : '–'}{status.pullRequests ? ` · ${status.pullRequests} PR` : ''}</span>
          </button>
        ))
      )}
    </section>
  );
}

interface ProjectSheetProps {
  project: Project;
  status: ProjectStatus | undefined;
  /** null while loading; an error message when Linear did not answer. */
  stories: LinearIssue[] | null | string;
  onClose: () => void;
}

/** A project's repo, CI and open stories. */
export function ProjectSheet({ project, status, stories, onClose }: ProjectSheetProps) {
  return (
    <Sheet
      eyebrow={['Projekt', project.meta].join(' · ')}
      title={`${project.name}.`}
      label={`Projekt: ${project.name}`}
      onClose={onClose}
    >
      <p className="chore-desc" style={{ margin: '0 0 8px' }}>{project.body}</p>
      {status && (
        <section aria-label="Repo" className="chore-group">
          <span className="label">Repo</span>
          <span className="lrow meta">{statusLine(status)}</span>
          {status.lastCommit && <span className="lrow meta">Senast · {status.lastCommit.message}</span>}
          {status.ciUrl && (
            <a className="lrow meta" href={status.ciUrl} target="_blank" rel="noreferrer">Öppna senaste körningen på GitHub</a>
          )}
        </section>
      )}
      <section aria-label="Stories" className="chore-group">
        <span className="label">{project.linearTeam ? `Stories · ${project.linearTeam}` : 'Stories'}</span>
        {!project.linearTeam ? (
          <p className="empty">Inte kopplat till Linear. Sätt Veloq:LinearTeams:{project.id} i API:t.</p>
        ) : stories === null ? (
          <p className="empty">Hämtar stories…</p>
        ) : typeof stories === 'string' ? (
          <p className="chore-error">{stories}</p>
        ) : stories.length === 0 ? (
          <p className="empty">Inga öppna stories.</p>
        ) : (
          stories.map((s) => (
            <div key={s.id} className="lrow chore-row">
              <div className="chore-text">
                <span className="meta">{s.identifier} · {s.state.name}</span>
                <span className="chore-name">{s.title}</span>
              </div>
            </div>
          ))
        )}
      </section>
    </Sheet>
  );
}
