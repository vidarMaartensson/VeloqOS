import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { brief, linearIssue, NOW, projects, routines, statuses, systemLow, systemOk } from '../test/fixtures';
import { BriefCard, CiCard, DiskBadge, ProjectSheet } from './Projects';
import { RoutinesSheet } from './Sheets';

const veloqOs = projects.find((p) => p.id === 'veloq-os')!;

describe('DiskBadge', () => {
  it('only offers to clean when the disk runs low', async () => {
    const onClean = vi.fn();
    const { rerender } = render(<DiskBadge system={systemOk} onClean={onClean} />);
    expect(screen.getByText(/200,0 GB ledigt/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<DiskBadge system={systemLow} onClean={onClean} />);
    await userEvent.click(screen.getByRole('button', { name: /Disken är nästan full/ }));
    expect(onClean).toHaveBeenCalled();
  });
});

describe('BriefCard', () => {
  it('shows the latest brief, or offers to write one', async () => {
    const onWrite = vi.fn();
    const { rerender } = render(<BriefCard brief={brief} now={NOW} onWrite={onWrite} />);
    expect(screen.getByText(/Fixa CI i Veloq OS först\./)).toBeInTheDocument();

    rerender(<BriefCard brief={null} now={NOW} onWrite={onWrite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skriv nu' }));
    expect(onWrite).toHaveBeenCalled();
  });

  it('shows the halo writing instead of the old brief while a new one is written', () => {
    render(<BriefCard brief={brief} now={NOW} writing onWrite={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Skriver briefen…');
    expect(screen.queryByText(/Fixa CI i Veloq OS först\./)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skriver…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Visa allt' })).not.toBeInTheDocument();
  });
});

describe('CiCard', () => {
  it('lists every repo with CI and counts the red ones', async () => {
    const onOpen = vi.fn();
    render(<CiCard projects={projects} statuses={statuses} onOpen={onOpen} />);

    const card = screen.getByRole('region', { name: 'CI' });
    expect(card).toHaveTextContent('1 röda');
    await userEvent.click(within(card).getByRole('button', { name: /^Veloq OS:.*CI rött/ }));
    expect(onOpen).toHaveBeenCalledWith(veloqOs);
  });
});

describe('ProjectSheet', () => {
  it('shows the repo and the open stories', () => {
    const story = linearIssue(7);
    render(<ProjectSheet project={veloqOs} status={statuses[1]} stories={[story]} onClose={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Repo' })).toHaveTextContent('feature/skills · 12 ändrade');
    expect(screen.getByRole('link', { name: 'Öppna senaste körningen på GitHub' })).toHaveAttribute('href', statuses[1].ciUrl);
    expect(screen.getByRole('region', { name: 'Stories' })).toHaveTextContent('VEL-7 · ');
    expect(screen.getByText(story.title)).toBeInTheDocument();
  });

  it('explains a project without a Linear team, and a Linear error', () => {
    const halo = projects.find((p) => p.id === 'halo-home')!;
    const { rerender } = render(<ProjectSheet project={halo} status={undefined} stories={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Inte kopplat till Linear/)).toBeInTheDocument();

    rerender(<ProjectSheet project={veloqOs} status={undefined} stories="Linear svarar inte." onClose={vi.fn()} />);
    expect(screen.getByText('Linear svarar inte.')).toBeInTheDocument();
  });
});

describe('RoutinesSheet', () => {
  it('says when each routine runs next and runs one now', async () => {
    const onRun = vi.fn();
    render(<RoutinesSheet routines={routines} now={NOW} onToggle={vi.fn()} onRun={onRun} onClose={vi.fn()} />);

    expect(screen.getByText('Vardagar · 07:40 · Nästa i morgon 07:40')).toBeInTheDocument();
    expect(screen.getByText('Fredagar · 15:00')).toBeInTheDocument(); // off: no next run
    await userEvent.click(screen.getByRole('button', { name: 'Kör nu: Veckorevy' }));
    expect(onRun).toHaveBeenCalledWith('week-review');
  });
});
