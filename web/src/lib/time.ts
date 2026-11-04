import type { CalendarEvent } from '../api/types';

const TZ = 'Europe/Stockholm';

export function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now));
  if (hour < 10) return 'God morgon';
  if (hour < 12) return 'God förmiddag';
  if (hour < 18) return 'God eftermiddag';
  return 'God kväll';
}

/** "TORSDAG 29 OKTOBER" */
export function dateLabel(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
    .format(now)
    .toUpperCase();
}

/** yyyy-MM-dd in Stockholm time. */
export function isoDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ }).format(date);
}

/** "+01:00" or "+02:00": Stockholm's offset from UTC at that instant. */
function offsetAt(instant: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')!.value;
  return name === 'GMT' ? '+00:00' : name.slice(3);
}

/** "2026-10-30" + "09:00" read as Stockholm time → "2026-10-30T09:00:00+01:00". */
export function stockholmIso(date: string, time: string): string {
  const asUtc = new Date(`${date}T${time}:00Z`);
  const [h, m] = offsetAt(asUtc).slice(1).split(':').map(Number);
  // The offset at the real instant, which differs from the guess only around a DST switch.
  return `${date}T${time}:00${offsetAt(new Date(asUtc.getTime() - (h * 60 + m) * 60_000))}`;
}

/** "08:30" in Stockholm time. */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
}

export interface WeekDay {
  date: Date;
  iso: string;
  weekday: string;
  day: number;
  isToday: boolean;
}

/** Monday to Sunday of the week that contains `now`. */
export function weekOf(now: Date): WeekDay[] {
  const todayIso = isoDate(now);
  const weekdayIndex = (now.getDay() + 6) % 7; // 0 = Monday
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(now.getDate() - weekdayIndex + i);
    const iso = isoDate(date);
    return {
      date,
      iso,
      weekday: new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: TZ }).format(date).replace('.', '').toUpperCase(),
      day: Number(iso.slice(8, 10)),
      isToday: iso === todayIso,
    };
  });
}

export type EventPhase = 'past' | 'now' | 'upcoming';

export function eventPhase(event: CalendarEvent, now: Date): EventPhase {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const t = now.getTime();
  if (t >= end) return 'past';
  if (t >= start) return 'now';
  return 'upcoming';
}

/** "30 min", "2 h", "1,5 h" */
export function duration(event: CalendarEvent): string {
  const minutes = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} h`;
}

/** Short relative time for inbox rows: "14:52", "Igår", "Mån". */
export function relativeDay(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return clock(iso);
  if (days === 1) return 'Igår';
  if (days < 7) {
    const name = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: TZ }).format(date).replace('.', '');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: TZ }).format(date);
}

const startOfDay = (d: Date) => new Date(isoDate(d) + 'T00:00:00').getTime();

/** When something runs next, from now's point of view: "i dag 16:30", "i morgon 07:40" or "sön 20:00". */
export function upcoming(iso: string, now: Date): string {
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `i dag ${clock(iso)}`;
  if (days === 1) return `i morgon ${clock(iso)}`;
  const name = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: TZ }).format(new Date(iso)).replace('.', '');
  return `${name} ${clock(iso)}`;
}
