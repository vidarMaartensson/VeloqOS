import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import type { VoiceConfirm } from '../../api/types';
import { gsap, reducedMotion } from '../../lib/motion';
import { gb, segments, sizeOf } from '../../lib/voice';
import type { VoiceEntry, VoiceState } from '../../state/useVoice';
import { Icon } from '../Icon';
import { Portal, type PortalHandle } from './Portal';

const PHASE_LABEL = {
  idle: 'Håll inne för att prata',
  listening: 'Lyssnar…',
  thinking: 'Tänker…',
  speaking: 'Pratar…',
} as const;

const SUGGESTIONS = ['Ge mig en rapport', 'Lägg till en story om röstläget', 'Städa disken', 'Boka fokustid i morgon'];

interface Props {
  voice: VoiceState;
  portalRef: Ref<PortalHandle>;
  onAsk: (text: string) => void;
  onHold: () => void;
  onRelease: () => void;
  onStop: () => void;
  onSettings: () => void;
  onConfirm: (confirm: VoiceConfirm) => void;
  onDismissConfirm: () => void;
  onShowDisk: () => void;
}

/** True when a key press belongs to a field, a button or an open dialog rather than to push-to-talk. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName) || target.getAttribute('role') === 'button' || !!target.closest('[role="dialog"]'));

export function VoiceCore({ voice, portalRef, onAsk, onHold, onRelease, onStop, onSettings, onConfirm, onDismissConfirm, onShowDisk }: Props) {
  const [draft, setDraft] = useState('');
  const rick = voice.settings.persona === 'rick';
  const name = rick ? 'Rick' : 'Assistenten';

  // Space is push-to-talk anywhere on the page, except in fields and on buttons.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing(e.target)) return;
      e.preventDefault();
      onHold();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      e.preventDefault();
      onRelease();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onHold, onRelease]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAsk(draft);
    setDraft('');
  };

  const shown = voice.lines.slice(-4);
  const busy = voice.phase === 'thinking';

  return (
    <section className="voice card" data-tile="voice" aria-label="Röstassistent">
      <header className="voice-head">
        <span className="eyebrow">Röst · {name}</span>
        <span className="meta">{voice.status ? (voice.status.agent === 'sample' ? 'Exempelagent' : 'Claude') : '…'}</span>
        <button className="icon-btn" onClick={onSettings} aria-label="Röstinställningar">
          <Icon name="sliders" size={20} />
        </button>
      </header>

      <Portal phase={voice.phase} ref={portalRef} label={`${name}: ${PHASE_LABEL[voice.phase]}`} />

      <div className="voice-log" aria-live="polite">
        {shown.length === 0 && !voice.partial && (
          <p className="voice-hint">{rick ? 'Vad vill du, Vidar? Håll in knappen eller mellanslag och prata.' : 'Håll in knappen eller mellanslag och prata, eller skriv.'}</p>
        )}
        {shown.map((line, i) => <Line key={voice.lines.length - shown.length + i} line={line} />)}
        {voice.partial && <p className="vline user partial">{voice.partial}</p>}
      </div>

      {voice.confirm && (
        <ConfirmCard confirm={voice.confirm} onConfirm={onConfirm} onDismiss={onDismissConfirm} onShow={onShowDisk} />
      )}

      {voice.lines.length === 0 && (
        <div className="voice-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => onAsk(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}

      <div className="voice-controls">
        <button
          className="mic"
          data-phase={voice.phase}
          aria-label={voice.phase === 'listening' ? 'Släpp för att skicka' : 'Håll inne för att prata'}
          aria-pressed={voice.phase === 'listening'}
          onPointerDown={(e) => { e.preventDefault(); onHold(); }}
          onPointerUp={onRelease}
          onPointerLeave={() => voice.phase === 'listening' && onRelease()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); onHold(); } }}
          onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRelease(); } }}
        >
          <Icon name="mic" size={26} strokeWidth={2} />
        </button>
        <form className="voice-form" onSubmit={submit}>
          <label htmlFor="voice-text" className="sr-only">Skriv till {name}</label>
          <input id="voice-text" className="input" placeholder={`Skriv till ${name}…`} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
        </form>
        {(voice.phase === 'speaking' || voice.phase === 'listening') && (
          <button className="ghost" onClick={onStop}>Tyst</button>
        )}
      </div>
      <p className="meta voice-phase">{voice.notice ?? PHASE_LABEL[voice.phase]}</p>
    </section>
  );
}

function Line({ line }: { line: VoiceEntry }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!el.current || reducedMotion()) return;
    gsap.from(el.current, { y: 14, opacity: 0, duration: 0.5, ease: 'power3.out' });
    const chips = el.current.querySelectorAll('.tool');
    if (chips.length) gsap.from(chips, { scale: 0.6, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(2)', delay: 0.15 });
  }, []);

  return (
    <div ref={el} className={`vline ${line.role}${line.failed ? ' failed' : ''}`}>
      <p>
        {segments(line.text).map((s, i) =>
          s.kind === 'burp' ? <span key={i} className="burp" aria-label="rap">rap</span> : <span key={i}>{s.text}</span>,
        )}
      </p>
      {line.actions && line.actions.length > 0 && (
        <ul className="tools" aria-label="Verktyg som kördes">
          {line.actions.map((a, i) => (
            <li key={i} className={`tool${a.ok ? '' : ' bad'}`}>{a.tool} · {a.summary}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmCard({ confirm, onConfirm, onDismiss, onShow }: { confirm: VoiceConfirm; onConfirm: (c: VoiceConfirm) => void; onDismiss: () => void; onShow: () => void }) {
  const total = confirm.choices.reduce((sum, c) => sum + (sizeOf(c.detail) ?? 0), 0);
  return (
    <div className="voice-confirm" role="group" aria-label="Väntar på ditt ok">
      <span className="eyebrow">Väntar på ditt ok</span>
      <p>{confirm.choices.length} saker kan rensas{total > 0 ? ` · ${gb(total)} GB` : ''}. Dra bubblorna in i portalen eller rensa allt.</p>
      <div className="row">
        <button className="primary" onClick={() => onConfirm(confirm)}>{confirm.label === 'Rensa valda' ? 'Rensa allt' : confirm.label}</button>
        <button className="ghost" onClick={onShow}>Visa i disken</button>
        <button className="ghost" onClick={onDismiss}>Inte nu</button>
      </div>
    </div>
  );
}
