import { useLayoutEffect, useRef } from 'react';
import type { CalendarDay, CalendarEvent } from '../../api/types';
import { Draggable, gsap, reducedMotion } from '../../lib/motion';
import { isoDate, stockholmIso } from '../../lib/time';
import { DAY_END, DAY_START, collision, hhmm, minutesOf, snap } from '../../lib/voice';
import { Icon } from '../Icon';

export const HOUR = 44;
const STEP = HOUR / 4;
const yOf = (minutes: number) => ((minutes - DAY_START) / 60) * HOUR;

interface Props {
  calendar: CalendarDay | null;
  date: string;
  now: Date;
  rick: boolean;
  onPickDate: (date: string) => void;
  onConnect: () => void;
  onBook: (id: string) => void;
  onNew: () => void;
  /** Resolves to false when the API said no; the event springs back. */
  onMove: (event: CalendarEvent, start: string, end: string) => Promise<boolean>;
  onToast: (text: string) => void;
}

/** The day as a timeline. Drag an event to move it in steps of 15 minutes; a collision springs it back. */
export function CalendarTile({ calendar, date, now, rick, onPickDate, onConnect, onBook, onNew, onMove, onToast }: Props) {
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));
  const events = (calendar?.events ?? []).filter((e) => minutesOf(e.end) > DAY_START && minutesOf(e.start) < DAY_END);
  const nowMinutes = minutesOf(now.toISOString());

  return (
    <section className="card tile cal-tile" data-tile="calendar" aria-label="Kalender">
      <header className="tile-head">
        <span className="eyebrow">Kalender</span>
        <div className="mode-switch" role="group" aria-label="Dag">
          <button className="chip" aria-pressed={date === today} onClick={() => onPickDate(today)}>I dag</button>
          <button className="chip" aria-pressed={date === tomorrow} onClick={() => onPickDate(tomorrow)}>I morgon</button>
        </div>
        <button className="icon-btn" onClick={onNew} aria-label="Ny händelse"><Icon name="calendarAdd" size={20} /></button>
      </header>

      {calendar && !calendar.connected ? (
        <div className="tile-empty">
          <p>Kalendern är inte ansluten.</p>
          <button className="primary" onClick={onConnect}>Anslut Google Kalender</button>
        </div>
      ) : (
        <div className="cal-scroll">
          <div className="cal-track" style={{ height: yOf(DAY_END) }}>
            {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => (
              <div key={i} className="cal-hour" style={{ top: i * HOUR }}><span className="meta">{hhmm(DAY_START + i * 60)}</span></div>
            ))}
            {date === today && nowMinutes > DAY_START && nowMinutes < DAY_END && (
              <div className="cal-now" style={{ top: yOf(nowMinutes) }}><span>Nu {hhmm(nowMinutes)}</span></div>
            )}
            {events.map((e) => (
              <EventBlock key={e.id} event={e} events={events} rick={rick} onBook={onBook} onMove={onMove} onToast={onToast} />
            ))}
            {calendar && events.length === 0 && <p className="cal-free meta">Inget inbokat mellan {hhmm(DAY_START)} och {hhmm(DAY_END)}.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function EventBlock({ event, events, rick, onBook, onMove, onToast }: { event: CalendarEvent; events: CalendarEvent[]; rick: boolean } & Pick<Props, 'onBook' | 'onMove' | 'onToast'>) {
  const el = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  // Real times for the labels and the move; the block itself is cut to the visible day.
  const start = minutesOf(event.start);
  const end = minutesOf(event.end) || 24 * 60;
  const length = end - start;
  const top = Math.max(DAY_START, start);
  const height = Math.max(24, yOf(Math.min(DAY_END, end)) - yOf(top));
  // The latest props for the drag handlers, which are made once.
  const latest = useRef({ events, start, onMove, onToast, rick });
  latest.current = { events, start, onMove, onToast, rick };

  useLayoutEffect(() => {
    const node = el.current!;
    gsap.set(node, { y: yOf(top) });
  }, [top]);

  useLayoutEffect(() => {
    const node = el.current!;
    if (event.suggested) return;

    const label = (s: number) => {
      if (timeRef.current) timeRef.current.textContent = `${hhmm(s)}–${hhmm(s + length)}`;
    };
    /** Saves the move, or springs back with the reason. */
    const commit = async (to: number) => {
      const { events, start: from, onMove, onToast, rick } = latest.current;
      if (to === from) return;
      const other = collision(events, event.id, to, to + length);
      if (other || to < 0 || to + length > 24 * 60) {
        if (!reducedMotion()) {
          gsap.to(node, { y: yOf(from), duration: 0.8, ease: 'elastic.out(1,0.45)' });
          gsap.fromTo(node, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2,0.3)' });
        } else gsap.set(node, { y: yOf(from) });
        label(from);
        if (other) onToast(rick ? `Krockar med ${other.title}. Du kan inte vara på två ställen, Vidar. Inte än.` : `Krockar med ${other.title}.`);
        return;
      }
      if (!reducedMotion()) gsap.fromTo(node, { scaleX: 1.04 }, { scaleX: 1, duration: 0.6, ease: 'elastic.out(1,0.4)' });
      // The event's own day, so a move never jumps to whatever day is shown.
      const day = isoDate(new Date(event.start));
      const ok = await onMove(event, stockholmIso(day, hhmm(to)), stockholmIso(day, hhmm(to + length)));
      if (!ok) {
        gsap.to(node, { y: yOf(from), duration: 0.6, ease: 'back.out(2)' });
        label(from);
      } else onToast(rick ? `Flyttat till ${hhmm(to)}. Google har fått veta.` : `Flyttat till ${hhmm(to)}.`);
    };

    const [drag] = Draggable.create(node, {
      type: 'y',
      bounds: { minY: 0, maxY: yOf(DAY_END) - height },
      liveSnap: { y: (v: number) => Math.round(v / STEP) * STEP },
      onPress() { node.classList.add('dragging'); },
      onDrag() { label(snap(DAY_START + (this.y / HOUR) * 60)); },
      onRelease() {
        node.classList.remove('dragging');
        // A block that starts before the visible day keeps its real start until it is really moved.
        const to = snap(DAY_START + (this.y / HOUR) * 60);
        void commit(to === DAY_START && latest.current.start < DAY_START ? latest.current.start : to);
      },
    });
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const to = latest.current.start + (e.key === 'ArrowUp' ? -15 : 15);
      gsap.to(node, { y: yOf(to), duration: 0.3, ease: 'back.out(2)' });
      label(to);
      void commit(to);
    };
    node.addEventListener('keydown', key);
    return () => {
      drag.kill();
      node.removeEventListener('keydown', key);
    };
  }, [event, length, height]);

  return (
    <div
      ref={el}
      className={`cal-ev${event.suggested ? ' suggested' : ''}${height < 50 ? ' short' : ''}`}
      style={{ height }}
      tabIndex={event.suggested ? undefined : 0}
      role={event.suggested ? undefined : 'button'}
      aria-label={event.suggested ? undefined : `${event.title}, ${hhmm(start)}–${hhmm(end)}. Pil upp eller ner flyttar en kvart.`}
    >
      <span className="ev-n ellipsis">{event.title}</span>{' '}
      <span className="ev-t" ref={timeRef}>{hhmm(start)}–{hhmm(end)}</span>
      {event.suggested && (
        <button className="ev-book" onClick={() => onBook(event.id)} aria-label={`Boka ${event.title}`}>Boka</button>
      )}
    </div>
  );
}
