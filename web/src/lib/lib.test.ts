import { describe, expect, it } from 'vitest';
import { calendarConnected, inbox, NOW, projects, routines } from '../test/fixtures';
import { actionInfo, filterItems, inboxTitle, initial, needsYou, openCount, rowStatus } from './inbox';
import { placeChores, placeOrbs, pointerOffset, SCENE } from './orbit';
import { buildTimeline, scheduleTimeOn } from './today';
import { clock, duration, eventPhase, greeting, isoDate, relativeDay, weekOf } from './time';

describe('orbit', () => {
  it('places every project on the ellipse with a size by tier', () => {
    const orbs = placeOrbs(projects);
    expect(orbs).toHaveLength(projects.length);
    for (const o of orbs) {
      const nx = (o.x - SCENE.cx) / SCENE.rx;
      const ny = (o.y - SCENE.cy) / SCENE.ry;
      expect(nx * nx + ny * ny).toBeCloseTo(1, 1);
    }
    expect(orbs[0].size).toBeGreaterThan(orbs[2].size);
    expect(orbs[2].size).toBeGreaterThan(orbs[3].size);
  });

  it('puts the first chore at the top and spreads the rest evenly', () => {
    const nodes = placeChores(6, 100);
    expect(nodes[0]).toEqual({ x: 0, y: -100 });
    expect(nodes[3].y).toBeCloseTo(100);
  });

  it('turns a pointer position into -1…1', () => {
    const rect = { left: 0, top: 0, width: 200, height: 100 };
    expect(pointerOffset(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(pointerOffset(0, 100, rect)).toEqual({ x: -1, y: 1 });
    expect(pointerOffset(999, -999, rect)).toEqual({ x: 1, y: -1 });
  });
});

describe('inbox', () => {
  it('counts unhandled action and reply items as needing you', () => {
    expect(needsYou(inbox)).toBe(2);
    expect(inboxTitle(inbox)).toBe('2 saker behöver dig.');
    expect(inboxTitle(inbox.map((i) => ({ ...i, handledWith: 'archive' as const })))).toBe('Allt är hanterat.');
  });

  it('filters and counts open items per tag', () => {
    expect(filterItems(inbox, 'Brus')).toHaveLength(1);
    expect(openCount(inbox, 'Alla')).toBe(4);
    expect(openCount(inbox, 'Info')).toBe(1);
  });

  it('describes a row by its suggestion or by what was done', () => {
    expect(rowStatus(inbox[0])).toBe('Förslag: låt Veloq OS föreslå en fix');
    expect(rowStatus({ ...inbox[0], handledWith: 'snooze' })).toBe('Påminner i morgon');
    expect(actionInfo('archive').result).toBe('Arkiverat.');
  });

  it('takes the first letter as avatar', () => {
    expect(initial('GitHub')).toBe('G');
    expect(initial('[Avsändare]')).toBe('A');
    expect(initial('[]')).toBe('·');
  });
});

describe('time', () => {
  it('greets by Stockholm time', () => {
    expect(greeting(new Date('2026-10-29T08:00:00+01:00'))).toBe('God morgon');
    expect(greeting(NOW)).toBe('God eftermiddag');
    expect(greeting(new Date('2026-10-29T20:00:00+01:00'))).toBe('God kväll');
  });

  it('formats dates and clock times', () => {
    expect(isoDate(NOW)).toBe('2026-10-29');
    expect(clock('2026-10-29T08:30:00+01:00')).toBe('08:30');
  });

  it('builds a Monday-first week containing today', () => {
    const week = weekOf(NOW);
    expect(week).toHaveLength(7);
    expect(week[0].iso).toBe('2026-10-26');
    expect(week.find((d) => d.isToday)?.day).toBe(29);
  });

  it('knows whether an event is past, now or upcoming', () => {
    const [past, now, upcoming] = calendarConnected.events;
    expect(eventPhase(past, NOW)).toBe('past');
    expect(eventPhase(now, NOW)).toBe('now');
    expect(eventPhase(upcoming, NOW)).toBe('upcoming');
    expect(duration(past)).toBe('30 min');
    expect(duration(upcoming)).toBe('2 h');
  });

  it('shows inbox times relative to today', () => {
    expect(relativeDay('2026-10-29T14:52:00+01:00', NOW)).toBe('14:52');
    expect(relativeDay('2026-10-28T09:00:00+01:00', NOW)).toBe('Igår');
  });
});

describe('today', () => {
  it('reads Swedish schedules', () => {
    expect(scheduleTimeOn('Vardagar · 07:40', 4)).toBe('07:40');
    expect(scheduleTimeOn('Vardagar · 07:40', 6)).toBeNull();
    expect(scheduleTimeOn('Dagligen · 16:30', 0)).toBe('16:30');
    expect(scheduleTimeOn('Söndagar · 20:00', 0)).toBe('20:00');
    expect(scheduleTimeOn('Söndagar · 20:00', 4)).toBeNull();
    expect(scheduleTimeOn('Ibland', 4)).toBeNull();
  });

  it('merges enabled routines and real events in time order', () => {
    const timeline = buildTimeline(routines, calendarConnected.events, NOW, '15:20');
    expect(timeline.map((t) => t.name)).toEqual(['Morgonbrief', '[Möte]', 'Pågående möte', 'Inkorgsgenomgång']);
    expect(timeline.map((t) => t.past)).toEqual([true, true, false, false]);
  });
});
