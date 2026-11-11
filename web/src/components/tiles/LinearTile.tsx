import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { LinearIssue, NewLinearIssue } from '../../api/types';
import { Draggable, Flip, center, fromPortal, gsap, reducedMotion, sparks } from '../../lib/motion';
import { COLUMNS, columnOf, stateFor, type Column } from '../../lib/voice';
import type { LinearViewState } from '../../state/useLinear';
import { usePortal } from '../voice/Portal';

interface Props {
  state: LinearViewState;
  rick: boolean;
  /** Bumped when the voice touched Linear; new cards then fly out of the portal. */
  voicePulse: number;
  onPickTeam: (id: string) => void;
  onMove: (issue: LinearIssue, stateId: string) => Promise<boolean>;
  onCreate: (issue: NewLinearIssue) => Promise<boolean>;
  onOpenAll: () => void;
  onToast: (text: string) => void;
}

const DONE_SHOWN = 5;

/** A kanban for one team. Drag a card to another column (or use the arrow keys) to change its state. */
export function LinearTile({ state, rick, voicePulse, onPickTeam, onMove, onCreate, onOpenAll, onToast }: Props) {
  const team = state.teams.find((t) => t.id === state.teamId);
  const board = useRef<HTMLDivElement>(null);
  const portal = usePortal();
  const flip = useRef<Flip.FlipState | null>(null);
  const known = useRef<Set<string> | null>(null);
  const pulse = useRef(voicePulse);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Column>('backlog');
  const [scrolls, setScrolls] = useState(false);

  const columns = COLUMNS.map((c) => {
    const issues = state.issues.filter((i) => columnOf(i.state.type) === c.id);
    return { ...c, issues: c.id === 'done' ? issues.slice(0, DONE_SHOWN) : issues };
  });

  const moveTo = async (issue: LinearIssue, column: Column) => {
    const target = stateFor(team, column);
    if (!target || columnOf(issue.state.type) === column) return false;
    if (board.current && !reducedMotion()) flip.current = Flip.getState(board.current.querySelectorAll('.issue'));
    const ok = await onMove(issue, target.id);
    if (ok && column === 'done') {
      onToast(rick ? `${issue.identifier} klar. Skriv det i din dagbok, Vidar.` : `${issue.identifier} är klar.`);
      window.setTimeout(() => {
        const el = board.current?.querySelector(`[data-id="${CSS.escape(issue.id)}"]`);
        if (el) {
          const c = center(el);
          sparks(c.x, c.y);
        }
      }, 450);
    }
    return ok;
  };
  const latest = useRef({ columns, moveTo });
  latest.current = { columns, moveTo };

  // After a move: animate the cards from where they were. New cards after a voice command: out of the portal.
  useLayoutEffect(() => {
    const root = board.current;
    if (!root) return;
    if (flip.current) {
      Flip.from(flip.current, { duration: 0.6, ease: 'power3.inOut', absolute: true, nested: true });
      flip.current = null;
    }
    const ids = new Set(state.issues.map((i) => i.id));
    if (known.current && pulse.current !== voicePulse) {
      for (const id of ids) {
        if (!known.current.has(id)) fromPortal(portal.current?.el() ?? null, root.querySelector(`[data-id="${CSS.escape(id)}"]`));
      }
    }
    if (state.issues.length > 0 || !state.loading) {
      known.current = ids;
      pulse.current = voicePulse;
    }
  }, [state.issues, state.loading, voicePulse, portal]);

  // The board has a fixed height; when the stories do not fit, it scrolls and shows a line where it is cut off.
  useLayoutEffect(() => {
    const root = board.current;
    if (!root) return;
    const fit = () => setScrolls(root.scrollHeight > root.clientHeight + 1);
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    Array.from(root.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [state.issues]);

  // Each card can be dragged to a column.
  useLayoutEffect(() => {
    const root = board.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.issue'));
    const drops = Array.from(root.querySelectorAll<HTMLElement>('.col'));
    /** The column under the pointer: its lane counts from the top of the board to well below it. Page coordinates in. */
    const under = (pageX: number, pageY: number) => {
      const x = pageX - window.scrollX, y = pageY - window.scrollY;
      const board = root.getBoundingClientRect();
      if (y < board.top - 40 || y > board.bottom + 80) return undefined;
      return drops.find((d) => {
        const r = d.getBoundingClientRect();
        return x >= r.left - 6 && x <= r.right + 6;
      });
    };
    const drags = cards.map((card) => {
      const [drag] = Draggable.create(card, {
        type: 'x,y',
        zIndexBoost: true,
        onPress() { card.classList.add('dragging'); },
        onDrag() {
          const over = under(this.pointerX, this.pointerY);
          drops.forEach((d) => d.classList.toggle('over', d === over));
        },
        onRelease() {
          card.classList.remove('dragging');
          const over = under(this.pointerX, this.pointerY);
          drops.forEach((d) => d.classList.remove('over'));
          const issue = latest.current.columns.flatMap((c) => c.issues).find((i) => i.id === card.dataset.id);
          const column = over?.dataset.col as Column | undefined;
          if (issue && column && column !== columnOf(issue.state.type)) {
            gsap.set(card, { x: 0, y: 0 });
            void latest.current.moveTo(issue, column);
          } else gsap.to(card, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,0.5)' });
        },
      });
      return drag;
    });
    return () => drags.forEach((d) => d.kill());
  }, [state.issues]);

  // New stories go to the column picked next to the field; only columns the team has a state for are offered.
  const targets = COLUMNS.filter((c) => stateFor(team, c.id));
  const target = targets.find((c) => c.id === picked) ?? targets[0];

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!team || !title.trim()) return;
    const stateId = target ? (stateFor(team, target.id)?.id ?? null) : null;
    if (await onCreate({ teamId: team.id, title: title.trim(), description: null, priority: 0, stateId })) setTitle('');
  };

  return (
    <section className="card tile linear-tile" data-tile="linear" aria-label="Linear">
      <header className="tile-head">
        <span className="eyebrow">Linear</span>
        {state.teams.length > 1 ? (
          <>
            <label htmlFor="linear-team" className="sr-only">Team</label>
            <select id="linear-team" className="input sm" value={state.teamId ?? ''} onChange={(e) => onPickTeam(e.target.value)}>
              {state.teams.map((t) => <option key={t.id} value={t.id}>{t.key} · {t.name}</option>)}
            </select>
          </>
        ) : (
          <span className="meta">{team ? `${team.key} · ${team.name}` : '…'}</span>
        )}
        <button className="ghost sm" onClick={onOpenAll}>Alla</button>
      </header>
      {state.error && <p className="tile-error">{state.error}</p>}
      <div
        className={`kanban${scrolls ? ' scrolls' : ''}`}
        ref={board}
        role="group"
        aria-label="Stories"
        // Focusable only when it scrolls, so the keyboard (arrows, Page Down) can move through a long board.
        tabIndex={scrolls ? 0 : undefined}
      >
        {columns.map((col, ci) => (
          <div key={col.id} className="col" data-col={col.id} aria-label={col.label} role={col.issues.length > 0 ? 'list' : 'group'}>
            <div className="col-head">
              <span className="label">{col.label}</span>
              <span className="meta">{col.issues.length}</span>
            </div>
            {col.issues.map((issue) => (
              <div
                key={issue.id}
                className={`issue p${issue.priority}`}
                data-id={issue.id}
                role="listitem"
                tabIndex={0}
                aria-label={`${issue.identifier}: ${issue.title}, ${col.label}. Pil vänster eller höger flyttar.`}
                onKeyDown={(e) => {
                  const next = e.key === 'ArrowRight' ? COLUMNS[ci + 1] : e.key === 'ArrowLeft' ? COLUMNS[ci - 1] : undefined;
                  if (!next) return;
                  e.preventDefault();
                  void moveTo(issue, next.id);
                }}
              >
                <span className="meta">{issue.identifier}</span>
                <span className="issue-title">{issue.title}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <form className="row" onSubmit={create}>
        <label htmlFor="linear-new" className="sr-only">Ny story</label>
        <input id="linear-new" className="input" placeholder={`Ny story i ${(target?.label ?? 'Backlog').toLowerCase()}…`} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!team} />
        <label htmlFor="linear-new-col" className="sr-only">Kolumn</label>
        <select id="linear-new-col" className="input linear-new-col" value={target?.id ?? ''} onChange={(e) => setPicked(e.target.value as Column)} disabled={!team || targets.length === 0}>
          {targets.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="ghost" type="submit" disabled={!team || !title.trim()}>Lägg till</button>
      </form>
    </section>
  );
}
