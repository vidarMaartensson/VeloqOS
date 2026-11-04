# API-kontrakt

Bas: `http://<dator>:7480/api`. JSON med camelCase. Alla tider i ISO 8601 med offset.

Om `Auth:ApiKey` är satt måste varje anrop (utom `/api/health`) skicka `X-Veloq-Key: <nyckel>`, annars `401`.

## Hälsa

`GET /api/health` → `{ "status": "ok", "version": "0.1.0" }`

## Översikt

`GET /api/overview` → siffrorna i dashboardens statusrad.

```json
{ "projects": 11, "activeProjects": 3, "runningJobs": 2, "inboxNeedsYou": 4, "routinesOn": 3, "routinesTotal": 4, "artifacts": 24 }
```

## System

`GET /api/system` → datorn som API:t kör på.

```json
{ "disk": { "free": 3435973836, "total": 494384795648, "label": "3,2 GB ledigt av 460 GB", "low": true } }
```

`low` är `true` när mindre än 10 % eller mindre än 10 GB är ledigt. Klienterna visar då en varning som startar `disk-cleanup`.

## Projekt

`GET /api/projects` → `Project[]`

```json
{ "id": "halodeck", "name": "HaloDeck", "meta": "Docka · Android", "status": "I utveckling", "tier": 3, "body": "…", "group": "Appar", "repoPath": "/Users/…/VeloqLabs/HaloDeck", "linearTeam": "HAL" }
```

`tier`: 3 = aktiv (stor orb med satellit), 2 = planerad, 1 = vilande.

`repoPath`: projektets mapp på datorn, `null` om projektet saknar repo eller mappen inte finns. Mapparna letas upp under `Veloq:ProjectsRoot` (standard `~/Developer/VeloqLabs`). Chores som jobbar i ett repo kräver ett projekt med `repoPath`.

`linearTeam`: nyckeln för projektets team i Linear (till exempel `VEL`), `null` om projektet inte är kopplat. Standard i projektdatan, ändras med `Veloq:LinearTeams:<projekt-id>` (tom sträng tar bort kopplingen).

### Status: git, PR:er och CI

`GET /api/projects/status` → `ProjectStatus[]` för projekten med `repoPath`, i projektlistans ordning.

```json
{ "projectId": "veloq-os", "branch": "feature/x", "changes": 12, "ahead": 2,
  "lastCommit": { "message": "Add Veloq OS as a Mac app", "at": "…" },
  "pullRequests": 1, "ci": "failing", "ciUrl": "https://github.com/…/actions/runs/…", "attention": true, "error": null }
```

| Fält | Betydelse |
|---|---|
| `changes` | ocommittade filer (`git status --porcelain`) |
| `ahead` | commits som inte är pushade, `null` utan upstream |
| `pullRequests` | öppna PR:er i repot via `gh`, `null` om `gh` saknas eller repot inte ligger på GitHub |
| `ci` | senaste GitHub Actions-körningen på aktuell branch: `passing`, `failing`, `running` eller `null` |
| `attention` | `true` när CI är rött eller det finns ocommittade ändringar – orbiten visar en prick |
| `error` | kort text när repot inte gick att läsa |

Svaren från GitHub cachas en minut; `?refresh=true` hämtar nytt.

### Stories

`GET /api/projects/{id}/stories` → projektets öppna stories (`LinearIssue[]`, samma form som under Linear), senast ändrad först. `404` om projektet inte finns eller dess team inte finns i någon workspace, `400` om projektet saknar `linearTeam`.

## Chores, skills och jobb

Chores och skills körs på riktigt på datorn. De flesta går genom Claude Code (`claude -p`, samma inloggning som Claude Code-appen) med `--permission-mode` från `Claude:ChorePermissionMode` (standard `auto`). `disk-cleanup` och `clear-inbox` körs direkt i API:t.

`GET /api/chores` → `Chore[]` – inbyggda chores först, sedan dina skills från `~/.claude/skills` (`Claude:SkillsFolder`) sorterade på namn.

```json
{ "id": "unused-packages", "name": "Oanvända paket", "description": "…", "icon": "package", "estimate": "≈ 3 min",
  "kind": "chore", "project": "required", "argument": null }
```

| Fält | Betydelse |
|---|---|
| `kind` | `chore` (inbyggd) eller `skill` (en av dina skills, id `skill-<namn>`, körs som `/<namn>`) |
| `project` | `none` (körs i `Veloq:CodeHome`), `optional` eller `required` – bara projekt med `repoPath` går att välja |
| `argument` | Platshållare för ett fritt tillägg (till exempel branchnamn), `null` = inget tillägg |

`POST /api/chores/{id}/run` med `{ "projectId": "veloq-os", "argument": "feature/x" }` (båda valfria, tom kropp går bra) → `202 Accepted` + `Job`. `404` om choren inte finns. `400` om projekt krävs men saknas, om projektet inte finns eller saknar mapp, eller om choren inte tar något projekt.

`GET /api/jobs` → `Job[]` (senaste först)

```json
{ "id": "…", "choreId": "disk-cleanup", "title": "Rensa cache", "project": null, "step": "Kör på datorn…", "progress": 0.42,
  "status": "running", "startedAt": "…", "finishedAt": null, "result": null, "choices": null, "confirm": null }
```

`status`: `running` | `done` | `failed`. `finishedAt` sätts när jobbet blivit `done` eller `failed`; telefonen använder den för notiser. `progress` 0–1 är en uppskattning utifrån chorens normala tid och står på högst 0,9 tills jobbet är klart. När jobbet är klart sätts `result` till svaret (flera rader går bra); vid `failed` står felet där.

Vissa jobb slutar med ett förslag som du godkänner i stället för att ändra något direkt (`disk-cleanup`, `unused-packages`, `claude-md`). Då är `choices` en lista och `confirm` knappens text:

```json
{ "status": "done", "result": "Hittade 14,2 GB att frigöra. 61,0 GB ledigt nu.",
  "choices": [{ "id": "gradle", "label": "Gradle", "detail": "~/.gradle/caches · 9,8 GB" }], "confirm": "Rensa valda" }
```

`POST /api/jobs/{id}/confirm` med `{ "choices": ["gradle", "npm"] }` → `202 Accepted` + ett nytt `Job` som utför valen. `404` om jobbet inte finns, `400` om listan är tom eller innehåller okända id, `409` om jobbet inte väntar på ett val (kör fortfarande, saknar `choices` eller är redan godkänt). Efter godkännandet blir `choices` och `confirm` `null` på det gamla jobbet.

## Rutiner

`GET /api/routines` → `Routine[]`

```json
{ "id": "morning-brief", "name": "Morgonbrief", "schedule": "Vardagar · 07:40", "description": "…", "enabled": true,
  "choreId": "morning-brief", "nextRunAt": "2026-11-02T07:40:00+01:00", "lastRunAt": null }
```

En rutin kör sin chore (`choreId`) som ett vanligt jobb på schemat, i tidszonen `Veloq:TimeZone`. Var datorn avstängd eller sov körs den när API:t är igång igen, om det är högst tre timmar sedan, men aldrig två gånger för samma tillfälle. `nextRunAt` är `null` när rutinen är avslagen.

| Rutin | Chore | Schema |
|---|---|---|
| `morning-brief` | `morning-brief` | Vardagar · 07:40 |
| `artifact-sync` | `sync-artifacts` | Dagligen · 07:30 |
| `inbox-review` | `clear-inbox` | Dagligen · 16:30 |
| `memory-cleanup` | `memory-cleanup` | Söndagar · 20:00 |
| `week-review` | `week-summary` | Fredagar · 15:00 |

`PUT /api/routines/{id}` med `{ "enabled": false }` → uppdaterad `Routine`.

`POST /api/routines/{id}/run` → `202 Accepted` + `Job`, kör rutinen nu. `404` om rutinen inte finns.

## Morgonbrief

Choren `morning-brief` samlar dagens kalender, mejlen som behöver dig, öppna stories i de kopplade projekten och projektens status (rött CI, ocommittade ändringar) och låter Claude skriva ihop det (chatt-läge, utan verktyg).

`GET /api/brief` → den senaste briefen, `204` om ingen finns än.

```json
{ "text": "…", "createdAt": "…", "jobId": "…" }
```

## Inkorg

`GET /api/inbox?tag=Åtgärd` → `InboxItem[]` (`tag` valfri: `Åtgärd`, `Svar`, `Info`, `Brus`)

```json
{
  "id": "…", "from": "GitHub", "receivedAt": "…", "subject": "…", "tag": "Åtgärd",
  "summary": "…", "suggestedAction": "delegate", "suggestion": "låt Veloq OS föreslå en fix",
  "draft": null, "handledWith": null
}
```

`POST /api/inbox/{id}/actions` med `{ "action": "archive" }` → uppdaterat `InboxItem`. Giltiga actions:

| action | betyder |
|---|---|
| `reply` | skicka svar; kräver `{ "action": "reply", "body": "…" }` |
| `delegate` | låt Veloq OS göra det föreslagna |
| `archive` | arkivera |
| `task` | gör till uppgift i rätt projekt |
| `snooze` | tillbaka i inkorgen i morgon 08:00 |
| `calendar` | lägg i kalendern och tacka ja |

Med Gmail ansluten gör actions följande i Gmail: `archive` tar bort etiketten INBOX, `reply` skickar svaret direkt i samma tråd, `snooze` arkiverar och sätter etiketten `Veloq/Snoozad`, och `task`, `delegate` och `calendar` sätter etiketterna `Veloq/Uppgift`, `Veloq/Delegerad` och `Veloq/Kalender`. Utan Google ansluten är inkorgen tom.

`DELETE /api/inbox/{id}/actions` → ångra, `handledWith` blir `null`. `409` för `reply`: ett skickat svar går inte att ångra.

`POST /api/inbox/clear-noise` → arkiverar allt med taggen `Brus`, returnerar antal.

## Kalender

`GET /api/calendar?date=2026-10-29` → `{ "connected": false, "events": [] }` tills kalendern är ansluten.

`POST /api/calendar/connect` → `{ "connected": false, "authUrl": "https://accounts.google.com/…" }`. Exempel-providern ansluter direkt och returnerar `authUrl: null`. Med Google är det samma inloggning som `POST /api/google/connect`.

`CalendarEvent`: `{ "id": "…", "title": "…", "start": "…", "end": "…", "location": "…", "suggested": false }`

`POST /api/calendar/suggestions/{id}/book` → bokar ett förslag från Veloq OS, returnerar eventet med `suggested: false`.

`POST /api/calendar/events` med `{ "title": "Fokus", "start": "2026-10-30T09:00:00+01:00", "end": "2026-10-30T11:00:00+01:00", "location": null }` → `201` + `CalendarEvent`, inlagt i primärkalendern. `400` om titeln saknas eller `end` inte ligger efter `start`, `409` om kalendern inte är ansluten.

`PATCH /api/calendar/events/{id}` med `{ "start": "2026-10-30T10:00:00+01:00", "end": "2026-10-30T12:00:00+01:00" }` → det flyttade `CalendarEvent`. Dashboarden använder det när du drar en händelse i tidslinjen. `400` om `end` inte ligger efter `start`, `404` om händelsen inte finns, `409` om kalendern inte är ansluten. Förslag (`suggested: true`) flyttas inte, de bokas först.

## Google

En inloggning ger både Gmail och Google Kalender. Kräver `Google:ClientId` och `Google:ClientSecret` (OAuth-klient av typen Desktop app, i `dotnet user-secrets`). Utan dem används exempeldata.

`GET /api/google` → `{ "configured": true, "connected": true, "email": "…" }`

`POST /api/google/connect` → `{ "authUrl": "https://accounts.google.com/…" }`. Öppna adressen i en vanlig webbläsare (Google tillåter inte inloggning i inbäddade webbvyer). `409` om Google inte är konfigurerat.

`GET /api/google/callback?code=…&state=…` → dit Google skickar tillbaka webbläsaren. Skickar vidare till dashboarden som startade inloggningen, annars en sida som säger att det är klart.

`POST /api/google/disconnect` → `204`, tar bort sparad inloggning.

## Linear

En personlig API-nyckel hör till en workspace. Lägg en nyckel per workspace i `dotnet user-secrets` (Linear → Settings → Security & access → Personal API keys):

```bash
dotnet user-secrets --project src/VeloqOS.Api set "Linear:ApiKeys:0" "lin_api_…"
dotnet user-secrets --project src/VeloqOS.Api set "Linear:ApiKeys:1" "lin_api_…"
```

`Linear:ApiKey` (en nyckel) fungerar också och räknas som en till. Utan nycklar används exempeldata och `configured` är `false`.

`GET /api/linear` → en rad per nyckel. `error` är satt om just den workspacen inte svarade (t.ex. en ogiltig nyckel); de andra fungerar ändå.

```json
{ "configured": true, "workspaces": [ { "id": "…", "name": "Veloq Labs", "error": null }, { "id": "key-2", "name": "Nyckel 2", "error": "Linear: Authentication required" } ] }
```

`GET /api/linear/teams` → `LinearTeam[]` från alla workspaces som svarar, i nycklarnas ordning (`ApiKeys:0` först) och sedan på namn, med teamets statusar i Linears ordning. `502` bara om ingen workspace svarar.

```json
{ "id": "…", "key": "VEL", "name": "Veloq", "workspaceId": "…", "workspace": "Veloq Labs", "states": [ { "id": "…", "name": "Todo", "type": "unstarted", "color": "#e2e2e2" } ] }
```

`type`: `triage` | `backlog` | `unstarted` | `started` | `completed` | `canceled`.

`GET /api/linear/issues?teamId=…&open=true` → `LinearIssue[]`, senast uppdaterade först (högst 100). `open=true` (standard) utelämnar `completed` och `canceled`. Team-id:n är unika över alla workspaces, så API:t väljer själv rätt nyckel. `400` om `teamId` saknas, `404` om inget team har det id:t.

```json
{
  "id": "…", "identifier": "VEL-12", "title": "Restart-knapp", "description": "…", "priority": 2, "priorityLabel": "Hög",
  "url": "https://linear.app/…/issue/VEL-12", "state": { "id": "…", "name": "In Progress", "type": "started", "color": "#f2c94c" },
  "assignee": "Vidar", "updatedAt": "2026-10-30T09:12:00+00:00"
}
```

`priority`: 0 = ingen, 1 = brådskande, 2 = hög, 3 = medel, 4 = låg.

`POST /api/linear/issues` med `{ "teamId": "…", "title": "…", "description": "…", "priority": 3, "stateId": null }` → `201` + `LinearIssue`. Bara `teamId` och `title` krävs; utan `stateId` hamnar storyn i teamets standardstatus. `400` om titel eller team saknas eller `priority` ligger utanför 0–4, `404` om teamet inte finns.

`PATCH /api/linear/issues/{id}` med `{ "stateId": "…" }` → den uppdaterade `LinearIssue`. Flyttar storyn till en annan status i sitt team, till exempel när du drar kortet till en annan kolumn. `400` om `stateId` saknas, `404` om storyn inte finns.

`502` om Linear svarar med ett fel (t.ex. en ogiltig nyckel).

## Artefakter

`GET /api/artifacts?group=Yagi` → `Artifact[]` – `{ "id": "…", "title": "…", "url": "https://claude.ai/artifact/…", "kind": "plan", "group": "Spel", "updatedAt": "2026-10-26" }`

`kind` styr miniatyren: `doc`, `plan`, `map`, `screen`, `web`, `logo`, `system`, `spike`, `icon`. `group`: `Veloq`, `Yagi`, `Jobb`, `Spel` eller `Övrigt`.

Listan kommer från din claude.ai. Choren `sync-artifacts` (rutinen `artifact-sync`) hämtar dina artefakter genom Claude Code och låter den sätta `kind` och `group` utifrån titeln; en artefakt som redan finns behåller sina. Resultatet sparas i `artifacts.json` under `Veloq:DataFolder` (standard `VeloqOS` under appdata) och läses därifrån. Innan första synken visas exempellistan.

## Röst

Röstassistenten i mitten av dashboarden. Du pratar (eller skriver), API:t låter Claude svara med verktyg som går mot samma tjänster som resten av API:t, och svaret läses upp. Kedjan är tal till text, sedan Claude med verktyg och sist text till tal.

`GET /api/voice` → vad som är igång.

```json
{ "agent": "claude", "model": "claude-sonnet-5-5", "speech": { "listen": "deepgram", "speak": "elevenlabs" }, "voiceId": "…" }
```

| Fält | Betydelse |
|---|---|
| `agent` | `claude` när `Voice:AnthropicApiKey` är satt, annars `claude-code` när Claude Code finns på datorn (din inloggade subscription, ingen nyckel behövs), annars `sample`: en enkel agent som känner igen nyckelord och kör samma verktyg |
| `model` | Modellen som svarar (`Voice:Model`), `null` för `sample` |
| `speech.listen` | `deepgram` när `Voice:DeepgramApiKey` är satt, annars `browser` (webbläsarens egen taligenkänning) |
| `speech.speak` | `elevenlabs` när `Voice:ElevenLabsApiKey` är satt, annars `browser` (webbläsarens egna röster) |
| `voiceId` | ElevenLabs-rösten (`Voice:ElevenLabsVoiceId`), `null` utan ElevenLabs |

Nycklarna ligger i `dotnet user-secrets`:

```bash
dotnet user-secrets --project src/VeloqOS.Api set "Voice:AnthropicApiKey" "sk-ant-…"
dotnet user-secrets --project src/VeloqOS.Api set "Voice:ElevenLabsApiKey" "…"
dotnet user-secrets --project src/VeloqOS.Api set "Voice:ElevenLabsVoiceId" "…"
dotnet user-secrets --project src/VeloqOS.Api set "Voice:DeepgramApiKey" "…"
```

Med `claude-code` håller API:t en `claude`-process igång i bakgrunden så länge det körs, och startar om den om den dör. Processen har inga egna verktyg, bara röstens verktyg över MCP, och läser inte dina inställningar, hooks eller din `CLAUDE.md`. En stillastående process drar ingen användning; varje replik räknas mot din subscription. Claude API:t (`claude`) är kvar som alternativ och svarar snabbare. Modellen väljs med `Voice:Model` (standard `claude-sonnet-5-5`; `claude-haiku-5-5` svarar snabbare).

### En replik

`POST /api/voice/turn`

```json
{ "text": "Lägg till en story om röstläget i Linear", "history": [ { "role": "user", "text": "…" }, { "role": "assistant", "text": "…" } ],
  "persona": { "id": "rick", "cynism": 70, "burps": 40 } }
```

→

```json
{ "reply": "Klart. VEL-151 ligger i backloggen. *rap* Försök hålla den vid liv den här gången.",
  "actions": [ { "tool": "create_issue", "tile": "linear", "summary": "Skapade VEL-151 · Röstläget i Veloq OS", "ok": true } ],
  "confirm": null }
```

| Fält | Betydelse |
|---|---|
| `history` | tidigare repliker i samtalet, äldst först (högst 20 används). Valfri |
| `persona.id` | `rick` (cynisk geni-vetenskapsman, standard) eller `neutral` (saklig assistent) |
| `persona.cynism` | 0–100, hur mycket spydighet som får finnas i svaret |
| `persona.burps` | 0–100, hur ofta `*rap*` får förekomma. Klienterna visar och spelar den som en paus, den läses aldrig upp |
| `actions[].tile` | panelen som verktyget rörde: `overview`, `calendar`, `inbox`, `linear`, `disk`, `artifacts`, `skills` eller `projects`. Dashboarden drar en stråle dit och laddar om den |
| `confirm` | satt när något väntar på ditt ok: `{ "jobId": "…", "label": "Rensa valda", "choices": [JobChoice] }`. Godkänn med `POST /api/jobs/{jobId}/confirm` som vanligt; rösten kan aldrig själv godkänna något som tar bort filer |

Verktygen Claude har:

| Verktyg | Gör |
|---|---|
| `get_overview` | siffrorna i statusraden, ledigt diskutrymme och dagens möten |
| `list_events` | kalendern för en dag |
| `create_event` | lägger in en händelse |
| `list_inbox` | mejlen som behöver dig |
| `clear_noise` | arkiverar allt med taggen `Brus` |
| `list_issues` | öppna stories för ett team (nyckeln, till exempel `VEL`) |
| `create_issue` | ny story i ett team |
| `scan_disk` | startar `disk-cleanup` och väntar på förslaget, som hamnar i `confirm` |
| `run_skill` | kör en chore eller skill som inte tar något projekt |
| `list_artifacts` | de senaste artefakterna |
| `project_status` | git, PR:er och CI per projekt |

`400` om texten är tom. `502` om Claude svarar med ett fel, `504` om det tar mer än 60 sekunder.

### Tal

`POST /api/voice/mcp` är röstens verktyg som MCP-server (JSON-RPC över HTTP) för `claude`-processen. Den är intern: anropet kräver headern `X-Voice-Token` med en nyckel som API:t slumpar vid varje start, annars `401`. Verktyg går bara att köra medan en replik pågår.

`POST /api/voice/speak` med `{ "text": "…" }` → `audio/mpeg` från ElevenLabs med rösten `Voice:ElevenLabsVoiceId`. `*rap*` tas bort innan texten skickas. `409` utan ElevenLabs, `400` om texten är tom.

`POST /api/voice/transcribe` med ljudet som kropp (`audio/webm` eller `audio/wav`, högst 10 MB) → `{ "text": "…" }` från Deepgram på svenska. `409` utan Deepgram, `400` om kroppen är tom.
