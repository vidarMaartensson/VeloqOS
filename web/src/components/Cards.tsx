import type { Artifact, Job, Overview } from '../state/types';
import type { TimelineEntry } from '../lib/today';
import { Icon, THUMBS } from './Icon';
import { jobLine, waitsForChoice } from '../lib/chores';

export function StatRow({ overview, onOpen }: { overview: Overview | null; onOpen: (what: 'projects' | 'jobs' | 'inbox' | 'routines' | 'artifacts') => void }) {
  const o = overview;
  const stats = [
    { key: 'projects' as const, label: 'Projekt', num: o?.projects, sub: `${o?.activeProjects ?? 0} aktiva` },
    { key: 'jobs' as const, label: 'Jobb', num: o?.runningJobs, sub: 'på datorn' },
    { key: 'inbox' as const, label: 'Inkorg', num: o?.inboxNeedsYou, sub: 'behöver dig' },
    { key: 'routines' as const, label: 'Rutiner', num: o?.routinesOn, sub: `av ${o?.routinesTotal ?? 0} på` },
    { key: 'artifacts' as const, label: 'Artefakter', num: o?.artifacts, sub: 'byggda' },
  ];
  return (
    <div className="stats enter d1">
      {stats.map((s) => (
        <button key={s.key} className="stat" onClick={() => onOpen(s.key)} aria-label={`${s.label}: ${s.num ?? 'laddar'} ${s.sub}`}>
          <span className="label">{s.label}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="num">{s.num ?? '–'}</span>
            <span className="meta">{s.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function TodayCard({ entries, onOpenRoutines }: { entries: TimelineEntry[]; onOpenRoutines: () => void }) {
  return (
    <section className="card grow enter d2" aria-label="Idag">
      <div className="card-head">
        <span className="label">Idag</span>
        <button className="link-btn" onClick={onOpenRoutines}>Rutiner</button>
      </div>
      {entries.length === 0 ? (
        <p className="empty">Inget schemalagt idag.</p>
      ) : (
        <ol className="timeline" style={{ listStyle: 'none', margin: 0 }}>
          {entries.map((t) => (
            <li key={`${t.kind}-${t.time}-${t.name}`} className={`tl-row${t.past ? ' past' : ''}`}>
              <span className="tl-dot" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span className="meta">{t.time}</span>
                <span className="tl-name">{t.name}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function JobsCard({ jobs, onOpen }: { jobs: Job[]; onOpen: (job: Job) => void }) {
  const shown = jobs.slice(0, 3);
  return (
    <section className="card grow enter d3" aria-label="Pågående jobb">
      <div className="card-head">
        <span className="label">Jobb</span>
        <span className="meta">på datorn</span>
      </div>
      {shown.length === 0 ? (
        <p className="empty">Inget körs just nu. Starta en chore i orbiten.</p>
      ) : (
        shown.map((j) => (
          <button key={j.id} className="job job-btn" onClick={() => onOpen(j)} aria-label={`Visa jobb: ${j.title}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {j.status === 'running' ? (
                <span className="live" />
              ) : (
                <Icon name={j.status === 'failed' ? 'close' : waitsForChoice(j) ? 'task' : 'check'} size={16} strokeWidth={1.8} />
              )}
              <span style={{ fontSize: 16, fontWeight: 500 }}>{j.title}</span>
            </div>
            <span className={j.status === 'failed' ? 'meta job-failed' : 'meta'}>{jobLine(j)}</span>
            <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)} aria-label={j.title}>
              <div style={{ transform: `scaleX(${j.progress})` }} />
            </div>
          </button>
        ))
      )}
    </section>
  );
}

export const GROUPS = ['Alla', 'Veloq', 'Yagi', 'Jobb', 'Spel', 'Övrigt'];

export const KIND_LABEL: Record<Artifact['kind'], string> = {
  doc: 'Dokument',
  plan: 'Plan',
  map: 'Karta',
  screen: 'Skärm',
  web: 'Webb',
  logo: 'Logo',
  system: 'Design system',
  spike: 'Spike',
  icon: 'Ikon',
};

export function ArtifactShelf({ artifacts, query, group, onGroup, onSync, syncing = false }: { artifacts: Artifact[]; query: string; group: string; onGroup: (g: string) => void; onSync?: () => void; syncing?: boolean }) {
  const q = query.trim().toLowerCase();
  const shown = artifacts.filter((a) => (group === 'Alla' || a.group === group) && (!q || a.title.toLowerCase().includes(q)));
  return (
    <section id="shelf" className="enter d4" aria-label="Artefakter" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div className="shelf-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="label">Artefakter</span>
          <span className="meta">{shown.length} av {artifacts.length}</span>
          {onSync && (
            <button className="ghost small" onClick={onSync} disabled={syncing}>{syncing ? 'Synkar…' : 'Synka från claude.ai'}</button>
          )}
        </div>
        <div className="shelf-filters" role="group" aria-label="Filtrera artefakter">
          {GROUPS.map((g) => (
            <button key={g} className="chip" aria-pressed={group === g} onClick={() => onGroup(g)}>{g}</button>
          ))}
        </div>
      </div>
      <div className="shelf">
        {shown.length === 0 && <p className="empty">Inga artefakter matchar.</p>}
        {shown.map((a) => {
          const [ink, accent] = THUMBS[a.kind] ?? THUMBS.doc;
          return (
            <a key={a.id} className="art" href={a.url} target="_blank" rel="noopener noreferrer">
              <div className="thumb">
                <svg width="168" height="98" viewBox="0 0 240 140" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={ink} stroke="#8A93A3" strokeWidth="2.4" />
                  <path d={accent} stroke="#3DF2C6" strokeWidth="3" />
                </svg>
              </div>
              <div className="info">
                <span className="title ellipsis">{a.title}</span>
                <span className="meta">{KIND_LABEL[a.kind]} · {formatDay(a.updatedAt)}</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace('.', '');
