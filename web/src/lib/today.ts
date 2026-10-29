import type { CalendarEvent, Routine } from '../api/types';
import { clock } from './time';

export interface TimelineEntry {
  time: string; // "07:40"
  name: string;
  kind: 'routine' | 'event';
  past: boolean;
}

const WEEKDAYS: Record<string, number> = {
  söndagar: 0,
  måndagar: 1,
  tisdagar: 2,
  onsdagar: 3,
  torsdagar: 4,
  fredagar: 5,
  lördagar: 6,
};

/** Does a schedule like "Vardagar · 07:40" run on this weekday (0 = Sunday)? Returns its time or null. */
export function scheduleTimeOn(schedule: string, weekday: number): string | null {
  const [when, time] = schedule.split('·').map((s) => s.trim());
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const w = when.toLowerCase();
  const runs =
    w === 'dagligen' ||
    (w === 'vardagar' && weekday >= 1 && weekday <= 5) ||
    (w === 'helger' && (weekday === 0 || weekday === 6)) ||
    WEEKDAYS[w] === weekday;
  return runs ? time : null;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Today's enabled routines and real (not suggested) calendar events, in time order. */
export function buildTimeline(routines: Routine[], events: CalendarEvent[], now: Date, nowHHMM: string): TimelineEntry[] {
  const nowMin = minutes(nowHHMM);
  const fromRoutines = routines
    .filter((r) => r.enabled)
    .flatMap((r) => {
      const time = scheduleTimeOn(r.schedule, now.getDay());
      return time ? [{ time, name: r.name, kind: 'routine' as const, past: minutes(time) <= nowMin }] : [];
    });
  const fromEvents = events
    .filter((e) => !e.suggested)
    .map((e) => ({ time: clock(e.start), name: e.title, kind: 'event' as const, past: new Date(e.end) <= now }));
  return [...fromRoutines, ...fromEvents].sort((a, b) => minutes(a.time) - minutes(b.time));
}
