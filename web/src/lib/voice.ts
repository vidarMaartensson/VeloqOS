import type { CalendarEvent, LinearState, LinearStateType, LinearTeam, PersonaId, VoiceLine, VoicePersona } from '../api/types';
import { clock } from './time';

// ---------- reply text ----------

export const BURP = '*rap*';

export type Segment = { kind: 'text'; text: string } | { kind: 'burp' };

/** The reply split at its burps, for showing them as a mark and playing them as a pause. */
export function segments(reply: string): Segment[] {
  const out: Segment[] = [];
  reply.split(BURP).forEach((part, i) => {
    if (i > 0) out.push({ kind: 'burp' });
    const text = part.replace(/\s+/g, ' ');
    if (text.trim()) out.push({ kind: 'text', text: i > 0 ? text : text.trimStart() });
  });
  return out;
}

/** What is read out loud: no burps, no markdown, single spaces. */
export const speakable = (text: string) =>
  text.split(BURP).join(' ').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();

/** The latest lines, oldest first, as the API wants them. */
export const recent = (lines: VoiceLine[], max = 10) => lines.slice(-max);

// ---------- settings ----------

export interface VoiceSettings {
  persona: PersonaId;
  cynism: number;
  burps: number;
  /** Browser voice only: 0.6–1.6. */
  rate: number;
  /** Browser voice only: 0.4–1.6. */
  pitch: number;
  /** A browser voice's voiceURI, or null for the first Swedish one. */
  voiceURI: string | null;
}

export const DEFAULT_SETTINGS: VoiceSettings = { persona: 'rick', cynism: 70, burps: 40, rate: 1.08, pitch: 0.8, voiceURI: null };

const STORAGE_KEY = 'veloq-voice';
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** The saved settings, cleaned up; defaults when there are none or storage is blocked. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): VoiceSettings {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as Partial<VoiceSettings> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    const d = DEFAULT_SETTINGS;
    return {
      persona: raw.persona === 'neutral' ? 'neutral' : 'rick',
      cynism: clamp(raw.cynism, 0, 100, d.cynism),
      burps: clamp(raw.burps, 0, 100, d.burps),
      rate: clamp(raw.rate, 0.6, 1.6, d.rate),
      pitch: clamp(raw.pitch, 0.4, 1.6, d.pitch),
      voiceURI: typeof raw.voiceURI === 'string' ? raw.voiceURI : null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: VoiceSettings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage only costs the settings next time.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const personaOf = (s: VoiceSettings): VoicePersona => ({ id: s.persona, cynism: s.cynism, burps: s.persona === 'rick' ? s.burps : 0 });

// ---------- calendar ----------

export const DAY_START = 8 * 60;
export const DAY_END = 19 * 60;

/** Minutes after midnight in Stockholm. */
export function minutesOf(iso: string): number {
  const [h, m] = clock(iso).split(':').map(Number);
  return h * 60 + m;
}

export const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const snap = (minutes: number, step = 15) => Math.round(minutes / step) * step;

/** The other booked event the span would collide with, if any. Suggestions do not count. */
export function collision(events: CalendarEvent[], id: string, start: number, end: number): CalendarEvent | undefined {
  return events.find((e) => e.id !== id && !e.suggested && start < minutesOf(e.end) && end > minutesOf(e.start));
}

// ---------- disk ----------

const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

/** The size at the end of a disk choice's detail, e.g. "~/.gradle/caches · 9,8 GB" → bytes. */
export function sizeOf(detail: string): number | null {
  const m = detail.match(/([\d\s]+(?:[,.]\d+)?)\s*(B|KB|MB|GB|TB)\s*$/i);
  if (!m) return null;
  return Math.round(Number(m[1].replace(/\s/g, '').replace(',', '.')) * UNITS[m[2].toUpperCase()]);
}

/** "9,8" */
export const gb = (bytes: number) => (bytes / 1024 ** 3).toLocaleString('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Bubble diameter in px: bigger junk, bigger bubble, within reason. */
export const bubbleSize = (bytes: number | null) => Math.round(52 + Math.min(70, Math.sqrt(Math.max(0, bytes ?? 0) / 1024 ** 3) * 20));

// ---------- linear ----------

export type Column = 'backlog' | 'todo' | 'doing' | 'done';

export const COLUMNS: { id: Column; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Att göra' },
  { id: 'doing', label: 'Pågår' },
  { id: 'done', label: 'Klart' },
];

export function columnOf(type: LinearStateType): Column | null {
  switch (type) {
    case 'triage':
    case 'backlog':
      return 'backlog';
    case 'unstarted':
      return 'todo';
    case 'started':
      return 'doing';
    case 'completed':
      return 'done';
    default:
      return null;
  }
}

/** The team's first state in that column, in Linear's order. */
export const stateFor = (team: LinearTeam | undefined, column: Column): LinearState | undefined =>
  team?.states.find((s) => columnOf(s.type) === column);

// ---------- inbox stack ----------

/** Where the i-th card in the stack sits: further back is higher, smaller and fainter. */
export const stackPos = (i: number) => ({ y: i * 12, scale: 1 - i * 0.045, opacity: i > 2 ? 0 : 1 - i * 0.25 });
