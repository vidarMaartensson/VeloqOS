import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calendarConnected, calendarDisconnected, inbox, NOW } from '../test/fixtures';
import { CalendarCard } from './CalendarCard';
import { InboxView } from './InboxView';

function renderInbox(items = inbox) {
  const props = { onAct: vi.fn(), onUndo: vi.fn(), onClearNoise: vi.fn(), onClose: vi.fn() };
  render(<InboxView items={items} now={NOW} {...props} />);
  return props;
}

describe('InboxView', () => {
  it('lists every item and shows how many need you', () => {
    renderInbox();
    expect(screen.getByRole('heading', { name: '2 saker behöver dig.' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Mejl' })).getAllByRole('listitem')).toHaveLength(4);
  });

  it('filters by tag', async () => {
    renderInbox();
    await userEvent.click(screen.getByRole('button', { name: /^Brus/ }));
    expect(within(screen.getByRole('list', { name: 'Mejl' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('runs an action on the selected item', async () => {
    const { onAct } = renderInbox();
    await userEvent.click(screen.getByRole('button', { name: /Arkivera/ }));
    expect(onAct).toHaveBeenCalledWith('m1', 'archive');
  });

  it('marks the suggested action', () => {
    renderInbox();
    expect(screen.getByRole('button', { name: /Låt Veloq OS hantera/ })).toHaveClass('recommended');
  });

  it('opens the draft for reply and sends the edited text', async () => {
    const { onAct } = renderInbox();
    await userEvent.click(screen.getByRole('button', { name: /\[Avsändare\]/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Svara/ }));
    const box = screen.getByLabelText('Utkast till svar');
    expect(box).toHaveValue('Hej [namn]');
    await userEvent.type(box, ', tack.');
    await userEvent.click(screen.getByRole('button', { name: /Skicka svar/ }));
    expect(onAct).toHaveBeenCalledWith('m2', 'reply', 'Hej [namn], tack.');
  });

  it('shows the result in words with undo once handled', async () => {
    const { onUndo } = renderInbox(inbox.map((i) => (i.id === 'm1' ? { ...i, handledWith: 'archive' as const } : i)));
    expect(screen.getByRole('status')).toHaveTextContent('Arkiverat.');
    await userEvent.click(screen.getByRole('button', { name: 'Ångra' }));
    expect(onUndo).toHaveBeenCalledWith('m1');
  });

  it('closes on Escape', async () => {
    const { onClose } = renderInbox();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CalendarCard', () => {
  const handlers = () => ({ onConnect: vi.fn(), onPickDate: vi.fn(), onBook: vi.fn() });

  it('offers to connect Google Calendar until connected', async () => {
    const h = handlers();
    render(<CalendarCard calendar={calendarDisconnected} date="2026-10-29" now={NOW} {...h} />);
    await userEvent.click(screen.getByRole('button', { name: /Anslut Google Kalender/ }));
    expect(h.onConnect).toHaveBeenCalled();
  });

  it('shows the day with the current meeting marked and suggestions bookable', async () => {
    const h = handlers();
    render(<CalendarCard calendar={calendarConnected} date="2026-10-29" now={NOW} {...h} />);
    expect(screen.getByText('Pågående möte')).toBeInTheDocument();
    expect(screen.getByLabelText('Pågår nu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Boka Fokus · Halo Home motion' }));
    expect(h.onBook).toHaveBeenCalledWith('20261029-s1');
  });

  it('switches day from the week strip', async () => {
    const h = handlers();
    render(<CalendarCard calendar={calendarConnected} date="2026-10-29" now={NOW} {...h} />);
    expect(screen.getByRole('button', { name: /TORS 29, idag/i })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /FRE 30/i }));
    expect(h.onPickDate).toHaveBeenCalledWith('2026-10-30');
  });
});
