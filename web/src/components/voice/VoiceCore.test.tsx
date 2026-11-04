import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../lib/voice';
import type { VoiceState } from '../../state/useVoice';
import { voiceStatus } from '../../test/fixtures';
import { VoiceCore } from './VoiceCore';

const state = (p: Partial<VoiceState> = {}): VoiceState => ({
  phase: 'idle', lines: [], partial: '', confirm: null, status: voiceStatus, settings: DEFAULT_SETTINGS, notice: null, ...p,
});

const handlers = () => ({
  onAsk: vi.fn(), onHold: vi.fn(), onRelease: vi.fn(), onStop: vi.fn(), onSettings: vi.fn(),
  onConfirm: vi.fn(), onDismissConfirm: vi.fn(), onShowDisk: vi.fn(),
});

describe('VoiceCore', () => {
  it('names the agent that answers', () => {
    const { rerender } = render(<VoiceCore voice={state()} portalRef={{ current: null }} {...handlers()} />);
    expect(screen.getByText('Exempelagent')).toBeInTheDocument();

    rerender(<VoiceCore voice={state({ status: { ...voiceStatus, agent: 'claude-code', model: 'claude-sonnet-5-5' } })} portalRef={{ current: null }} {...handlers()} />);
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('sends a typed line and offers suggestions before the first one', async () => {
    const h = handlers();
    render(<VoiceCore voice={state()} portalRef={{ current: null }} {...h} />);

    await userEvent.type(screen.getByLabelText('Skriv till Rick'), 'Ge mig läget{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Städa disken' }));

    expect(h.onAsk).toHaveBeenNthCalledWith(1, 'Ge mig läget');
    expect(h.onAsk).toHaveBeenNthCalledWith(2, 'Städa disken');
  });

  it('shows burps as a mark and the tools that ran', () => {
    render(
      <VoiceCore
        voice={state({ lines: [{ role: 'assistant', text: 'Klart. *rap* Nästa.', actions: [{ tool: 'create_issue', tile: 'linear', summary: 'Skapade VEL-151', ok: true }] }] })}
        portalRef={{ current: null }}
        {...handlers()}
      />,
    );

    expect(screen.getByLabelText('rap')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Verktyg som kördes' })).toHaveTextContent('create_issue · Skapade VEL-151');
    expect(screen.queryByRole('button', { name: 'Städa disken' })).not.toBeInTheDocument();
  });

  it('is push to talk on the button and on space', async () => {
    const h = handlers();
    render(<VoiceCore voice={state()} portalRef={{ current: null }} {...h} />);

    const mic = screen.getByRole('button', { name: 'Håll inne för att prata' });
    fireEvent.pointerDown(mic);
    expect(h.onHold).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(mic);
    expect(h.onRelease).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    fireEvent.keyUp(document.body, { code: 'Space', key: ' ' });
    expect(h.onHold).toHaveBeenCalledTimes(2);
    expect(h.onRelease).toHaveBeenCalledTimes(2);
  });

  it('asks for an ok on a disk proposal', async () => {
    const h = handlers();
    const confirm = { jobId: 'job-disk', label: 'Rensa valda', choices: [{ id: 'npm', label: 'npm', detail: '~/.npm · 4,4 GB' }] };
    render(<VoiceCore voice={state({ confirm })} portalRef={{ current: null }} {...h} />);

    expect(screen.getByRole('group', { name: 'Väntar på ditt ok' })).toHaveTextContent('1 saker kan rensas · 4,4 GB');
    await userEvent.click(screen.getByRole('button', { name: 'Rensa allt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Inte nu' }));

    expect(h.onConfirm).toHaveBeenCalledWith(confirm);
    expect(h.onDismissConfirm).toHaveBeenCalled();
  });
});
