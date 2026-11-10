import { useState } from 'react';
import type { Chore, Job, Project, RunOptions } from '../api/types';
import { needsRunSheet } from '../lib/chores';
import { choreIcon, Icon } from './Icon';
import { Sheet } from './Sheets';

/** Every chore and skill, built-in first. Picking one runs it, or opens the run sheet when it needs more. */
export function SkillsSheet({ chores, onPick, onClose }: { chores: Chore[]; onPick: (chore: Chore) => void; onClose: () => void }) {
  const groups = [
    { label: 'Chores', items: chores.filter((c) => c.kind === 'chore') },
    { label: 'Dina skills', items: chores.filter((c) => c.kind === 'skill') },
  ];
  return (
    <Sheet eyebrow="Skills · chores" title="Det datorn kan göra åt dig." label="Skills" onClose={onClose}>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="chore-group">
          <span className="label">{g.label}</span>
          {g.items.length === 0 ? (
            <p className="empty">Inga skills i ~/.claude/skills än.</p>
          ) : (
            g.items.map((c) => (
              <div key={c.id} className="lrow chore-row">
                <span className="chore-ico"><Icon name={choreIcon[c.icon] ?? 'doc'} size={18} /></span>
                <div className="chore-text">
                  <span className={c.kind === 'skill' ? 'chore-name mono' : 'chore-name'}>{c.name}</span>
                  {c.description && <span className="chore-desc">{c.description}</span>}
                </div>
                <button className="ghost" onClick={() => onPick(c)} aria-label={needsRunSheet(c) ? `Kör ${c.name}: välj` : `Kör ${c.name}`}>
                  {needsRunSheet(c) ? 'Välj' : 'Kör'}
                </button>
              </div>
            ))
          )}
        </section>
      ))}
    </Sheet>
  );
}

interface RunSheetProps {
  chore: Chore;
  projects: Project[];
  /** Resolves to an error to show, or null when the job started. */
  onRun: (id: string, options: RunOptions) => Promise<string | null>;
  onClose: () => void;
}

/** Picks the project and the free-text addition a chore takes, then runs it. */
export function RunSheet({ chore, projects, onRun, onClose }: RunSheetProps) {
  const withFolder = projects.filter((p) => p.repoPath);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [argument, setArgument] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = chore.project !== 'required' || projectId !== null;
  const run = async () => {
    setBusy(true);
    const problem = await onRun(chore.id, {
      ...(projectId ? { projectId } : {}),
      ...(argument.trim() ? { argument: argument.trim() } : {}),
    });
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <Sheet
      eyebrow={chore.kind === 'skill' ? 'Skill · körs i Claude Code' : `Chore · ${chore.estimate}`}
      title={`Kör ${chore.name}.`}
      label={`Kör ${chore.name}`}
      onClose={onClose}
      footer={
        <button className="primary" onClick={run} disabled={!ready || busy}>
          {busy ? 'Startar…' : 'Kör'}
        </button>
      }
    >
      {chore.description && <p className="chore-desc" style={{ margin: '0 0 12px' }}>{chore.description}</p>}
      {chore.project !== 'none' && (
        <>
          <span className="label" id="run-project">{chore.project === 'required' ? 'Projekt' : 'Projekt · valfritt'}</span>
          <div className="linear-bar" role="group" aria-labelledby="run-project">
            {chore.project === 'optional' && (
              <button className="chip" aria-pressed={projectId === null} onClick={() => setProjectId(null)}>Inget projekt</button>
            )}
            {withFolder.map((p) => (
              <button key={p.id} className="chip" aria-pressed={projectId === p.id} onClick={() => setProjectId(p.id)}>{p.name}</button>
            ))}
          </div>
          {withFolder.length === 0 && <p className="empty">Inga projekt har en mapp på datorn.</p>}
        </>
      )}
      {chore.argument && (
        <>
          <label className="label" htmlFor="run-argument">Tillägg</label>
          <input id="run-argument" className="input" value={argument} placeholder={chore.argument} onChange={(e) => setArgument(e.target.value)} />
        </>
      )}
      {error && <p role="alert" className="chore-error">{error}</p>}
    </Sheet>
  );
}

interface JobSheetProps {
  job: Job;
  /** Resolves to an error to show, or null when the approved job started. */
  onConfirm: (id: string, choices: string[]) => Promise<string | null>;
  onClose: () => void;
}

const JOB_TITLE: Record<Job['status'], string> = {
  running: 'Jobbet körs.',
  done: 'Jobbet är klart.',
  failed: 'Jobbet misslyckades.',
};

/** A job's whole answer, and its proposal to approve when it has one. */
export function JobSheet({ job, onConfirm, onClose }: JobSheetProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const confirm = async () => {
    setBusy(true);
    const problem = await onConfirm(job.id, picked);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <Sheet
      eyebrow={[job.title, job.project].filter(Boolean).join(' · ')}
      title={job.choices ? 'Välj vad som ska göras.' : JOB_TITLE[job.status]}
      label={`Jobb: ${job.title}`}
      onClose={onClose}
      footer={
        job.choices && job.confirm ? (
          <button className="primary" onClick={confirm} disabled={picked.length === 0 || busy}>
            {busy ? 'Startar…' : job.confirm}
          </button>
        ) : undefined
      }
    >
      {job.status === 'running' && <span className="meta">{job.step}</span>}
      {job.result && <p className={job.status === 'failed' ? 'job-result failed' : 'job-result'}>{job.result}</p>}
      {job.choices && (
        <fieldset className="job-choices">
          <legend className="label">Förslag</legend>
          {job.choices.map((c) => (
            <label key={c.id} className="lrow job-choice">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              <span className="chore-text">
                <span className="chore-name">{c.label}</span>
                {c.detail && <span className="meta">{c.detail}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && <p role="alert" className="chore-error">{error}</p>}
    </Sheet>
  );
}
