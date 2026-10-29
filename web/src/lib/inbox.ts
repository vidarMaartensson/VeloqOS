import type { InboxAction, InboxItem, InboxTag } from '../api/types';

export const TAGS: InboxTag[] = ['Åtgärd', 'Svar', 'Info', 'Brus'];
export type TagFilter = 'Alla' | InboxTag;

export const needsYou = (items: InboxItem[]) =>
  items.filter((i) => !i.handledWith && (i.tag === 'Åtgärd' || i.tag === 'Svar')).length;

export const openCount = (items: InboxItem[], filter: TagFilter) =>
  items.filter((i) => !i.handledWith && (filter === 'Alla' || i.tag === filter)).length;

export const filterItems = (items: InboxItem[], filter: TagFilter) =>
  filter === 'Alla' ? items : items.filter((i) => i.tag === filter);

export function inboxTitle(items: InboxItem[]): string {
  const n = needsYou(items);
  if (n === 0) return 'Allt är hanterat.';
  return n === 1 ? '1 sak behöver dig.' : `${n} saker behöver dig.`;
}

export interface ActionInfo {
  id: InboxAction;
  title: string;
  description: string;
  /** Confirmation shown after the action, in words (there is no success colour). */
  result: string;
  /** Short status for the list row. */
  short: string;
}

export const ACTIONS: ActionInfo[] = [
  { id: 'reply', title: 'Svara', description: 'Öppna utkastet, redigera och skicka.', result: 'Svar skickat.', short: 'Besvarat' },
  {
    id: 'delegate',
    title: 'Låt Veloq OS hantera',
    description: 'Den gör det föreslagna och återkommer.',
    result: 'Veloq OS tar hand om det. Du får en sammanfattning när det är klart.',
    short: 'Veloq OS hanterar',
  },
  { id: 'archive', title: 'Arkivera', description: 'Bort från inkorgen, finns kvar i Gmail.', result: 'Arkiverat.', short: 'Arkiverat' },
  { id: 'task', title: 'Gör till uppgift', description: 'Läggs i rätt projekt med en länk hit.', result: 'Lagt som uppgift i projektet.', short: 'Uppgift' },
  { id: 'snooze', title: 'Påminn senare', description: 'Tillbaka i inkorgen i morgon 08:00.', result: 'Kommer tillbaka i inkorgen i morgon 08:00.', short: 'Påminner i morgon' },
  { id: 'calendar', title: 'Lägg i kalendern', description: 'Bokar tiden och tackar ja.', result: 'Inlagt i kalendern och svar skickat.', short: 'I kalendern' },
];

export const actionInfo = (id: InboxAction) => ACTIONS.find((a) => a.id === id)!;

export const rowStatus = (item: InboxItem) =>
  item.handledWith ? actionInfo(item.handledWith).short : `Förslag: ${item.suggestion}`;

export const initial = (from: string) => from.replace(/[^A-Za-zÅÄÖåäö]/g, '').charAt(0).toUpperCase() || '·';

export const defaultDraft = 'Hej,\n\n[Ditt svar här].\n\nVänliga hälsningar\nVidar';
