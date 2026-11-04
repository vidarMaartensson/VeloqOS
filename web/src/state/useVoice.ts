import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api as defaultApi, type Api } from '../api/client';
import type { VoiceAction, VoiceConfirm, VoiceStatus, VoiceTurn } from '../api/types';
import { browserListener, canRecognise, canRecord, hush, recordingListener, say, type Listener } from '../lib/speech';
import { loadSettings, personaOf, recent, saveSettings, type VoiceSettings } from '../lib/voice';

export type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceEntry {
  role: 'user' | 'assistant';
  text: string;
  actions?: VoiceAction[];
  /** The API or Claude said no; shown, never spoken. */
  failed?: boolean;
}

export interface VoiceState {
  phase: Phase;
  lines: VoiceEntry[];
  /** What the browser has heard so far while the button is held. */
  partial: string;
  confirm: VoiceConfirm | null;
  status: VoiceStatus | null;
  settings: VoiceSettings;
  /** Why listening is not possible, e.g. no microphone. */
  notice: string | null;
}

/**
 * The voice in the middle of the dashboard: hold to talk (or type), the API answers with tools, and the
 * reply is spoken. `onTurn` lets the dashboard draw beams and reload the panels the tools touched.
 */
export function useVoice(api: Api = defaultApi, onTurn?: (turn: VoiceTurn) => void, speak = say) {
  const [state, setState] = useState<VoiceState>(() => ({
    phase: 'idle',
    lines: [],
    partial: '',
    confirm: null,
    status: null,
    settings: loadSettings(),
    notice: null,
  }));
  const patch = useCallback((p: Partial<VoiceState>) => setState((s) => ({ ...s, ...p })), []);
  const ref = useRef(state);
  ref.current = state;
  const listener = useRef<Listener | null>(null);
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  useEffect(() => {
    api.voice().then((status) => patch({ status })).catch(() => undefined);
    return () => hush();
  }, [api, patch]);

  const ask = useCallback(
    async (text: string) => {
      const line = text.trim();
      if (!line || ref.current.phase === 'thinking') return;
      hush();
      const history = recent(ref.current.lines.filter((l) => !l.failed).map(({ role, text }) => ({ role, text })));
      setState((s) => ({ ...s, phase: 'thinking', partial: '', notice: null, lines: [...s.lines, { role: 'user', text: line }] }));
      let turn: VoiceTurn;
      try {
        turn = await api.voiceTurn(line, history, personaOf(ref.current.settings));
      } catch (e) {
        const reason = e instanceof ApiError ? e.message : 'Kunde inte nå Veloq OS-API:t.';
        setState((s) => ({ ...s, phase: 'idle', lines: [...s.lines, { role: 'assistant', text: reason, failed: true }] }));
        return;
      }
      setState((s) => ({
        ...s,
        phase: 'speaking',
        confirm: turn.confirm ?? s.confirm,
        lines: [...s.lines, { role: 'assistant', text: turn.reply, actions: turn.actions }],
      }));
      onTurnRef.current?.(turn);
      const remote = ref.current.status?.speech.speak === 'elevenlabs' ? api.speak : undefined;
      try {
        await speak(turn.reply, ref.current.settings, remote);
      } finally {
        setState((s) => (s.phase === 'speaking' ? { ...s, phase: 'idle' } : s));
      }
    },
    [api, speak],
  );

  /** Push to talk: starts listening; `release` sends what was heard. */
  const hold = useCallback(async () => {
    const s = ref.current;
    if (s.phase === 'listening' || s.phase === 'thinking') return;
    hush();
    try {
      if (s.status?.speech.listen === 'deepgram' && canRecord()) {
        patch({ phase: 'listening', partial: '', notice: null });
        listener.current = await recordingListener(async (audio) => (await api.transcribe(audio)).text);
      } else if (canRecognise()) {
        patch({ phase: 'listening', partial: '', notice: null });
        listener.current = browserListener((partial) => patch({ partial }));
      } else {
        patch({ phase: 'idle', notice: 'Den här webbläsaren kan inte lyssna. Skriv i stället.' });
      }
    } catch {
      listener.current = null;
      patch({ phase: 'idle', notice: 'Fick inte använda mikrofonen.' });
    }
  }, [api, patch]);

  const release = useCallback(async () => {
    const current = listener.current;
    listener.current = null;
    if (!current) return;
    let text = '';
    try {
      text = await current.stop();
    } catch {
      patch({ phase: 'idle', notice: 'Kunde inte tolka ljudet. Försök igen.' });
      return;
    }
    if (!text.trim()) {
      patch({ phase: 'idle', partial: '' });
      return;
    }
    await ask(text);
  }, [ask, patch]);

  const setSettings = useCallback((settings: VoiceSettings) => {
    saveSettings(settings);
    patch({ settings });
  }, [patch]);

  const stop = useCallback(() => {
    listener.current?.cancel();
    listener.current = null;
    hush();
    patch({ phase: 'idle', partial: '' });
  }, [patch]);

  return {
    state,
    actions: { ask, hold, release, stop, setSettings, dismissConfirm: () => patch({ confirm: null }) },
  };
}
