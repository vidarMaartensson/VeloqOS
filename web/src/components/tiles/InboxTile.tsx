import { useLayoutEffect, useRef, useState } from 'react';
import type { InboxAction, InboxItem } from '../../api/types';
import { Draggable, gsap, reducedMotion } from '../../lib/motion';
import { relativeDay } from '../../lib/time';
import { stackPos } from '../../lib/voice';

interface Props {
  items: InboxItem[];
  now: Date;
  rick: boolean;
  /** Resolves to false when the API said no; the card comes back. */
  onAct: (id: string, action: InboxAction) => Promise<boolean>;
  onOpen: (id: string) => void;
  onOpenAll: () => void;
}

const THRESHOLD = 110;

/** The mails that need you as a stack of cards: swipe right to archive, left for tomorrow. */
export function InboxTile({ items, now, rick, onAct, onOpen, onOpenAll }: Props) {
  const open = items.filter((i) => !i.handledWith && i.tag !== 'Brus');
  // Cards on their way out stay hidden until the API's answer removes them.
  const [leaving, setLeaving] = useState<string[]>([]);
  const stack = open.filter((i) => !leaving.includes(i.id));
  const top = stack[0];
  const box = useRef<HTMLDivElement>(null);

  const swipe = (dir: 1 | -1) => {
    const card = box.current?.querySelector<HTMLElement>('.mail.top');
    if (!top || !card || card.dataset.gone) return;
    card.dataset.gone = '1';
    Draggable.get(card)?.kill();
    const id = top.id;
    const done = async () => {
      setLeaving((l) => [...l, id]);
      if ((await onAct(id, dir > 0 ? 'archive' : 'snooze')) === false) setLeaving((l) => l.filter((x) => x !== id));
    };
    if (reducedMotion()) return void done();
    gsap.set(card.querySelector(dir > 0 ? '.stamp.arch' : '.stamp.later'), { opacity: 1 });
    gsap.to(card, { x: dir * 480, rotation: dir * 24, opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => void done() });
  };
  const swipeRef = useRef(swipe);
  swipeRef.current = swipe;

  // Lay out the stack and make the top card draggable.
  useLayoutEffect(() => {
    const cards = Array.from(box.current?.querySelectorAll<HTMLElement>('.mail') ?? []);
    cards.forEach((c, i) => (reducedMotion() ? gsap.set(c, stackPos(i)) : gsap.to(c, { ...stackPos(i), x: 0, rotation: 0, duration: 0.6, ease: 'back.out(1.8)' })));
    const card = cards[0];
    if (!card) return;
    const arch = card.querySelector('.stamp.arch');
    const later = card.querySelector('.stamp.later');
    const [drag] = Draggable.create(card, {
      type: 'x,y',
      onDrag() {
        gsap.set(card, { rotation: this.x / 14 });
        gsap.set(arch, { opacity: Math.max(0, this.x / THRESHOLD) });
        gsap.set(later, { opacity: Math.max(0, -this.x / THRESHOLD) });
      },
      onRelease() {
        if (Math.abs(this.x) > THRESHOLD) swipeRef.current(this.x > 0 ? 1 : -1);
        else gsap.to(card, { x: 0, y: 0, rotation: 0, duration: 0.7, ease: 'elastic.out(1,0.5)', onComplete: () => { gsap.set([arch, later], { opacity: 0 }); } });
      },
      onClick() { onOpenRef.current(card.dataset.id!); },
    });
    return () => {
      drag.kill();
    };
  }, [top?.id, stack.length]);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  return (
    <section className="card tile inbox-tile" data-tile="inbox" aria-label="Inkorg">
      <header className="tile-head">
        <span className="eyebrow">Inkorg</span>
        <span className="meta">{open.length} behöver dig</span>
        <button className="ghost sm" onClick={onOpenAll}>Alla</button>
      </header>
      <div className="stack" ref={box}>
        {stack.length === 0 ? (
          <div className="tile-empty"><p>{rick ? 'Inkorgen är tom. Jag är nästan imponerad.' : 'Inget som behöver dig.'}</p></div>
        ) : (
          stack.slice(0, 4).map((item, i) => (
            <article
              key={item.id}
              className={`mail${i === 0 ? ' top' : ''}`}
              data-id={item.id}
              style={{ zIndex: 10 - i }}
              aria-hidden={i > 0}
              tabIndex={i === 0 ? 0 : -1}
              aria-label={i === 0 ? `${item.from}: ${item.subject}. Höger pil arkiverar, vänster pil sparar till i morgon, Enter öppnar.` : undefined}
              onKeyDown={i === 0 ? (e) => {
                if (e.key === 'ArrowRight') swipe(1);
                else if (e.key === 'ArrowLeft') swipe(-1);
                else if (e.key === 'Enter') onOpen(item.id);
              } : undefined}
            >
              <span className="stamp later">Senare</span>
              <span className="stamp arch">Arkiverad</span>
              <span className="mail-from"><b>{item.from}</b><span className="meta">{relativeDay(item.receivedAt, now)}</span></span>
              <span className="mail-subj ellipsis">{item.subject}</span>
              <span className="mail-sum">{item.summary}</span>
              <span className="pill">{item.tag}</span>
            </article>
          ))
        )}
      </div>
      <div className="row">
        <button className="ghost" onClick={() => swipe(-1)} disabled={!top}>Senare</button>
        <button className="ghost" onClick={() => swipe(1)} disabled={!top}>Arkivera</button>
      </div>
    </section>
  );
}
