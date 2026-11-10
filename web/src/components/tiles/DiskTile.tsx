import { useLayoutEffect, useRef, useState } from 'react';
import type { Job, JobChoice, SystemInfo } from '../../api/types';
import { Draggable, center, gsap, reducedMotion } from '../../lib/motion';
import { bubbleSize, gb, sizeOf } from '../../lib/voice';
import { usePortal } from '../voice/Portal';

interface Props {
  system: SystemInfo | null;
  jobs: Job[];
  rick: boolean;
  onScan: () => void;
  /** Resolves to the API's complaint, or null when the cleanup started. */
  onConfirm: (jobId: string, choices: string[]) => Promise<string | null>;
  onToast: (text: string) => void;
}

// Where the bubbles float, as fractions of the box.
const SPOTS = [[0.04, 0.06], [0.5, 0.02], [0.27, 0.4], [0.68, 0.44], [0.02, 0.62], [0.44, 0.72], [0.76, 0.06]];

/** One bubble: a single choice, or the smallest ones together. */
interface Group { key: string; label: string; ids: string[]; bytes: number | null }

/** The biggest choices as their own bubbles; past seven, the smallest share the last one. */
export function groupChoices(choices: JobChoice[], max = SPOTS.length): Group[] {
  const sorted = [...choices].sort((a, b) => (sizeOf(b.detail) ?? 0) - (sizeOf(a.detail) ?? 0));
  const one = (c: JobChoice): Group => ({ key: c.id, label: c.label, ids: [c.id], bytes: sizeOf(c.detail) });
  if (sorted.length <= max) return sorted.map(one);
  const rest = sorted.slice(max - 1);
  return [
    ...sorted.slice(0, max - 1).map(one),
    { key: 'rest', label: `Övrigt · ${rest.length} st`, ids: rest.map((c) => c.id), bytes: rest.reduce((s, c) => s + (sizeOf(c.detail) ?? 0), 0) },
  ];
}

/**
 * Disk: the cleanup proposal as floating bubbles. Drag one into the portal to pick it (it gets eaten),
 * then approve; nothing is deleted before that.
 */
export function DiskTile({ system, jobs, rick, onScan, onConfirm, onToast }: Props) {
  const scanning = jobs.some((j) => j.choreId === 'disk-cleanup' && j.status === 'running');
  const waiting = jobs.find((j) => j.choreId === 'disk-cleanup' && j.status === 'done' && (j.choices?.length ?? 0) > 0);
  const [fed, setFed] = useState<{ jobId: string; ids: string[] }>({ jobId: '', ids: [] });
  const picked = waiting && fed.jobId === waiting.id ? fed.ids : [];
  const left = (waiting?.choices ?? []).filter((c) => !picked.includes(c.id));
  const pickedBytes = (waiting?.choices ?? []).filter((c) => picked.includes(c.id)).reduce((s, c) => s + (sizeOf(c.detail) ?? 0), 0);
  const junkBytes = (waiting?.choices ?? []).reduce((s, c) => s + (sizeOf(c.detail) ?? 0), 0);
  const [busy, setBusy] = useState(false);

  const disk = system?.disk;
  const used = disk ? disk.total - disk.free : 0;
  const pct = (bytes: number) => (disk && disk.total > 0 ? `${Math.max(0, Math.min(100, (bytes / disk.total) * 100))}%` : '0%');

  const feed = (ids: string[]) => {
    if (!waiting) return;
    setFed((f) => ({ jobId: waiting.id, ids: [...(f.jobId === waiting.id ? f.ids : []), ...ids] }));
  };

  const approve = async () => {
    if (!waiting || picked.length === 0) return;
    setBusy(true);
    const problem = await onConfirm(waiting.id, picked);
    setBusy(false);
    if (problem) return onToast(problem);
    onToast(rick ? `Rensar ${gb(pickedBytes)} GB. Din dator tackar mig, inte dig.` : `Rensar ${gb(pickedBytes)} GB.`);
    setFed({ jobId: '', ids: [] });
  };

  return (
    <section className="card tile disk-tile" data-tile="disk" aria-label="Disk">
      <header className="tile-head">
        <span className="eyebrow">Disk</span>
        <span className="meta">{disk?.label ?? '…'}</span>
      </header>
      <div className="disk-bar" aria-hidden="true">
        <span className="used" style={{ width: pct(used - junkBytes) }} />
        <span className="junk" style={{ width: pct(junkBytes - pickedBytes) }} />
      </div>

      {waiting ? (
        <>
          <Bubbles key={waiting.id} groups={groupChoices(left)} rick={rick} onFeed={feed} onToast={onToast} />
          <div className="row">
            {picked.length > 0 ? (
              <>
                <button className="primary" onClick={approve} disabled={busy}>Rensa {picked.length} · {gb(pickedBytes)} GB</button>
                <button className="ghost" onClick={() => setFed({ jobId: '', ids: [] })} disabled={busy}>Ångra</button>
              </>
            ) : (
              <span className="meta">Dra en bubbla in i portalen för att välja den.</span>
            )}
          </div>
        </>
      ) : (
        <div className="tile-empty">
          <p>{scanning ? 'Letar efter skräp…' : rick ? 'Vill du veta hur mycket skräp du samlat på dig? Jag vet redan.' : 'Leta upp cache och byggmappar som går att rensa.'}</p>
          <button className="primary" onClick={onScan} disabled={scanning}>{scanning ? 'Skannar…' : 'Skanna disken'}</button>
        </div>
      )}
    </section>
  );
}

function Bubbles({ groups, rick, onFeed, onToast }: { groups: Group[]; rick: boolean; onFeed: (ids: string[]) => void; onToast: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const portal = usePortal();
  const latest = useRef({ groups, onFeed, onToast, rick });
  latest.current = { groups, onFeed, onToast, rick };
  const ids = groups.map((g) => g.ids.join('+')).join('|');

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const bubbles = Array.from(root.querySelectorAll<HTMLElement>('.bub'));
    const reduce = reducedMotion();
    const floats = reduce ? [] : bubbles.map((b) => gsap.to(b.firstElementChild, {
      y: gsap.utils.random(-6, 6), x: gsap.utils.random(-4, 4), duration: gsap.utils.random(1.6, 2.6), yoyo: true, repeat: -1, ease: 'sine.inOut',
    }));

    /** Spirals the bubble into the portal, then hands the choice over. */
    const suck = (b: HTMLElement) => {
      if (b.dataset.gone) return;
      b.dataset.gone = '1';
      Draggable.get(b)?.kill();
      const group = latest.current.groups.find((g) => g.key === b.dataset.id);
      const done = () => {
        portal.current?.burst();
        if (group) latest.current.onFeed(group.ids);
      };
      const target = portal.current?.el();
      if (reduce || !target) return done();
      const p = center(target), c = center(b);
      const x = Number(gsap.getProperty(b, 'x')), y = Number(gsap.getProperty(b, 'y'));
      root.closest('.tile')?.classList.add('raised');
      gsap.timeline({ onComplete: () => { root.closest('.tile')?.classList.remove('raised'); done(); } })
        .to(b, { x: x + (p.x - c.x), y: y + (p.y - c.y), rotation: 540, scale: 0.1, duration: 0.85, ease: 'power3.in' })
        .to(b, { opacity: 0, duration: 0.15 }, '-=0.15');
    };

    const drags = bubbles.map((b) => {
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); suck(b); }
      };
      b.addEventListener('keydown', key);
      const [drag] = Draggable.create(b, {
        type: 'x,y',
        zIndexBoost: true,
        dragClickables: true,
        onPress() {
          b.closest('.tile')?.classList.add('raised');
          b.classList.add('dragging');
        },
        onDrag() {
          const target = portal.current?.el();
          const hot = !!target && this.hitTest(target, '15%');
          b.classList.toggle('hot', hot);
          portal.current?.setHungry(hot);
        },
        onRelease() {
          b.classList.remove('dragging', 'hot');
          const target = portal.current?.el();
          const hot = !!target && this.hitTest(target, '15%');
          portal.current?.setHungry(false);
          if (hot) suck(b);
          else gsap.to(b, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1,0.45)', onComplete: () => b.closest('.tile')?.classList.remove('raised') });
        },
        onClick() {
          const { rick, onToast } = latest.current;
          onToast(rick ? 'Dra mig in i portalen. Jag biter inte. Portalen gör det.' : 'Dra bubblan till portalen för att välja den.');
        },
      });
      return () => { drag.kill(); b.removeEventListener('keydown', key); };
    });
    if (!reduce) gsap.from(bubbles, { scale: 0, duration: 0.8, stagger: 0.08, ease: 'back.out(2.2)', clearProps: 'scale' });
    return () => {
      floats.forEach((f) => f.kill());
      drags.forEach((kill) => kill());
    };
  }, [ids, portal]);

  if (groups.length === 0) return <div className="bubbles"><p className="meta bubbles-empty">Allt är valt.</p></div>;

  return (
    <div className="bubbles" ref={box}>
      {groups.map((g, i) => {
        const size = bubbleSize(g.bytes);
        const [x, y] = SPOTS[i];
        return (
          <button
            key={g.key}
            className="bub"
            data-id={g.key}
            style={{ width: size, height: size, left: `${x * 100}%`, top: `${y * 100}%` }}
            aria-label={`${g.label}${g.bytes ? `, ${gb(g.bytes)} GB` : ''}. Enter väljer den.`}
          >
            <span className="in"><span>{g.label}</span>{' '}{g.bytes !== null && <b>{gb(g.bytes)}</b>}</span>
          </button>
        );
      })}
    </div>
  );
}
