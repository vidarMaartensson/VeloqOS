import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { fakeApi } from './test/fakeApi';
import { linearIssue, overview, runningJob, waitingJob } from './test/fixtures';

describe('API restart', () => {
  it('offers a restart in the Mac app when the API is down, then reloads', async () => {
    const api = fakeApi({ overview: vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(overview) });
    const restartApi = vi.fn().mockResolvedValue(undefined);
    render(<App api={api} restartApi={restartApi} />);

    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Starta om API:t' }));

    expect(restartApi).toHaveBeenCalled();
    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says why a restart failed', async () => {
    const api = fakeApi({ overview: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    render(<App api={api} restartApi={vi.fn().mockRejectedValue(new Error('Port 7480 är upptagen av något annat än Veloq OS.'))} />);

    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Starta om API:t' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Omstarten misslyckades – Port 7480 är upptagen');
  });

  it('keeps a restart button in the rail while the API is up', async () => {
    const restartApi = vi.fn().mockResolvedValue(undefined);
    render(<App api={fakeApi()} restartApi={restartApi} />);
    await screen.findByText('Online');

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Starta om API:t' }));

    expect(restartApi).toHaveBeenCalled();
  });

  it('only explains how to start the API in a plain browser', async () => {
    const api = fakeApi({ overview: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    render(<App api={api} restartApi={undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Kör dotnet run i api/');
    expect(screen.queryByRole('button', { name: 'Starta om API:t' })).not.toBeInTheDocument();
  });
});

describe('Skills', () => {
  it('runs a chore without options straight from the skills sheet', async () => {
    const runChore = vi.fn().mockResolvedValue(runningJob('sync-projects'));
    render(<App api={fakeApi({ runChore })} restartApi={undefined} />);
    await screen.findByText('Online');

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Skills' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kör Synka projekt' }));

    expect(runChore).toHaveBeenCalledWith('sync-projects', undefined);
    expect(screen.queryByRole('dialog', { name: 'Skills' })).not.toBeInTheDocument();
  });

  it('opens the run sheet for a skill and runs it in the picked project', async () => {
    const runChore = vi.fn().mockResolvedValue(runningJob('skill-pr'));
    render(<App api={fakeApi({ runChore })} restartApi={undefined} />);
    await screen.findByText('Online');

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Skills' }));
    await userEvent.click(screen.getByRole('button', { name: /^Kör \/pr/ }));
    const sheet = screen.getByRole('dialog', { name: /^Kör \/pr/ });
    await userEvent.click(within(sheet).getByRole('button', { name: 'HaloDeck' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Kör' }));

    expect(runChore).toHaveBeenCalledWith('skill-pr', { projectId: 'halodeck' });
    expect(screen.queryByRole('dialog', { name: /^Kör \/pr/ })).not.toBeInTheDocument();
  });

  it('opens a waiting job from the jobs card', async () => {
    render(<App api={fakeApi({ jobs: vi.fn().mockResolvedValue([waitingJob]) })} restartApi={undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Visa jobb: Oanvända paket/ }));

    expect(screen.getByRole('dialog', { name: 'Jobb: Oanvända paket' })).toHaveTextContent('Ta bort valda');
  });
});

describe('Projects', () => {
  it('opens a project from the CI card with its stories', async () => {
    const stories = vi.fn().mockResolvedValue([linearIssue(7)]);
    render(<App api={fakeApi({ stories })} restartApi={undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Veloq OS:/ })); // from the CI card
    const sheet = screen.getByRole('dialog', { name: 'Projekt: Veloq OS' });
    expect(await within(sheet).findByText('Story 7')).toBeInTheDocument();
    expect(stories).toHaveBeenCalledWith('veloq-os');
  });
});

describe('Voice', () => {
  it('answers a typed line and reloads the panels its tools touched', async () => {
    const voiceTurn = vi.fn().mockResolvedValue({
      reply: 'Klart. Två mejl arkiverade.',
      actions: [{ tool: 'clear_noise', tile: 'inbox', summary: 'Arkiverade 2 brusmejl', ok: true }],
      confirm: null,
    });
    const api = fakeApi({ voiceTurn });
    render(<App api={api} restartApi={undefined} />);
    await screen.findByText('Online');
    const loads = vi.mocked(api.inbox).mock.calls.length;

    await userEvent.type(screen.getByLabelText('Skriv till Rick'), 'Rensa bruset{Enter}');

    expect(await screen.findByText('Klart. Två mejl arkiverade.')).toBeInTheDocument();
    expect(voiceTurn).toHaveBeenCalledWith('Rensa bruset', [], { id: 'rick', cynism: 70, burps: 40 });
    await vi.waitFor(() => expect(vi.mocked(api.inbox).mock.calls.length).toBeGreaterThan(loads));
  });

  it('saves the persona from the voice settings', async () => {
    const voiceTurn = vi.fn().mockResolvedValue({ reply: 'Ok.', actions: [], confirm: null });
    render(<App api={fakeApi({ voiceTurn })} restartApi={undefined} />);
    await screen.findByText('Online');

    await userEvent.click(screen.getByRole('button', { name: 'Röstinställningar' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Röstinställningar' })).getByRole('button', { name: 'Saklig' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }));
    await userEvent.type(screen.getByLabelText('Skriv till Assistenten'), 'Hej{Enter}');

    await vi.waitFor(() => expect(voiceTurn).toHaveBeenCalledWith('Hej', [], { id: 'neutral', cynism: 70, burps: 0 }));
  });
});
