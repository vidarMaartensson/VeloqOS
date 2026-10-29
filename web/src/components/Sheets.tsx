import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Message, Routine } from '../state/types';
import { Icon } from './Icon';

function Sheet({ eyebrow, title, label, onClose, children, footer }: { eyebrow: string; title: string; label: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" aria-label="Stäng" onClick={onClose}><Icon name="close" size={18} strokeWidth={2} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

export function PromptSheet({ context, messages, thinking, onSend, onClose }: { context: string; messages: Message[]; thinking: boolean; onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, thinking]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <Sheet
      eyebrow={`Prompt · ${context}`}
      title="Plan först."
      label="Prompt"
      onClose={onClose}
      footer={
        <form style={{ display: 'flex', gap: 10, flex: 1 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label htmlFor="prompt-input" className="sr-only">Meddelande</label>
          <input id="prompt-input" className="input" placeholder="Fortsätt…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <button type="submit" className="primary icon" aria-label="Skicka"><Icon name="arrow" size={20} strokeWidth={2.2} /></button>
        </form>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-live="polite">
        {messages.length === 0 && <p className="empty">Skriv vad du vill göra. Veloq OS gör en plan och frågar innan något byggs.</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'bubble-u' : 'bubble-a'}>{m.text}</div>
        ))}
        {thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live" />
            <span className="meta">Tänker…</span>
          </div>
        )}
        <div ref={end} />
      </div>
    </Sheet>
  );
}

export function RoutinesSheet({ routines, onToggle, onClose }: { routines: Routine[]; onToggle: (id: string, enabled: boolean) => void; onClose: () => void }) {
  return (
    <Sheet eyebrow="Rutiner" title="Körs medan du gör annat." label="Rutiner" onClose={onClose}>
      {routines.map((r) => (
        <div key={r.id} className="lrow" style={{ alignItems: 'flex-start', padding: '16px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{r.name}</span>
            <span className="meta">{r.schedule}</span>
            <span style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ink-body)' }}>{r.description}</span>
          </div>
          <button
            className="toggle"
            aria-pressed={r.enabled}
            aria-label={`${r.enabled ? 'Stäng av' : 'Slå på'} ${r.name}`}
            onClick={() => onToggle(r.id, !r.enabled)}
          >
            <span className="knob" />
          </button>
        </div>
      ))}
    </Sheet>
  );
}

const SKILLS = ['veloq-labs-design', 'docs', 'deep-research', 'morning', 'skill-creator'];

export function MemorySheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet eyebrow="Skills & minne" title="Vad den kan och vet." label="Skills och minne" onClose={onClose}>
      <span className="label" style={{ padding: '6px 0 8px' }}>Skills</span>
      {SKILLS.map((s) => (
        <div key={s} className="lrow">
          <span style={{ font: "500 14px var(--font-mono)", flex: 1 }}>/{s}</span>
        </div>
      ))}
      <p className="empty" style={{ paddingTop: 20 }}>
        Minnet och skills läses från Claude när agenten är kopplad. Här visas de du har just nu.
      </p>
    </Sheet>
  );
}
