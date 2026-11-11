import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api as defaultApi, type Api } from './api/client';
import type { VoiceConfirm, VoiceTurn } from './api/types';
import { JobsCard } from './components/Cards';
import { JobSheet, RunSheet, SkillsSheet } from './components/Chores';
import { Icon, Mark, type IconName } from './components/Icon';
import { InboxView } from './components/InboxView';
import { LinearView } from './components/LinearView';
import { BriefCard, CiCard, DiskBadge, ProjectSheet } from './components/Projects';
import { NewEventSheet, RoutinesSheet } from './components/Sheets';
import { ArtifactTile } from './components/tiles/ArtifactTile';
import { CalendarTile } from './components/tiles/CalendarTile';
import { DiskTile } from './components/tiles/DiskTile';
import { InboxTile } from './components/tiles/InboxTile';
import { KpiStrip, type Kpi } from './components/tiles/KpiStrip';
import { LinearTile } from './components/tiles/LinearTile';
import { SkillsTile } from './components/tiles/SkillsTile';
import { PortalContext, type PortalHandle } from './components/voice/Portal';
import { VoiceCore } from './components/voice/VoiceCore';
import { VoiceSettingsSheet } from './components/voice/VoiceSettingsSheet';
import { needsRunSheet } from './lib/chores';
import { beam, flash, gsap, reducedMotion, tileEl } from './lib/motion';
import { desktopRestart } from './lib/desktop';
import { say } from './lib/speech';
import { dateLabel, greeting, isoDate } from './lib/time';
import { columnOf } from './lib/voice';
import { useLinear } from './state/useLinear';
import { useStories } from './state/useStories';
import { useVeloq } from './state/useVeloq';
import { useVoice } from './state/useVoice';
import type { Chore, LinearIssue, Project } from './state/types';

type Panel = 'inbox' | 'linear' | 'routines' | 'skills' | 'run' | 'job' | 'project' | 'event' | 'voice' | null;

/** Re-renders every minute so greetings, "now" markers and past events stay right. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** A line from Rick (or the plain assistant) at the bottom of the screen, for a few seconds. */
function Toast({ toast }: { toast: { text: string; id: number } | null }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!el.current || !toast || reducedMotion()) return;
    gsap.fromTo(el.current, { y: 30, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' });
  }, [toast]);
  if (!toast) return null;
  return <div ref={el} className="toast" role="status">{toast.text}</div>;
}

/** Which data a voice tool's panel needs read again. */
const REFRESH = { calendar: 'calendar', inbox: 'inbox', disk: 'jobs', skills: 'jobs', artifacts: 'artifacts' } as const;

/** `restartApi` is the Mac app's sidecar restart; undefined in a plain browser. */
export default function App({ api = defaultApi, restartApi = desktopRestart() }: { api?: Api; restartApi?: () => Promise<void> }) {
  const { state, actions } = useVeloq(api);
  const [panel, setPanel] = useState<Panel>(null);
  const linear = useLinear(panel === 'linear', api);
  const veloqTeam = state.projects.find((p) => p.id === 'veloq-os')?.linearTeam ?? null;
  const board = useLinear(true, api, { showDone: true, preferKey: veloqTeam });
  const portal = useRef<PortalHandle | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // Linear may grow no taller than the voice card; CSS reads its height from --voice-h.
  useLayoutEffect(() => {
    const root = boardRef.current;
    const voiceCard = root?.querySelector<HTMLElement>('[data-tile="voice"]');
    if (!root || !voiceCard || typeof ResizeObserver === 'undefined') return;
    const sync = () => root.style.setProperty('--voice-h', `${voiceCard.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(voiceCard);
    return () => ro.disconnect();
  }, []);
  const [voicePulse, setVoicePulse] = useState(0);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [inboxId, setInboxId] = useState<string | undefined>(undefined);

  const showToast = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  /** Beams to every panel the voice's tools touched, and reads those panels again. */
  const onTurn = useCallback(
    (turn: VoiceTurn) => {
      const tiles = [...new Set(turn.actions.filter((a) => a.ok).map((a) => a.tile))];
      tiles.forEach((tile, i) => window.setTimeout(() => beam(portal.current?.el() ?? null, tile), i * 220));
      const parts = tiles.flatMap((t) => (t in REFRESH ? [REFRESH[t as keyof typeof REFRESH]] : []));
      void actions.refresh(turn.confirm ? [...parts, 'jobs'] : parts);
      if (tiles.includes('linear')) {
        setVoicePulse((p) => p + 1);
        void board.actions.reload();
      }
      if (tiles.includes('projects')) void actions.refreshExtras(true);
    },
    [actions, board.actions],
  );
  const voice = useVoice(api, onTurn);
  const rick = voice.state.settings.persona === 'rick';

  const jump = (tile: string) => {
    const el = tileEl(tile);
    el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => flash(el), 300);
  };

  const confirmVoice = async (confirm: VoiceConfirm) => {
    const problem = await actions.confirmJob(confirm.jobId, confirm.choices.map((c) => c.id));
    voice.actions.dismissConfirm();
    showToast(problem ?? (rick ? 'Rensar. Försök att inte fylla den igen innan fredag.' : 'Rensar.'));
  };
  const [restart, setRestart] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const now = useNow();
  const [query, setQuery] = useState('');
  const [runChoreId, setRunChoreId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const openProject = state.projects.find((p) => p.id === projectId);
  const stories = useStories(panel === 'project' ? projectId : null, !!openProject?.linearTeam, api);


  const rail: { key: Exclude<Panel, 'run' | 'job' | 'project' | 'event' | null> | 'home'; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Översikt', icon: 'home' },
    { key: 'inbox', label: 'Inkorg', icon: 'mail' },
    { key: 'linear', label: 'Linear', icon: 'stories' },
    { key: 'routines', label: 'Rutiner', icon: 'clock' },
    { key: 'skills', label: 'Skills', icon: 'skill' },
  ];

  const restartAndReload = async () => {
    if (!restartApi) return;
    setRestart({ busy: true, error: null });
    try {
      await restartApi();
      setRestart({ busy: false, error: null });
      await actions.reload();
    } catch (e) {
      setRestart({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Starts a chore that has no sheet to show the API's complaint in. */
  const runDirectly = (id: string) => {
    void actions.runChore(id).then((problem) => problem && showToast(problem));
  };

  /** Runs a chore on a tap, or opens the run sheet when it takes a project or an addition. */
  const startChore = (chore: Chore) => {
    if (needsRunSheet(chore)) {
      setRunChoreId(chore.id);
      setPanel('run');
    } else {
      runDirectly(chore.id);
      if (panel === 'skills') setPanel(null);
    }
  };
  const runChore = state.chores.find((c) => c.id === runChoreId);
  const choreRunning = (id: string) => state.jobs.some((j) => j.choreId === id && j.status === 'running');
  const [briefAsked, setBriefAsked] = useState(false);
  const writeBrief = async () => {
    setBriefAsked(true);
    try { await actions.runRoutine('morning-brief'); } finally { setBriefAsked(false); }
  };

  const showProject = (project: Project) => {
    setProjectId(project.id);
    setPanel('project');
  };

  const openJob = state.jobs.find((j) => j.id === jobId);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Huvudmeny">
        <span className="rail-mark" style={{ marginBottom: 22 }}><Mark /></span>
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
        <button className="rail-btn" aria-current={panel === 'voice'} onClick={() => setPanel('voice')}>
          <span className="ico"><Icon name="mic" /></span>
          Röst
        </button>
        <a className="rail-btn" href="#artifacts" onClick={(e) => { e.preventDefault(); jump('artifacts'); }}>
          <span className="ico"><Icon name="shelf" /></span>
          Artefakter
        </a>
        <div className="rail-status">
          <span className={state.error ? '' : 'live'} style={state.error ? { width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--danger)' } : undefined} />
          {state.error ? 'Offline' : 'Online'}
          {restartApi && (
            <button className="rail-restart" onClick={restartAndReload} disabled={restart.busy} aria-label="Starta om API:t">
              <Icon name="sync" size={18} />
            </button>
          )}
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
            <DiskBadge system={state.system} onClean={() => runDirectly('disk-cleanup')} />
            <div className="conn"><span className="live" />Dator · telefon</div>
          </div>
        </header>

        {(state.error || restart.busy || restart.error) && (
          <div role="alert" className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, color: restart.busy ? 'var(--ink-body)' : 'var(--danger)', fontSize: 15 }}>
              {restart.busy
                ? 'Startar om API:t…'
                : restart.error
                  ? `Omstarten misslyckades – ${restart.error}`
                  : restartApi
                    ? `Kunde inte nå Veloq OS-API:t. (${state.error})`
                    : <>Kunde inte nå Veloq OS-API:t. Kör <code>dotnet run</code> i api/ och ladda om. ({state.error})</>}
            </span>
            {restartApi && !restart.busy && (
              <button className="primary" onClick={restartAndReload}>Starta om API:t</button>
            )}
            {!restart.busy && (
              <button className="ghost" onClick={() => { actions.dismissError(); setRestart({ busy: false, error: null }); }}>Stäng</button>
            )}
          </div>
        )}

        <KpiStrip items={kpis(state, board.state.issues, now)} onJump={jump} />

        <PortalContext.Provider value={portal}>
          <div className="board" ref={boardRef}>
            <CalendarTile
              calendar={state.calendar}
              date={state.calendarDate}
              now={now}
              rick={rick}
              onPickDate={actions.showDate}
              onConnect={actions.connectCalendar}
              onBook={actions.book}
              onNew={() => setPanel('event')}
              onMove={(e, start, end) => actions.moveEvent(e.id, start, end)}
              onToast={showToast}
            />
            <VoiceCore
              voice={voice.state}
              portalRef={portal}
              onAsk={voice.actions.ask}
              onHold={voice.actions.hold}
              onRelease={voice.actions.release}
              onStop={voice.actions.stop}
              onSettings={() => setPanel('voice')}
              onConfirm={confirmVoice}
              onDismissConfirm={voice.actions.dismissConfirm}
              onShowDisk={() => jump('disk')}
            />
            <BriefCard brief={state.brief} now={now} rick={rick} writing={briefAsked || choreRunning('morning-brief')} onWrite={writeBrief} />
            <InboxTile
              items={state.inbox}
              now={now}
              rick={rick}
              onAct={actions.act}
              onOpen={(id) => { setInboxId(id); setPanel('inbox'); }}
              onOpenAll={() => { setInboxId(undefined); setPanel('inbox'); }}
            />
            <SkillsTile chores={state.chores} jobs={state.jobs} onRun={startChore} onOpenAll={() => setPanel('skills')} onOldChats={() => runDirectly('old-chats')} />
            <LinearTile
              state={board.state}
              rick={rick}
              voicePulse={voicePulse}
              onPickTeam={board.actions.pickTeam}
              onMove={board.actions.move}
              onCreate={board.actions.create}
              onOpenAll={() => setPanel('linear')}
              onToast={showToast}
            />
            <ArtifactTile artifacts={state.artifacts} query={query} syncing={choreRunning('sync-artifacts')} onSync={() => runDirectly('sync-artifacts')} />
          </div>

          <div className="lower">
            <DiskTile
              system={state.system}
              jobs={state.jobs}
              rick={rick}
              onScan={() => runDirectly('disk-cleanup')}
              onConfirm={async (jobId, choices) => {
                const problem = await actions.confirmJob(jobId, choices);
                if (!problem && voice.state.confirm?.jobId === jobId) voice.actions.dismissConfirm();
                return problem;
              }}
              onToast={showToast}
            />
            <JobsCard jobs={state.jobs} onOpen={(j) => { setJobId(j.id); setPanel('job'); }} />
            <CiCard projects={state.projects} statuses={state.statuses} onOpen={showProject} />
          </div>
        </PortalContext.Provider>
      </main>

      {panel === 'project' && openProject && (
        <ProjectSheet
          key={openProject.id}
          project={openProject}
          status={state.statuses.find((s) => s.projectId === openProject.id)}
          stories={stories}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'inbox' && (
        <InboxView
          items={state.inbox}
          now={now}
          initialId={inboxId}
          onAct={actions.act}
          onUndo={actions.undo}
          onClearNoise={actions.clearNoise}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'linear' && (
        <LinearView
          state={linear.state}
          onPickTeam={linear.actions.pickTeam}
          onShowDone={linear.actions.setShowDone}
          onCreate={linear.actions.create}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'routines' && <RoutinesSheet routines={state.routines} now={now} onToggle={actions.setRoutine} onRun={(id) => void actions.runRoutine(id)} onClose={() => setPanel(null)} />}
      {panel === 'skills' && <SkillsSheet chores={state.chores} onPick={startChore} onClose={() => setPanel(null)} />}
      {panel === 'run' && runChore && (
        <RunSheet key={runChore.id} chore={runChore} projects={state.projects} onRun={actions.runChore} onClose={() => setPanel(null)} />
      )}
      {panel === 'job' && openJob && (
        <JobSheet key={openJob.id} job={openJob} onConfirm={actions.confirmJob} onClose={() => setPanel(null)} />
      )}
      {panel === 'voice' && (
        <VoiceSettingsSheet
          settings={voice.state.settings}
          status={voice.state.status}
          onChange={voice.actions.setSettings}
          onTest={() => void say(
            rick ? 'Det här är jag. *rap* Imponerad? Det borde du vara.' : 'Så här låter jag. Säg till om du vill ändra något.',
            voice.state.settings,
            voice.state.status?.speech.speak === 'elevenlabs' ? api.speak : undefined,
          )}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'event' && <NewEventSheet date={state.calendarDate} now={now} onCreate={actions.addEvent} onClose={() => setPanel(null)} />}
      <svg id="beams" className="beams" aria-hidden="true" />
      <Toast toast={toast} />
    </div>
  );
}

/** The numbers across the top. Meetings left today come from the calendar when it shows today. */
function kpis(state: ReturnType<typeof useVeloq>['state'], issues: LinearIssue[], now: Date): Kpi[] {
  const today = state.calendar?.connected && state.calendarDate === isoDate(now);
  const meetings = today ? state.calendar!.events.filter((e) => !e.suggested && new Date(e.end) > now).length : null;
  const free = state.system ? Math.round(state.system.disk.free / 1024 ** 3) : null;
  return [
    { key: 'meetings', label: 'Möten kvar', value: meetings, tile: 'calendar' },
    { key: 'inbox', label: 'Behöver dig', value: state.overview?.inboxNeedsYou ?? null, tile: 'inbox' },
    { key: 'linear', label: 'Öppna stories', value: issues.filter((i) => { const c = columnOf(i.state.type); return c !== null && c !== 'done'; }).length, tile: 'linear' },
    { key: 'disk', label: 'Ledigt', value: free, unit: 'GB', tile: 'disk' },
    { key: 'jobs', label: 'Jobb kör', value: state.overview?.runningJobs ?? null, tile: 'skills' },
  ];
}
