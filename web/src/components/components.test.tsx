import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calendarConnected, calendarDisconnected, inbox, NOW } from '../test/fixtures';
import { CalendarCard } from './CalendarCard';
import { InboxView } from './InboxView';
import { NewEventSheet } from './Sheets';

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

  it('offers no undo for a sent reply', () => {
    renderInbox(inbox.map((i) => (i.id === 'm1' ? { ...i, handledWith: 'reply' as const } : i)));
    expect(screen.getByRole('status')).toHaveTextContent('Svar skickat.');
    expect(screen.queryByRole('button', { name: 'Ångra' })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { onClose } = renderInbox();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CalendarCard', () => {
  const handlers = () => ({ onConnect: vi.fn(), onPickDate: vi.fn(), onBook: vi.fn(), onNew: vi.fn() });

  it('offers to connect Google until connected', async () => {
    const h = handlers();
    render(<CalendarCard calendar={calendarDisconnected} date="2026-10-29" now={NOW} {...h} />);
    expect(screen.queryByRole('button', { name: /Ny händelse/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Anslut Google/ }));
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

describe('NewEventSheet', () => {
  const now = new Date('2026-10-29T13:20:00+01:00');

  it('sends the event in Stockholm time and closes', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<NewEventSheet date="2026-11-02" now={now} onCreate={onCreate} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Titel'), 'Tandläkare');
    await userEvent.clear(screen.getByLabelText('Start'));
    await userEvent.type(screen.getByLabelText('Start'), '10:00');
    await userEvent.clear(screen.getByLabelText('Slut'));
    await userEvent.type(screen.getByLabelText('Slut'), '10:45');
    await userEvent.type(screen.getByLabelText('Plats'), 'Sveavägen 1');
    await userEvent.click(screen.getByRole('button', { name: /Lägg in/ }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Tandläkare',
      start: '2026-11-02T10:00:00+01:00',
      end: '2026-11-02T10:45:00+01:00',
      location: 'Sveavägen 1',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('needs a title and an end after the start', async () => {
    render(<NewEventSheet date="2026-11-02" now={now} onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Lägg in/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Titel'), 'Möte');
    expect(screen.getByRole('button', { name: /Lägg in/ })).toBeEnabled();

    await userEvent.clear(screen.getByLabelText('Slut'));
    await userEvent.type(screen.getByLabelText('Slut'), '08:00');
    expect(screen.getByRole('alert')).toHaveTextContent('Slutet måste ligga efter starten.');
    expect(screen.getByRole('button', { name: /Lägg in/ })).toBeDisabled();
  });

  it('stays open when the API says no', async () => {
    const onClose = vi.fn();
    render(<NewEventSheet date="2026-11-02" now={now} onCreate={vi.fn().mockResolvedValue(false)} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Titel'), 'Möte');
    await userEvent.click(screen.getByRole('button', { name: /Lägg in/ }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
