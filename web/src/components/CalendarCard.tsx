import type { CalendarDay } from '../api/types';
import { clock, duration, eventPhase, weekOf } from '../lib/time';
import { Icon } from './Icon';

interface Props {
  calendar: CalendarDay | null;
  date: string;
  now: Date;
  onConnect: () => void;
  onPickDate: (iso: string) => void;
  onBook: (id: string) => void;
  onNew: () => void;
}

export function CalendarCard({ calendar, date, now, onConnect, onPickDate, onBook, onNew }: Props) {
  const connected = calendar?.connected ?? false;

  return (
    <section className="card grow enter d4" aria-label="Kalender" style={{ gap: 12 }}>
      <div className="card-head">
        <span className="label">Kalender</span>
        <span className="meta">{connected ? 'Google' : 'Inte ansluten'}</span>
      </div>

      {!connected ? (
        <div className="cal-connect">
          <div className="cal-icon"><Icon name="calendar" size={24} /></div>
          <span style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.01em' }}>Se dagen här.</span>
          <span style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ink-body)' }}>
            Koppla Google så visas dina möten och din inkorg, och du kan lägga in händelser härifrån.
          </span>
          <button className="ghost" onClick={onConnect}>
            Anslut Google <Icon name="arrow" size={18} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <>
          <div className="week" role="group" aria-label="Veckodagar">
            {weekOf(now).map((d) => (
              <button
                key={d.iso}
                className={`day${d.isToday ? ' today' : ''}`}
                aria-pressed={d.iso === date}
                aria-label={`${d.weekday} ${d.day}${d.isToday ? ', idag' : ''}`}
                onClick={() => onPickDate(d.iso)}
              >
                <small>{d.weekday}</small>
                <b>{d.day}</b>
              </button>
            ))}
          </div>
          {calendar!.events.length === 0 ? (
            <p className="empty">Inget inbokat.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {calendar!.events.map((e) => {
                const phase = eventPhase(e, now);
                const cls = e.suggested ? 'suggested' : phase === 'now' ? 'now' : phase === 'past' ? 'past' : '';
                return (
                  <li key={e.id} className={`event ${cls}`}>
                    <span className="meta" style={{ width: 46, flex: '0 0 46px', color: phase === 'now' ? 'var(--ink)' : undefined }}>
                      {clock(e.start)}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span className="ev-title ellipsis">{e.title}</span>
                      <span className="meta" style={{ fontSize: 12 }}>
                        {e.suggested ? 'Förslag från Veloq OS · ' : ''}
                        {duration(e)}
                        {e.location ? ` · ${e.location}` : ''}
                      </span>
                    </div>
                    {phase === 'now' && !e.suggested && <span className="live" aria-label="Pågår nu" />}
                    {e.suggested && (
                      <button className="small-btn" onClick={() => onBook(e.id)} aria-label={`Boka ${e.title}`}>
                        Boka
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button className="ghost" style={{ alignSelf: 'flex-start' }} onClick={onNew}>
            Ny händelse <Icon name="arrow" size={18} strokeWidth={2} />
          </button>
        </>
      )}
    </section>
  );
}
