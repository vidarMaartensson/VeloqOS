import { useEffect, useState } from 'react';
import type { InboxAction, InboxItem } from '../api/types';
import { ACTIONS, actionInfo, defaultDraft, filterItems, inboxTitle, initial, openCount, rowStatus, TAGS, type TagFilter } from '../lib/inbox';
import { relativeDay } from '../lib/time';
import { actionIcon, Icon } from './Icon';

interface Props {
  items: InboxItem[];
  now: Date;
  initialId?: string | null;
  onAct: (id: string, action: InboxAction, body?: string) => void;
  onUndo: (id: string) => void;
  onClearNoise: () => void;
  onClose: () => void;
}

/** Full inbox: every item on the left, the chosen one with its actions on the right. */
export function InboxView({ items, now, initialId, onAct, onUndo, onClearNoise, onClose }: Props) {
  const [filter, setFilter] = useState<TagFilter>('Alla');
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? items[0]?.id ?? null);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');

  const visible = filterItems(items, filter);
  const selected = items.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (item: InboxItem) => {
    setSelectedId(item.id);
    setReplying(false);
  };

  const run = (action: InboxAction) => {
    if (!selected) return;
    if (action === 'reply') {
      setDraft(selected.draft ?? defaultDraft);
      setReplying(true);
      return;
    }
    onAct(selected.id, action);
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <section className="inbox" role="dialog" aria-modal="true" aria-label="Inkorg">
        <div className="inbox-side">
          <div className="inbox-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="eyebrow">Inkorg · Gmail</span>
                <h2 className="inbox-title">{inboxTitle(items)}</h2>
              </div>
              <button className="ghost" style={{ minHeight: 40, padding: '0 14px', fontSize: 14 }} onClick={onClearNoise}>
                Rensa brus
              </button>
            </div>
            <div role="group" aria-label="Filter" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['Alla', ...TAGS] as TagFilter[]).map((f) => (
                <button key={f} className="chip" style={{ minHeight: 36, padding: '0 14px' }} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f}
                  <span className="count">{openCount(items, f)}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="inbox-list" aria-label="Mejl">
            {visible.map((item) => (
              <li key={item.id}>
                <button className={`mrow${item.handledWith ? ' done' : ''}`} aria-current={item.id === selected?.id} onClick={() => pick(item)}>
                  <span className="avatar">{initial(item.from)}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span className="ellipsis" style={{ fontSize: 16, fontWeight: 500 }}>{item.from}</span>
                      <span className="meta" style={{ whiteSpace: 'nowrap' }}>{relativeDay(item.receivedAt, now)}</span>
                    </span>
                    <span className="ellipsis" style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{item.subject}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <span className="pill" style={{ fontSize: 10, padding: '3px 8px' }}>{item.tag}</span>
                      <span className="meta ellipsis" style={{ fontSize: 12 }}>{rowStatus(item)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="inbox-detail">
          <button className="icon-btn" aria-label="Stäng inkorgen" onClick={onClose} style={{ position: 'absolute', top: 20, right: 20 }}>
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
          {!selected ? (
            <p className="empty">Inget här.</p>
          ) : (
            <>
              <span className="meta">{selected.from} · {relativeDay(selected.receivedAt, now)}</span>
              <h2>{selected.subject}</h2>
              <div className="summary">
                <span className="label">Veloq OS sammanfattar</span>
                <p>{selected.summary}</p>
                <span className="meta">Förslag: {selected.suggestion}</span>
              </div>

              {selected.handledWith ? (
                <div className="result" role="status">
                  <Icon name="check" size={22} strokeWidth={1.8} />
                  <span style={{ flex: 1 }}>{actionInfo(selected.handledWith).result}</span>
                  <button className="ghost" style={{ minHeight: 40 }} onClick={() => onUndo(selected.id)}>Ångra</button>
                </div>
              ) : replying ? (
                <div className="enter" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label htmlFor="reply" className="label">Utkast till svar</label>
                  <textarea id="reply" className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="primary"
                      disabled={!draft.trim()}
                      onClick={() => {
                        onAct(selected.id, 'reply', draft);
                        setReplying(false);
                      }}
                    >
                      Skicka svar <Icon name="arrow" size={18} strokeWidth={2.2} />
                    </button>
                    <button className="ghost" style={{ minHeight: 52 }} onClick={() => setReplying(false)}>Avbryt</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span className="label">Välj vad som ska hända</span>
                  <div className="actions">
                    {ACTIONS.map((a) => (
                      <button key={a.id} className={`act${a.id === selected.suggestedAction ? ' recommended' : ''}`} onClick={() => run(a.id)}>
                        <span className="act-ico"><Icon name={actionIcon[a.id]} size={20} /></span>
                        <strong>{a.title}</strong>
                        <span>{a.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
