import { useLayoutEffect, useRef } from 'react';
import type { Chore, Job } from '../../api/types';
import { gsap, reducedMotion } from '../../lib/motion';

interface Props {
  chores: Chore[];
  jobs: Job[];
  onRun: (chore: Chore) => void;
  onOpenAll: () => void;
  /** Opens the Claude app's job that files week-old Code sessions under gamla-chattar. */
  onOldChats?: () => void;
}

const RING = 2 * Math.PI * 21;

/** Your skills and the quick chores as keys: press one and its ring fills while the job runs. */
export function SkillsTile({ chores, jobs, onRun, onOpenAll, onOldChats }: Props) {
  const ownButton = ['disk-cleanup', 'old-chats'];
  const keys = [...chores.filter((c) => c.kind === 'skill'), ...chores.filter((c) => c.kind === 'chore' && !ownButton.includes(c.id))].slice(0, 9);
  const oldChats = onOldChats && chores.some((c) => c.id === 'old-chats');
  const box = useRef<HTMLDivElement>(null);

  const press = (chore: Chore, el: HTMLElement) => {
    if (!reducedMotion()) {
      gsap.timeline()
        .to(el, { y: 4, scale: 0.94, duration: 0.08, ease: 'power2.in' })
        .to(el, { y: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1.2,0.4)' });
    }
    onRun(chore);
  };

  useLayoutEffect(() => {
    if (!box.current || reducedMotion()) return;
    gsap.from(box.current.querySelectorAll('.key'), { y: 16, opacity: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(2)', clearProps: 'all' });
  }, [keys.length]);

  return (
    <section className="card tile skills-tile" data-tile="skills" aria-label="Skills">
      <header className="tile-head">
        <span className="eyebrow">Skills</span>
        <span className="meta">{jobs.filter((j) => j.status === 'running').length} kör</span>
        {oldChats && <button className="ghost sm" onClick={onOldChats}>Gamla chattar</button>}
        <button className="ghost sm" onClick={onOpenAll}>Alla</button>
      </header>
      <div className="keys" ref={box}>
        {keys.map((chore) => {
          const job = jobs.find((j) => j.choreId === chore.id);
          const running = job?.status === 'running';
          const progress = running ? job.progress : 0;
          const label = chore.kind === 'skill' ? `/${chore.name.replace(/^\//, '')}` : chore.name;
          const meta = running ? `${Math.round(progress * 100)} %` : chore.estimate;
          return (
            <button
              key={chore.id}
              className={`key${running ? ' running' : ''}`}
              onClick={(e) => press(chore, e.currentTarget)}
              disabled={running}
              aria-label={`Starta ${label} ${meta}`}
              title={chore.description}
            >
              <svg className="ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="21" stroke="var(--line-strong)" strokeWidth="2" fill="none" />
                <circle cx="24" cy="24" r="21" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round"
                  strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} transform="rotate(-90 24 24)" />
              </svg>
              <span className="key-name ellipsis">{label}</span>{' '}
              <span className="meta">{meta}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
