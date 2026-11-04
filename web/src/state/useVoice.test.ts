import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { VoiceTurn } from '../api/types';
import { fakeApi } from '../test/fakeApi';
import { useVoice } from './useVoice';

const turn: VoiceTurn = {
  reply: 'Klart. *rap* VEL-151 ligger i backloggen.',
  actions: [{ tool: 'create_issue', tile: 'linear', summary: 'Skapade VEL-151 · Röstläget', ok: true }],
  confirm: null,
};

describe('useVoice', () => {
  it('asks the API with the persona and history, hands the turn over and speaks it', async () => {
    const voiceTurn = vi.fn().mockResolvedValue(turn);
    const onTurn = vi.fn();
    let finishSpeaking = () => {};
    // The first reply is spoken until the test says it is done; later ones end at once.
    const speak = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(() => new Promise<void>((r) => { finishSpeaking = r; }));
    const api = fakeApi({ voiceTurn });
    const { result } = renderHook(() => useVoice(api, onTurn, speak));
    await waitFor(() => expect(result.current.state.status?.agent).toBe('sample'));

    await act(() => { void result.current.actions.ask('  Ny story om röstläget '); });

    await waitFor(() => expect(result.current.state.phase).toBe('speaking'));
    expect(voiceTurn).toHaveBeenCalledWith('Ny story om röstläget', [], { id: 'rick', cynism: 70, burps: 40 });
    expect(onTurn).toHaveBeenCalledWith(turn);
    // Browser speech: no remote voice is passed.
    expect(speak).toHaveBeenCalledWith(turn.reply, expect.objectContaining({ persona: 'rick' }), undefined);
    expect(result.current.state.lines.map((l) => l.role)).toEqual(['user', 'assistant']);

    await act(async () => finishSpeaking());
    expect(result.current.state.phase).toBe('idle');

    await act(() => result.current.actions.ask('Och en till'));
    expect(voiceTurn).toHaveBeenLastCalledWith('Och en till', [
      { role: 'user', text: 'Ny story om röstläget' },
      { role: 'assistant', text: turn.reply },
    ], expect.anything());
  });

  it('shows what went wrong as a failed line and never speaks it', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const voiceTurn = vi.fn().mockRejectedValue(new ApiError(502, 'Claude svarade 529: Overloaded'));
    const api = fakeApi({ voiceTurn });
    const { result } = renderHook(() => useVoice(api, undefined, speak));

    await act(() => result.current.actions.ask('Hej'));

    expect(result.current.state.lines.at(-1)).toEqual({ role: 'assistant', text: 'Claude svarade 529: Overloaded', failed: true });
    expect(result.current.state.phase).toBe('idle');
    expect(speak).not.toHaveBeenCalled();
  });

  it('keeps a proposal waiting until it is dismissed', async () => {
    const confirm = { jobId: 'job-disk', label: 'Rensa valda', choices: [{ id: 'npm', label: 'npm', detail: '~/.npm · 4,4 GB' }] };
    const voiceTurn = vi.fn().mockResolvedValue({ ...turn, confirm });
    const api = fakeApi({ voiceTurn });
    const speak = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoice(api, undefined, speak));

    await act(() => result.current.actions.ask('Städa disken'));
    expect(result.current.state.confirm).toEqual(confirm);

    act(() => result.current.actions.dismissConfirm());
    expect(result.current.state.confirm).toBeNull();
  });

  it('says so when the browser cannot listen', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useVoice(api, undefined, vi.fn()));

    await act(() => result.current.actions.hold());

    expect(result.current.state.notice).toBe('Den här webbläsaren kan inte lyssna. Skriv i stället.');
    expect(result.current.state.phase).toBe('idle');
  });
});
