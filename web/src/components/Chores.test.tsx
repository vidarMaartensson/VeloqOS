import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chores, projects, runningJob, waitingJob } from '../test/fixtures';
import { JobsCard } from './Cards';
import { JobSheet, RunSheet, SkillsSheet } from './Chores';

const chore = (id: string) => chores.find((c) => c.id === id)!;

describe('SkillsSheet', () => {
  it('lists built-in chores and your skills apart', async () => {
    const onPick = vi.fn();
    render(<SkillsSheet chores={chores} onPick={onPick} onClose={vi.fn()} />);

    expect(within(screen.getByRole('region', { name: 'Chores' })).getAllByRole('button')).toHaveLength(3);
    const skills = within(screen.getByRole('region', { name: 'Dina skills' }));
    expect(skills.getByText('/pr')).toBeInTheDocument();

    await userEvent.click(skills.getByRole('button', { name: 'Kör /pr' }));
    expect(onPick).toHaveBeenCalledWith(chore('skill-pr'));
  });

  it('says so when you have no skills yet', () => {
    render(<SkillsSheet chores={chores.filter((c) => c.kind === 'chore')} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Inga skills i ~/.claude/skills än.')).toBeInTheDocument();
  });
});

describe('RunSheet', () => {
  it('needs a project before a required chore can run, and only offers projects with a folder', async () => {
    const onRun = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();
    render(<RunSheet chore={chore('unused-packages')} projects={projects} onRun={onRun} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Kör Oanvända paket.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kör' })).toBeDisabled();
    expect(within(screen.getByRole('group', { name: 'Projekt' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['HaloDeck', 'Veloq OS']);

    await userEvent.click(screen.getByRole('button', { name: 'Veloq OS' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kör' }));

    expect(onRun).toHaveBeenCalledWith('unused-packages', { projectId: 'veloq-os' });
    expect(onClose).toHaveBeenCalled();
  });

  it('runs a skill without project but with an addition', async () => {
    const onRun = vi.fn().mockResolvedValue(null);
    render(<RunSheet chore={chore('skill-ny-branch')} projects={projects} onRun={onRun} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Inget projekt' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(screen.getByPlaceholderText('<namn>'), ' feature/x ');
    await userEvent.click(screen.getByRole('button', { name: 'Kör' }));

    expect(onRun).toHaveBeenCalledWith('skill-ny-branch', { argument: 'feature/x' });
  });

  it('stays open with the reason when the API says no', async () => {
    const onClose = vi.fn();
    render(<RunSheet chore={chore('skill-pr')} projects={projects} onRun={vi.fn().mockResolvedValue('HaloDeck har ingen mapp på datorn.')} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Kör' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('HaloDeck har ingen mapp på datorn.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('JobSheet', () => {
  it('approves only the ticked choices', async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();
    render(<JobSheet job={waitingJob} onConfirm={onConfirm} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Välj vad som ska göras.' })).toBeInTheDocument();
    expect(screen.getByText(/Två paket används inte\./)).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Ta bort valda' });
    expect(remove).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Polly/ }));
    await userEvent.click(remove);

    expect(onConfirm).toHaveBeenCalledWith('job-unused', ['api-polly']);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows why a job failed and has nothing to approve', () => {
    render(<JobSheet job={{ ...runningJob('skill-pr'), status: 'failed', result: 'Claude Code svarade inte.' }} onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Jobbet misslyckades.' })).toBeInTheDocument();
    expect(screen.getByText('Claude Code svarade inte.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('JobsCard', () => {
  it('says which job waits for you and opens it', async () => {
    const onOpen = vi.fn();
    render(<JobsCard jobs={[waitingJob, runningJob('memory-cleanup')]} onOpen={onOpen} />);

    const waiting = screen.getByRole('button', { name: 'Visa jobb: Oanvända paket' });
    expect(waiting).toHaveTextContent('Veloq OS · Väntar på ditt val');
    expect(screen.getByRole('button', { name: 'Visa jobb: Städa minnet' })).toHaveTextContent('Kör på datorn…');

    await userEvent.click(waiting);
    expect(onOpen).toHaveBeenCalledWith(waitingJob);
  });
});
