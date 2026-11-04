import { useLayoutEffect, useRef, useState } from 'react';
import type { Artifact } from '../../api/types';
import { Draggable, gsap, reducedMotion } from '../../lib/motion';
import { GROUPS, KIND_LABEL } from '../Cards';
import { Icon, THUMBS } from '../Icon';

interface Props {
  artifacts: Artifact[];
  query: string;
  syncing: boolean;
  onSync: () => void;
}

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace('.', '');

/** The artifacts as a carousel: drag it sideways, cards lean towards the pointer, a click turns one over. */
export function ArtifactTile({ artifacts, query, syncing, onSync }: Props) {
  const [group, setGroup] = useState('Alla');
  const [flipped, setFlipped] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = artifacts.filter((a) => (group === 'Alla' || a.group === group) && (!q || a.title.toLowerCase().includes(q))).slice(0, 24);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const ids = shown.map((a) => a.id).join('|');

  useLayoutEffect(() => {
    const vp = viewport.current, tr = track.current;
    if (!vp || !tr) return;
    gsap.set(tr, { x: 0 });
    const bounds = () => ({ minX: Math.min(0, vp.clientWidth - tr.scrollWidth), maxX: 0 });
    const [drag] = Draggable.create(tr, {
      type: 'x',
      bounds: bounds(),
      edgeResistance: 0.85,
      dragClickables: false,
      minimumMovement: 6,
      onPress() { this.applyBounds(bounds()); },
    });
    const cards = Array.from(tr.querySelectorAll<HTMLElement>('.acard'));
    const reduce = reducedMotion();
    const leans = reduce ? [] : cards.map((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3' });
      const move = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 18);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 14);
      };
      const leave = () => { rx(0); ry(0); };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
      return () => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave); };
    });
    if (!reduce) gsap.from(cards, { y: 30, opacity: 0, rotationY: -30, duration: 0.7, stagger: 0.05, ease: 'back.out(1.6)', clearProps: 'opacity,y' });
    return () => {
      drag.kill();
      leans.forEach((off) => off());
    };
  }, [ids]);

  const turn = (id: string) => {
    if (Draggable.get(track.current!)?.isDragging) return;
    const card = track.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .flipper`);
    const next = flipped === id ? null : id;
    if (card && !reducedMotion()) gsap.to(card, { rotationY: next ? 180 : 0, duration: 0.8, ease: 'back.out(1.4)' });
    if (flipped && flipped !== id) {
      const other = track.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(flipped)}"] .flipper`);
      if (other) gsap.to(other, { rotationY: 0, duration: 0.6, ease: 'power3.out' });
    }
    setFlipped(next);
  };

  return (
    <section className="card tile art-tile" data-tile="artifacts" aria-label="Artefakter">
      <header className="tile-head">
        <span className="eyebrow">Artefakter</span>
        <span className="meta">{shown.length} av {artifacts.length}</span>
        <button className="ghost sm" onClick={onSync} disabled={syncing}>{syncing ? 'Synkar…' : 'Synka'}</button>
      </header>
      <div className="shelf-filters" role="group" aria-label="Filtrera artefakter">
        {GROUPS.map((g) => (
          <button key={g} className="chip sm" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      <div className="atrack-vp" ref={viewport}>
        {shown.length === 0 && <p className="meta">Inga artefakter matchar.</p>}
        <div className="atrack" ref={track}>
          {shown.map((a) => {
            const [ink, accent] = THUMBS[a.kind] ?? THUMBS.doc;
            const back = flipped === a.id;
            return (
              <div key={a.id} className="acard" data-id={a.id}>
                <div className={`flipper${back && reducedMotion() ? ' turned' : ''}`}>
                  <button className="aface front" onClick={() => turn(a.id)} aria-label={`${a.title}. Vänd kortet.`} aria-expanded={back}>
                    <svg width="100%" height="84" viewBox="0 0 240 140" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={ink} stroke="#8A93A3" strokeWidth="2.4" />
                      <path d={accent} stroke="#3DF2C6" strokeWidth="3" />
                    </svg>
                    <span className="nm ellipsis">{a.title}</span>
                    <span className="meta">{KIND_LABEL[a.kind]} · {formatDay(a.updatedAt)}</span>
                  </button>
                  <div className="aface back" aria-hidden={!back}>
                    <span className="label">{a.group}</span>
                    <span className="nm">{a.title}</span>
                    <span className="meta">Ändrad {formatDay(a.updatedAt)}</span>
                    <a className="ghost sm" href={a.url} target="_blank" rel="noopener noreferrer" tabIndex={back ? 0 : -1}>
                      Öppna <Icon name="open" size={16} />
                    </a>
                    <button className="link" onClick={() => turn(a.id)} tabIndex={back ? 0 : -1}>Vänd tillbaka</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
