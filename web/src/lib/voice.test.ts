import { describe, expect, it } from 'vitest';
import { calendarConnected, linearTeams } from '../test/fixtures';
import { BURP, DEFAULT_SETTINGS, bubbleSize, collision, columnOf, gb, hhmm, loadSettings, minutesOf, personaOf, recent, saveSettings, segments, sizeOf, snap, speakable, stateFor } from './voice';

describe('reply text', () => {
  it('splits a reply at its burps', () => {
    expect(segments(`Klart. ${BURP} Nästa  fråga.`)).toEqual([{ kind: 'text', text: 'Klart. ' }, { kind: 'burp' }, { kind: 'text', text: ' Nästa fråga.' }]);
    expect(segments('Bara text.')).toEqual([{ kind: 'text', text: 'Bara text.' }]);
  });

  it('reads out loud without burps or markdown', () => {
    expect(speakable(`Klart. ${BURP} **Nästa** \`fråga\`.`)).toBe('Klart. Nästa fråga.');
  });

  it('keeps the latest lines only', () => {
    const lines = Array.from({ length: 14 }, (_, i) => ({ role: 'user' as const, text: String(i) }));
    expect(recent(lines).map((l) => l.text)).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  });
});

describe('settings', () => {
  const store = (value: string | null) => ({ getItem: () => value });

  it('cleans up what was saved and falls back to the defaults', () => {
    expect(loadSettings(store(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(store('{inte json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(store(JSON.stringify({ persona: 'neutral', cynism: 400, burps: 'mycket', rate: 0.1, voiceURI: 7 })))).toEqual({
      ...DEFAULT_SETTINGS, persona: 'neutral', cynism: 100, rate: 0.6, voiceURI: null,
    });
  });

  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, blocked)).not.toThrow();
  });

  it('turns burps off for the neutral persona', () => {
    expect(personaOf({ ...DEFAULT_SETTINGS, persona: 'neutral', burps: 90 })).toEqual({ id: 'neutral', cynism: 70, burps: 0 });
  });
});

describe('calendar', () => {
  it('reads Stockholm minutes and snaps to quarters', () => {
    expect(minutesOf('2026-10-29T08:30:00+01:00')).toBe(510);
    expect(hhmm(510)).toBe('08:30');
    expect(snap(517)).toBe(510);
    expect(snap(523)).toBe(525);
  });

  it('finds a collision with a booked event but not with a suggestion or itself', () => {
    const events = calendarConnected.events;
    expect(collision(events, 'x', 15 * 60 + 30, 16 * 60)?.id).toBe('20261029-e2');
    expect(collision(events, 'x', 16 * 60, 17 * 60)).toBeUndefined();
    expect(collision(events, '20261029-e2', 15 * 60, 16 * 60)).toBeUndefined();
  });
});

describe('disk', () => {
  it('reads the size at the end of a choice', () => {
    expect(sizeOf('~/.gradle/caches · 9,8 GB')).toBe(Math.round(9.8 * 1024 ** 3));
    expect(sizeOf('Papperskorgen · 512 MB')).toBe(512 * 1024 ** 2);
    expect(sizeOf('web · npm')).toBeNull();
    expect(gb(9.8 * 1024 ** 3)).toBe('9,8');
  });

  it('makes bigger junk a bigger bubble, within limits', () => {
    expect(bubbleSize(null)).toBe(52);
    expect(bubbleSize(9 * 1024 ** 3)).toBe(112);
    expect(bubbleSize(10_000 * 1024 ** 3)).toBe(122);
  });
});

describe('linear columns', () => {
  it('maps states to columns and back', () => {
    expect(columnOf('triage')).toBe('backlog');
    expect(columnOf('started')).toBe('doing');
    expect(columnOf('canceled')).toBeNull();
    expect(stateFor(linearTeams[0], 'done')?.id).toBe('done');
    expect(stateFor(linearTeams[0], 'backlog')).toBeUndefined();
  });
});
