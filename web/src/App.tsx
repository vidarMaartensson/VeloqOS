import { useEffect, useMemo, useState } from 'react';
import type { Api } from './api/client';
import { ArtifactShelf, JobsCard, QuickPrompt, StatRow, TodayCard } from './components/Cards';
import { CalendarCard } from './components/CalendarCard';
import { Icon, Mark, type IconName } from './components/Icon';
import { InboxView } from './components/InboxView';
import { Orbit } from './components/Orbit';
import { MemorySheet, PromptSheet, RoutinesSheet } from './components/Sheets';
import { buildTimeline } from './lib/today';
import { clock, dateLabel, greeting, isoDate } from './lib/time';
import { useVeloq } from './state/useVeloq';

type Panel = 'prompt' | 'inbox' | 'routines' | 'memory' | null;

/** Re-renders every minute so greetings, "now" markers and past events stay right. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function App({ api }: { api?: Api }) {
  const { state, actions } = useVeloq(api);
  const now = useNow();
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Alla');
  const [promptContext, setPromptContext] = useState('Fritt');

  const timeline = useMemo(
    () =>
      buildTimeline(
        state.routines,
        state.calendar?.connected && state.calendarDate === isoDate(now) ? state.calendar.events : [],
        now,
        clock(now.toISOString()),
      ),
    [state.routines, state.calendar, state.calendarDate, now],
  );

  const rail: { key: Exclude<Panel, null> | 'home'; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Översikt', icon: 'home' },
    { key: 'prompt', label: 'Prompt', icon: 'chat' },
    { key: 'inbox', label: 'Inkorg', icon: 'mail' },
    { key: 'routines', label: 'Rutiner', icon: 'clock' },
    { key: 'memory', label: 'Minne', icon: 'layers' },
  ];

  const send = (text: string) => {
    setPanel('prompt');
    actions.send(text, promptContext === 'Fritt' ? undefined : promptContext);
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Huvudmeny">
        <span style={{ marginBottom: 22 }}><Mark /></span>
        {rail.map((r) => (
          <button
            key={r.key}
            className="rail-btn"
            aria-current={(r.key === 'home' && panel === null) || r.key === panel}
            onClick={() => setPanel(r.key === 'home' ? null : r.key)}
          >
            <span className="ico"><Icon name={r.icon} /></span>
            {r.label}
          </button>
        ))}
        <a className="rail-btn" href="#shelf">
          <span className="ico"><Icon name="shelf" /></span>
          Artefakter
        </a>
        <div className="rail-status">
          <span className={state.error ? '' : 'live'} style={state.error ? { width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--danger)' } : undefined} />
          {state.error ? 'Offline' : 'Online'}
        </div>
      </nav>

      <main className="main">
        <header className="topbar enter">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">{dateLabel(now)}</span>
            <h1>{greeting(now)}, Vidar.</h1>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="search">
              <Icon name="search" size={20} />
              <label htmlFor="search" className="sr-only">Sök projekt och artefakter</label>
              <input id="search" placeholder="Sök projekt och artefakter…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="conn"><span className="live" />Dator · telefon</div>
          </div>
        </header>

        {state.error && (
          <div role="alert" className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '14px 20px' }}>
            <span style={{ flex: 1, color: 'var(--danger)', fontSize: 15 }}>
              Kunde inte nå Veloq OS-API:t. Kör <code>dotnet run</code> i api/ och ladda om. ({state.error})
            </span>
            <button className="ghost" onClick={actions.dismissError}>Stäng</button>
          </div>
        )}

        <StatRow
          overview={state.overview}
          onOpen={(what) => {
            if (what === 'inbox') setPanel('inbox');
            else if (what === 'routines') setPanel('routines');
            else if (what === 'jobs') setPanel('prompt');
            else if (what === 'artifacts') document.getElementById('shelf')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        <div className="grid">
          <div className="col">
            <TodayCard entries={timeline} onOpenRoutines={() => setPanel('routines')} />
            <JobsCard jobs={state.jobs} />
          </div>
          <Orbit
            projects={state.projects}
            chores={state.chores}
            jobs={state.jobs}
            query={query}
            onRunChore={actions.runChore}
            onPromptProject={(p) => {
              setPromptContext(p.name);
              setPanel('prompt');
            }}
          />
          <div className="col">
            <QuickPrompt messages={state.messages} thinking={state.thinking} onSend={send} />
            <CalendarCard
              calendar={state.calendar}
              date={state.calendarDate}
              now={now}
              onConnect={actions.connectCalendar}
              onPickDate={actions.showDate}
              onBook={actions.book}
            />
          </div>
        </div>

        <ArtifactShelf artifacts={state.artifacts} query={query} group={group} onGroup={setGroup} />
      </main>

      {panel === 'prompt' && (
        <PromptSheet context={promptContext} messages={state.messages} thinking={state.thinking} onSend={send} onClose={() => setPanel(null)} />
      )}
      {panel === 'inbox' && (
        <InboxView
          items={state.inbox}
          now={now}
          onAct={actions.act}
          onUndo={actions.undo}
          onClearNoise={actions.clearNoise}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'routines' && <RoutinesSheet routines={state.routines} onToggle={actions.setRoutine} onClose={() => setPanel(null)} />}
      {panel === 'memory' && <MemorySheet onClose={() => setPanel(null)} />}
    </div>
  );
}
