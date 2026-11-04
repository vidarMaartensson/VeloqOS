import { useEffect, useState, type ReactNode } from 'react';
import type { NewCalendarEvent, Routine } from '../state/types';
import { stockholmIso, upcoming } from '../lib/time';
import { Icon } from './Icon';

export function Sheet({ eyebrow, title, label, onClose, children, footer }: { eyebrow: string; title: string; label: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" aria-label="Stäng" onClick={onClose}><Icon name="close" size={18} strokeWidth={2} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

export function RoutinesSheet({ routines, now, onToggle, onRun, onClose }: { routines: Routine[]; now: Date; onToggle: (id: string, enabled: boolean) => void; onRun: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet eyebrow="Rutiner" title="Körs medan du gör annat." label="Rutiner" onClose={onClose}>
      {routines.map((r) => (
        <div key={r.id} className="lrow" style={{ alignItems: 'flex-start', padding: '16px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</span>
            <span className="meta">{[r.schedule, r.nextRunAt ? `Nästa ${upcoming(r.nextRunAt, now)}` : null].filter(Boolean).join(' · ')}</span>
            <span style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ink-body)' }}>{r.description}</span>
            <button className="ghost" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => onRun(r.id)} aria-label={`Kör ${r.name} nu`}>Kör nu</button>
          </div>
          <button
            className="toggle"
            aria-pressed={r.enabled}
            aria-label={`${r.enabled ? 'Stäng av' : 'Slå på'} ${r.name}`}
            onClick={() => onToggle(r.id, !r.enabled)}
          >
            <span className="knob" />
          </button>
        </div>
      ))}
    </Sheet>
  );
}

/** "10:00" → "11:00", clamped to the same day. */
function hourLater(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(h + 1 > 23 ? 59 : m).padStart(2, '0')}`;
}

export function NewEventSheet({ date, now, onCreate, onClose }: { date: string; now: Date; onCreate: (event: NewCalendarEvent) => Promise<boolean>; onClose: () => void }) {
  const nextHour = `${String(Math.min(now.getHours() + 1, 23)).padStart(2, '0')}:00`;
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(date);
  const [start, setStart] = useState(nextHour);
  const [end, setEnd] = useState(hourLater(nextHour));
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== '' && day !== '' && end > start;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onCreate({
      title: title.trim(),
      start: stockholmIso(day, start),
      end: stockholmIso(day, end),
      location: location.trim() || null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      eyebrow="Kalender · Ny händelse"
      title="Lägg in i kalendern."
      label="Ny händelse"
      onClose={onClose}
      footer={
        <button type="submit" form="new-event" className="primary" disabled={!valid || saving}>
          {saving ? 'Lägger in…' : 'Lägg in'} <Icon name="arrow" size={18} strokeWidth={2.2} />
        </button>
      }
    >
      <form id="new-event" className="event-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="label" htmlFor="event-title">Titel</label>
        <input id="event-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vad händer?" autoFocus />
        <label className="label" htmlFor="event-date">Datum</label>
        <input id="event-date" className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <div className="event-times">
          <div>
            <label className="label" htmlFor="event-start">Start</label>
            <input
              id="event-start"
              className="input"
              type="time"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end <= e.target.value) setEnd(hourLater(e.target.value));
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="event-end">Slut</label>
            <input id="event-end" className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {end <= start && <p className="meta" role="alert">Slutet måste ligga efter starten.</p>}
        <label className="label" htmlFor="event-location">Plats</label>
        <input id="event-location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Valfritt" />
      </form>
    </Sheet>
  );
}
