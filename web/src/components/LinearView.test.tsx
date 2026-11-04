import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { groupByState, storiesTitle, teamsByWorkspace } from '../lib/linear';
import type { LinearViewState } from '../state/useLinear';
import { linearIssue, linearIssues, linearTeams, linearWorkspaces } from '../test/fixtures';
import { LinearView } from './LinearView';

const base: LinearViewState = {
  status: { configured: true, workspaces: linearWorkspaces },
  teams: linearTeams,
  teamId: 't-veloq',
  showDone: false,
  issues: linearIssues,
  loading: false,
  error: null,
};

function renderView(state: Partial<LinearViewState> = {}) {
  const handlers = { onPickTeam: vi.fn(), onShowDone: vi.fn(), onCreate: vi.fn().mockResolvedValue(true), onClose: vi.fn() };
  render(<LinearView state={{ ...base, ...state }} {...handlers} />);
  return handlers;
}

describe('linear helpers', () => {
  it('groups by the team states in order and skips empty ones', () => {
    const groups = groupByState(linearTeams[0], [linearIssue(1), linearIssue(2, linearTeams[0].states[1])]);
    expect(groups.map((g) => g.state.name)).toEqual(['Todo', 'In Progress']);
  });

  it('keeps teams under their workspace in the API order', () => {
    expect(teamsByWorkspace(linearTeams).map((w) => [w.name, w.teams.map((t) => t.key)])).toEqual([
      ['Veloq Labs', ['VEL', 'HAL']],
      ['Jobbet', ['PLA']],
    ]);
  });

  it('titles the count as a sentence', () => {
    expect(storiesTitle(0)).toBe('Inget öppet.');
    expect(storiesTitle(1)).toBe('En öppen story.');
    expect(storiesTitle(3)).toBe('3 öppna stories.');
  });
});

describe('LinearView', () => {
  it('shows the workspace, team and stories by state', () => {
    renderView();
    expect(screen.getByText('Linear · Veloq Labs · VEL')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 öppna stories.' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'In Progress' })).getByText('Story 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /VEL-1/ })).toHaveAttribute('href', 'https://linear.app/veloq/issue/VEL-1');
  });

  it('groups teams per workspace and switches to a team in another workspace', async () => {
    const h = renderView();
    expect(within(screen.getByRole('group', { name: 'Veloq Labs' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Veloq', 'Halo']);

    await userEvent.click(within(screen.getByRole('group', { name: 'Jobbet' })).getByRole('button', { name: 'Plattform' }));

    expect(h.onPickTeam).toHaveBeenCalledWith('t-plattform');
  });

  it('shows the workspace of the chosen team and a workspace that does not answer', () => {
    renderView({
      teamId: 't-plattform',
      status: { configured: true, workspaces: [...linearWorkspaces, { id: 'key-3', name: 'Nyckel 3', error: 'Linear: Authentication required' }] },
    });
    expect(screen.getByText('Linear · Jobbet · PLA')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Nyckel 3 svarar inte – Linear: Authentication required');
  });

  it('switches team and shows done stories on request', async () => {
    const h = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Halo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Även klara' }));
    expect(h.onPickTeam).toHaveBeenCalledWith('t-halo');
    expect(h.onShowDone).toHaveBeenCalledWith(true);
  });

  it('creates a story with priority and state, then closes the form', async () => {
    const h = renderView();
    await userEvent.click(screen.getByRole('button', { name: /Ny story/ }));
    const form = screen.getByRole('form', { name: 'Ny story' });
    expect(within(form).getByRole('button', { name: 'Skapa story' })).toBeDisabled();

    await userEvent.type(within(form).getByLabelText('Titel'), 'Restart-knapp');
    await userEvent.type(within(form).getByLabelText('Beskrivning'), 'I railen');
    await userEvent.click(within(form).getByRole('button', { name: 'Hög' }));
    await userEvent.click(within(form).getByRole('button', { name: 'In Progress' }));
    expect(within(form).queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Skapa story' }));

    expect(h.onCreate).toHaveBeenCalledWith({ teamId: 't-veloq', title: 'Restart-knapp', description: 'I railen', priority: 2, stateId: 'progress' });
    expect(screen.queryByRole('form', { name: 'Ny story' })).not.toBeInTheDocument();
  });

  it('says when the stories are sample data', () => {
    renderView({ status: { configured: false, workspaces: linearWorkspaces } });
    expect(screen.getByText(/Exempeldata/)).toBeInTheDocument();
  });
});
