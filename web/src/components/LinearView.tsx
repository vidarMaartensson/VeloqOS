import { useState } from 'react';
import type { LinearState, NewLinearIssue } from '../api/types';
import { groupByState, isOpen, PRIORITIES, storiesTitle, teamsByWorkspace } from '../lib/linear';
import type { LinearViewState } from '../state/useLinear';
import { Icon } from './Icon';
import { Sheet } from './Sheets';

interface Props {
  state: LinearViewState;
  onPickTeam: (id: string) => void;
  onShowDone: (showDone: boolean) => void;
  onCreate: (issue: NewLinearIssue) => Promise<boolean>;
  onClose: () => void;
}

/** Stories per team in Linear's state order, and a form for a new one. */
export function LinearView({ state, onPickTeam, onShowDone, onCreate, onClose }: Props) {
  const [writing, setWriting] = useState(false);
  const team = state.teams.find((t) => t.id === state.teamId);
  const groups = groupByState(team, state.issues);
  const openCount = state.issues.filter((i) => isOpen(i.state)).length;
  const broken = state.status?.workspaces.filter((w) => w.error) ?? [];

  return (
    <Sheet
      eyebrow={['Linear', team?.workspace, team?.key].filter(Boolean).join(' · ')}
      title={state.loading && state.issues.length === 0 ? 'Hämtar stories…' : storiesTitle(openCount)}
      label="Linear"
      onClose={onClose}
      footer={
        !writing && team ? (
          <button className="primary" onClick={() => setWriting(true)}>
            Ny story <Icon name="arrow" size={18} strokeWidth={2.2} />
          </button>
        ) : undefined
      }
    >
      {state.status && !state.status.configured && (
        <p className="meta" style={{ marginBottom: 12 }}>
          Exempeldata. Lägg en nyckel per workspace med <code>dotnet user-secrets set "Linear:ApiKeys:0" …</code> och starta om API:t.
        </p>
      )}
      {broken.map((w) => (
        <p key={w.id} className="meta" role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>
          {w.name} svarar inte – {w.error}
        </p>
      ))}
      {state.error && <p className="meta" role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{state.error}</p>}

      {teamsByWorkspace(state.teams).map((w) => (
        <div key={w.id} className="linear-workspace">
          <span className="label" id={`ws-${w.id}`}>{w.name}</span>
          <div className="linear-bar" role="group" aria-labelledby={`ws-${w.id}`}>
            {w.teams.map((t) => (
              <button key={t.id} className="chip" aria-pressed={t.id === state.teamId} onClick={() => onPickTeam(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="linear-bar">
        <button className="chip" aria-pressed={state.showDone} onClick={() => onShowDone(!state.showDone)}>
          Även klara
        </button>
      </div>

      {writing && team && (
        <NewStoryForm
          states={team.states.filter(isOpen)}
          onCancel={() => setWriting(false)}
          onCreate={async (issue) => {
            const ok = await onCreate({ ...issue, teamId: team.id });
            if (ok) setWriting(false);
            return ok;
          }}
        />
      )}

      {groups.length === 0 && !state.loading && <p className="empty">Inga stories här.</p>}
      {groups.map(({ state: s, issues }) => (
        <section key={s.id} className="linear-group" aria-label={s.name}>
          <div className="linear-group-head">
            {/* One accent per view: only work in progress gets it, not Linear's own state colors. */}
            <span className={`dot ${s.type}`} />
            <span className="label">{s.name}</span>
            <span className="meta">{issues.length}</span>
          </div>
          <ul>
            {issues.map((i) => (
              <li key={i.id}>
                <a className="linear-row" href={i.url} target="_blank" rel="noreferrer">
                  <span className="meta linear-id">{i.identifier}</span>
                  <span className="ellipsis" style={{ flex: 1, minWidth: 0 }}>{i.title}</span>
                  {i.priority > 0 && <span className="pill">{i.priorityLabel}</span>}
                  {i.assignee && <span className="meta">{i.assignee}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

function NewStoryForm({ states, onCreate, onCancel }: { states: LinearState[]; onCreate: (issue: Omit<NewLinearIssue, 'teamId'>) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(0);
  const [stateId, setStateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== '';

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    await onCreate({ title: title.trim(), description: description.trim() || null, priority, stateId });
    setSaving(false);
  };

  return (
    <form className="event-form linear-form" aria-label="Ny story" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="label" htmlFor="story-title">Titel</label>
      <input id="story-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vad ska göras?" autoFocus />
      <label className="label" htmlFor="story-description">Beskrivning</label>
      <textarea id="story-description" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Valfritt, markdown går bra" />
      <span className="label" id="story-priority">Prioritet</span>
      <div className="linear-bar" role="group" aria-labelledby="story-priority">
        {PRIORITIES.map((label, value) => (
          <button key={label} type="button" className="chip" aria-pressed={priority === value} onClick={() => setPriority(value)}>{label}</button>
        ))}
      </div>
      <span className="label" id="story-state">Status</span>
      <div className="linear-bar" role="group" aria-labelledby="story-state">
        <button type="button" className="chip" aria-pressed={stateId === null} onClick={() => setStateId(null)}>Standard</button>
        {states.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={stateId === s.id} onClick={() => setStateId(s.id)}>{s.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button type="submit" className="primary" disabled={!valid || saving}>
          {saving ? 'Skapar…' : 'Skapa story'} <Icon name="arrow" size={18} strokeWidth={2.2} />
        </button>
        <button type="button" className="ghost" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  );
}
