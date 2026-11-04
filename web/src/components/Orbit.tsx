import { useMemo, useState, type CSSProperties } from 'react';
import type { Chore, Job, Project, ProjectStatus } from '../api/types';
import { statusLine } from '../lib/projects';
import { placeChores, placeOrbs, placeSkills, pointerOffset, SCENE } from '../lib/orbit';
import { choreIcon, Icon } from './Icon';

interface Props {
  projects: Project[];
  chores: Chore[];
  /** Your skills, on the ring outside the chores. They run through onRunChore too. */
  skills?: Chore[];
  jobs: Job[];
  query: string;
  onRunChore: (id: string) => void;
  onPromptProject: (project: Project) => void;
  /** git and CI per project; a project that needs attention gets a dot. */
  statuses?: ProjectStatus[];
  onOpenProject?: (project: Project) => void;
}

const PARALLAX = 12;

/** Projects float around the chores and skills core. The pointer shifts the layers for depth. */
export function Orbit({ projects, chores, skills = [], jobs, query, onRunChore, onPromptProject, statuses = [], onOpenProject }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);

  const orbs = useMemo(() => placeOrbs(projects), [projects]);
  const nodes = useMemo(() => placeChores(chores.length), [chores.length]);
  const skillNodes = useMemo(() => placeSkills(skills.length), [skills.length]);
  const q = query.trim().toLowerCase();

  // The core shows the newest chore or skill job.
  const runnable = [...chores, ...skills];
  const latest = jobs.find((j) => runnable.some((c) => c.id === j.choreId));
  const latestChore = latest ? runnable.find((c) => c.id === latest.choreId) : undefined;
  const stateOf = (id: string) => jobs.find((j) => j.choreId === id)?.status;

  const shift = (k: number): CSSProperties => ({
    transform: `translate3d(${(offset.x * PARALLAX * k).toFixed(1)}px, ${(offset.y * PARALLAX * k).toFixed(1)}px, 0)`,
  });

  const project = projects.find((p) => p.id === selected);
  const projectStatus = statuses.find((s) => s.projectId === selected);

  return (
    <section
      className="card orbit-card enter d2"
      aria-label="Orbit: projekt och chores"
      onMouseMove={(e) => setOffset(pointerOffset(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))}
    >
      <div className="orbit-head">
        <span className="label">Orbit</span>
        <span className="meta">Projekt runt om · chores och skills i mitten</span>
      </div>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: 'var(--accent)' }} />Aktiv</span>
        <span><i style={{ border: '1px solid var(--ink-soft)' }} />Planerad</span>
        <span><i style={{ border: '1px solid var(--line-strong)' }} />Vilande</span>
      </div>

      <div className="scene">
        <div className="layer" style={shift(-0.4)} aria-hidden="true">
          <svg width={SCENE.width} height={SCENE.height} viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}>
            <g className="spin-rev">
              <ellipse cx={SCENE.cx} cy={SCENE.cy} rx={SCENE.rx} ry={SCENE.ry} fill="none" stroke="#F2F4F8" strokeOpacity=".08" strokeDasharray="2 9" />
            </g>
            <g className="spin-slow">
              <circle cx={SCENE.cx} cy={SCENE.cy} r={SCENE.choreRadius} fill="none" stroke="#F2F4F8" strokeOpacity=".09" strokeDasharray="1 6" />
            </g>
            {skills.length > 0 && (
              <circle cx={SCENE.cx} cy={SCENE.cy} r={SCENE.skillRadius} fill="none" stroke="#F2F4F8" strokeOpacity=".06" strokeDasharray="1 8" />
            )}
          </svg>
        </div>

        <div className="layer" style={shift(-1)}>
          <svg width={SCENE.width} height={SCENE.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
            {orbs.map((o) => {
              const lit = o.project.id === selected || (q && o.project.name.toLowerCase().includes(q));
              return (
                <line
                  key={o.project.id}
                  x1={SCENE.cx}
                  y1={SCENE.cy}
                  x2={o.x}
                  y2={o.y}
                  stroke={lit ? '#3DF2C6' : '#F2F4F8'}
                  strokeOpacity={lit ? 0.5 : 0.07}
                  strokeDasharray="2 7"
                />
              );
            })}
          </svg>
          {orbs.map((o) => {
            const match = !!q && o.project.name.toLowerCase().includes(q);
            const pressed = o.project.id === selected;
            const attention = statuses.some((s) => s.projectId === o.project.id && s.attention);
            return (
              <div
                key={o.project.id}
                className="float"
                style={{
                  left: o.x - 60,
                  top: o.y - o.size / 2,
                  animationDuration: `${6.5 + (o.index % 5) * 0.9}s`,
                  animationDelay: `-${(o.index * 1.2).toFixed(1)}s`,
                }}
              >
                <button
                  className={`orb tier-${o.project.tier}${match ? ' match' : ''}`}
                  aria-pressed={pressed}
                  aria-label={`${o.project.name}, ${o.project.status}${attention ? ', behöver uppmärksamhet' : ''}`}
                  onClick={() => setSelected(pressed ? null : o.project.id)}
                >
                  <span className="ball" style={{ width: o.size, height: o.size }}>
                    {o.project.tier === 3 && <span className="sat" />}
                    {attention && <span className="attn" />}
                    {String(o.index + 1).padStart(2, '0')}
                  </span>
                  <span className="name">{o.project.name}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="layer" style={{ ...shift(0.3), pointerEvents: 'none' }}>
          <div className="core" style={{ pointerEvents: 'auto' }}>
            <svg width="200" height="200" viewBox="0 0 200 200" style={{ position: 'absolute', left: -100, top: -100 }} aria-hidden="true">
              <circle cx="100" cy="100" r="72" fill="#0B0D12" stroke="#2A303C" />
              <circle
                className="charge"
                cx="100"
                cy="100"
                r="72"
                fill="none"
                stroke="#3DF2C6"
                strokeWidth="2"
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
                style={{ '--p': latest ? latest.progress : 0 } as CSSProperties}
              />
              <circle cx="100" cy="100" r="58" fill="none" stroke="#1A1E27" />
            </svg>
            <div className="core-text" aria-live="polite">
              {latest && latestChore ? (
                <>
                  <span className={latest.status === 'running' ? 'eyebrow' : 'label'} style={{ fontSize: 11 }}>
                    {latest.status === 'running' ? 'Kör' : 'Klart'}
                  </span>
                  <strong>{latest.status === 'running' ? `${latestChore.name}…` : `${latestChore.name}.`}</strong>
                </>
              ) : (
                <>
                  <span className="label" style={{ fontSize: 11 }}>Chores</span>
                  <strong>Välj en.</strong>
                </>
              )}
            </div>
            {chores.map((c, i) => (
              <button
                key={c.id}
                className="node"
                data-state={stateOf(c.id) ?? 'idle'}
                style={{ left: nodes[i].x, top: nodes[i].y }}
                aria-label={`Kör chore: ${c.name}`}
                title={c.name}
                onClick={() => onRunChore(c.id)}
              >
                <Icon name={choreIcon[c.icon] ?? 'doc'} size={20} />
              </button>
            ))}
            {skills.map((s, i) => (
              <button
                key={s.id}
                className="skill-node"
                data-state={stateOf(s.id) ?? 'idle'}
                style={{ left: skillNodes[i].x, top: skillNodes[i].y }}
                aria-label={`Kör skill: ${s.name}`}
                title={s.description || s.name}
                onClick={() => onRunChore(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {project && (
        <div className="project-bar" role="region" aria-label={`Projekt ${project.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{project.name}</span>
              <span className="pill">{project.status}</span>
            </div>
            <span className="ellipsis" style={{ fontSize: 15, color: 'var(--ink-body)' }}>{project.body}</span>
            {projectStatus && <span className="meta ellipsis">{statusLine(projectStatus)}</span>}
          </div>
          {onOpenProject && <button className="ghost" style={{ minHeight: 48 }} onClick={() => onOpenProject(project)}>Detaljer</button>}
          <button className="primary" style={{ minHeight: 48 }} onClick={() => onPromptProject(project)}>Prompta</button>
          <button className="icon-btn" aria-label="Stäng projekt" onClick={() => setSelected(null)}>
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
      )}
    </section>
  );
}
