import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Chore } from '../../api/types';
import type { LinearViewState } from '../../state/useLinear';
import { NOW, artifacts, calendarConnected, chores, diskJob, inbox, linearIssues, linearTeams, systemOk } from '../../test/fixtures';
import { ArtifactTile } from './ArtifactTile';
import { CalendarTile } from './CalendarTile';
import { DiskTile, groupChoices } from './DiskTile';
import { InboxTile } from './InboxTile';
import { KpiStrip } from './KpiStrip';
import { LinearTile } from './LinearTile';
import { SkillsTile } from './SkillsTile';

describe('CalendarTile', () => {
  const props = () => ({
    calendar: calendarConnected, date: '2026-10-29', now: NOW, rick: true,
    onPickDate: vi.fn(), onConnect: vi.fn(), onBook: vi.fn(), onNew: vi.fn(),
    onMove: vi.fn().mockResolvedValue(true), onToast: vi.fn(),
  });

  it('moves an event a quarter with the arrow keys and saves it in Stockholm time', async () => {
    const p = props();
    render(<CalendarTile {...p} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /^\[Möte\], 08:30–09:00/ }), { key: 'ArrowDown' });

    await vi.waitFor(() => expect(p.onMove).toHaveBeenCalledWith(calendarConnected.events[0], '2026-10-29T08:45:00+01:00', '2026-10-29T09:15:00+01:00'));
    expect(p.onToast).toHaveBeenCalledWith('Flyttat till 08:45. Google har fått veta.');
  });

  it('moves events up into free time without complaining', () => {
    const p = props();
    render(<CalendarTile {...p} />);
    const meeting = screen.getByRole('button', { name: /^Pågående möte/ });

    fireEvent.keyDown(screen.getByRole('button', { name: /^\[Möte\], 08:30/ }), { key: 'ArrowUp' });
    fireEvent.keyDown(meeting, { key: 'ArrowUp' });

    expect(p.onMove).toHaveBeenCalledTimes(2);
    expect(p.onToast).not.toHaveBeenCalledWith(expect.stringContaining('Krockar'));
  });

  it('refuses a move into another meeting', () => {
    const p = { ...props(), calendar: { ...calendarConnected, events: [calendarConnected.events[1], { ...calendarConnected.events[1], id: 'b', title: 'Nästa', start: '2026-10-29T16:00:00+01:00', end: '2026-10-29T17:00:00+01:00' }] } };
    render(<CalendarTile {...p} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /^Pågående möte/ }), { key: 'ArrowDown' });

    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onToast).toHaveBeenCalledWith('Krockar med Nästa. Du kan inte vara på två ställen, Vidar. Inte än.');
  });

  it('keeps the real end of an event that runs past the visible day', () => {
    const p = { ...props(), calendar: { ...calendarConnected, events: [{ ...calendarConnected.events[0], id: 'late', title: 'Sent', start: '2026-10-29T18:30:00+01:00', end: '2026-10-29T20:00:00+01:00' }] } };
    render(<CalendarTile {...p} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /^Sent, 18:30–20:00/ }), { key: 'ArrowUp' });

    expect(p.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'late' }), '2026-10-29T18:15:00+01:00', '2026-10-29T19:45:00+01:00');
  });

  it('books a suggestion and offers to connect when not connected', async () => {
    const p = props();
    const { rerender } = render(<CalendarTile {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Boka Fokus · Halo Home motion' }));
    expect(p.onBook).toHaveBeenCalledWith('20261029-s1');

    rerender(<CalendarTile {...p} calendar={{ connected: false, date: '2026-10-29', events: [] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Anslut Google Kalender' }));
    expect(p.onConnect).toHaveBeenCalled();
  });
});

describe('InboxTile', () => {
  it('archives the top card to the right and snoozes to the left', async () => {
    const onAct = vi.fn();
    render(<InboxTile items={inbox} now={NOW} rick onAct={onAct} onOpen={vi.fn()} onOpenAll={vi.fn()} />);
    expect(screen.getByText('3 behöver dig')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('article', { name: /^GitHub: CI misslyckades/ }), { key: 'ArrowRight' });
    expect(onAct).toHaveBeenLastCalledWith('m1', 'archive');

    await userEvent.click(screen.getByRole('button', { name: 'Senare' }));
    expect(onAct).toHaveBeenLastCalledWith('m2', 'snooze');
  });

  it('leaves out noise and handled mail', () => {
    render(<InboxTile items={inbox.map((i) => ({ ...i, handledWith: 'archive' }))} now={NOW} rick={false} onAct={vi.fn()} onOpen={vi.fn()} onOpenAll={vi.fn()} />);

    expect(screen.getByText('Inget som behöver dig.')).toBeInTheDocument();
  });
});

describe('DiskTile', () => {
  const props = () => ({ system: systemOk, jobs: [diskJob], rick: true, onScan: vi.fn(), onConfirm: vi.fn().mockResolvedValue(null), onToast: vi.fn() });

  it('picks bubbles and approves only those', async () => {
    const p = props();
    render(<DiskTile {...p} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Gradle, 9,8 GB. Enter väljer den.' }), { key: 'Enter' });
    await userEvent.click(await screen.findByRole('button', { name: 'Rensa 1 · 9,8 GB' }));

    expect(p.onConfirm).toHaveBeenCalledWith('job-disk', ['gradle']);
    expect(p.onToast).toHaveBeenCalledWith('Rensar 9,8 GB. Din dator tackar mig, inte dig.');
  });

  it('can take a pick back', async () => {
    render(<DiskTile {...props()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^npm/ }), { key: 'Enter' });

    await userEvent.click(await screen.findByRole('button', { name: 'Ångra' }));

    expect(screen.getByRole('button', { name: /^npm/ })).toBeInTheDocument();
  });

  it('gives the biggest their own bubble and puts the smallest together', () => {
    const choices = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, detail: `x · ${i + 1} GB` }));

    const groups = groupChoices(choices);

    expect(groups.map((g) => g.label)).toEqual(['C8', 'C7', 'C6', 'C5', 'C4', 'C3', 'Övrigt · 3 st']);
    expect(groups.at(-1)!.ids).toEqual(['c2', 'c1', 'c0']);
    expect(groups.at(-1)!.bytes).toBe(6 * 1024 ** 3);
  });

  it('scans when nothing is waiting', async () => {
    const p = { ...props(), jobs: [] };
    render(<DiskTile {...p} />);

    await userEvent.click(screen.getByRole('button', { name: 'Skanna disken' }));

    expect(p.onScan).toHaveBeenCalled();
  });
});

describe('LinearTile', () => {
  const state: LinearViewState = { status: null, teams: linearTeams, teamId: 't-veloq', showDone: true, issues: linearIssues, loading: false, error: null };

  it('moves a story to the next column with the arrow keys', async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    const onToast = vi.fn();
    render(<LinearTile state={state} rick voicePulse={0} onPickTeam={vi.fn()} onMove={onMove} onCreate={vi.fn()} onOpenAll={vi.fn()} onToast={onToast} />);
    const doing = screen.getByRole('list', { name: 'Pågår' });

    await act(async () => fireEvent.keyDown(within(doing).getByRole('listitem', { name: /^VEL-1:/ }), { key: 'ArrowRight' }));

    expect(onMove).toHaveBeenCalledWith(linearIssues[0], 'done');
    expect(onToast).toHaveBeenCalledWith('VEL-1 klar. Skriv det i din dagbok, Vidar.');
  });

  it('adds a story to the first column the team has when there is no backlog', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<LinearTile state={state} rick={false} voicePulse={0} onPickTeam={vi.fn()} onMove={vi.fn()} onCreate={onCreate} onOpenAll={vi.fn()} onToast={vi.fn()} />);

    expect(screen.getByLabelText('Kolumn')).toHaveValue('todo');
    await userEvent.type(screen.getByLabelText('Ny story'), 'Portalen{Enter}');

    expect(onCreate).toHaveBeenCalledWith({ teamId: 't-veloq', title: 'Portalen', description: null, priority: 0, stateId: 'todo' });
  });

  it('defaults to the backlog when the team has one', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const backlog = { id: 'backlog', name: 'Backlog', type: 'backlog' as const, color: '#bec2c8' };
    const withBacklog = { ...state, teams: state.teams.map((t) => ({ ...t, states: [backlog, ...t.states] })) };
    render(<LinearTile state={withBacklog} rick={false} voicePulse={0} onPickTeam={vi.fn()} onMove={vi.fn()} onCreate={onCreate} onOpenAll={vi.fn()} onToast={vi.fn()} />);

    expect(screen.getByLabelText('Kolumn')).toHaveValue('backlog');
    await userEvent.type(screen.getByLabelText('Ny story'), 'Portalen{Enter}');

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ stateId: 'backlog' }));
  });

  it('adds a story to the picked column', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<LinearTile state={state} rick={false} voicePulse={0} onPickTeam={vi.fn()} onMove={vi.fn()} onCreate={onCreate} onOpenAll={vi.fn()} onToast={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Kolumn'), 'Pågår');
    await userEvent.type(screen.getByLabelText('Ny story'), 'Portalen{Enter}');

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Portalen', stateId: 'progress' }));
  });
});

describe('ArtifactTile, SkillsTile and KpiStrip', () => {
  it('turns an artifact over to show its link', async () => {
    render(<ArtifactTile artifacts={artifacts} query="" syncing={false} onSync={vi.fn()} />);
    const first = artifacts[0];

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${first.title} .*Vänd kortet`) }));

    expect(screen.getByRole('button', { name: new RegExp(`^${first.title} .*Vänd kortet`) })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Öppna' })[0]).toHaveAttribute('href', first.url);
  });

  it('runs a skill from its key', async () => {
    const onRun = vi.fn();
    render(<SkillsTile chores={chores} jobs={[]} onRun={onRun} onOpenAll={vi.fn()} />);
    const skill = chores.find((c) => c.kind === 'skill')!;

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Starta ${skill.name}`) }));

    expect(onRun).toHaveBeenCalledWith(skill);
  });

  it('opens the old-chats job from its own button instead of a key', async () => {
    const onOldChats = vi.fn();
    const oldChats: Chore = { id: 'old-chats', name: 'Gamla chattar', description: '', icon: 'sync', estimate: '≈ 1 min', kind: 'chore', project: 'none', argument: null };
    render(<SkillsTile chores={[...chores, oldChats]} jobs={[]} onRun={vi.fn()} onOpenAll={vi.fn()} onOldChats={onOldChats} />);

    expect(screen.queryByRole('button', { name: /^Starta Gamla chattar/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Gamla chattar' }));

    expect(onOldChats).toHaveBeenCalledOnce();
  });

  it('hides the old-chats button when the API has no such chore', () => {
    render(<SkillsTile chores={chores} jobs={[]} onRun={vi.fn()} onOpenAll={vi.fn()} onOldChats={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Gamla chattar' })).toBeNull();
  });

  it('jumps to the panel behind a number', async () => {
    const onJump = vi.fn();
    render(<KpiStrip items={[{ key: 'disk', label: 'Ledigt', value: 200, unit: 'GB', tile: 'disk' }]} onJump={onJump} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ledigt: 200 GB' }));

    expect(onJump).toHaveBeenCalledWith('disk');
  });
});
