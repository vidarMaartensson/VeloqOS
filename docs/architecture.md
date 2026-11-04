# Arkitektur

```
 ┌──────────────┐        ┌───────────────────────────────┐        ┌──────────────────┐
 │ web/ (React) │──HTTP──▶                               │──────▶ │ Claude (Agent SDK │
 └──────────────┘        │  api/ (.NET 10, på datorn)    │        │ / Messages API)  │
 ┌──────────────┐        │                               │──────▶ │ Gmail API        │
 │ android/     │──HTTP──▶  Endpoints → Services →       │──────▶ │ Google Calendar  │
 │ (Compose)    │ X-Veloq│  Integrations (interfaces)    │        └──────────────────┘
 └──────────────┘  -Key  └───────────────────────────────┘
```

## Lager i API:t

- **Endpoints** (`Endpoints/*.cs`): tunna minimal-API-grupper, en per område. Validerar och mappar till HTTP.
- **Services** (`Services/*.cs`): tillstånd och regler, till exempel `JobService` (förlopp utifrån `TimeProvider`), `InboxService` (actions, ångra, räkna det som behöver dig), `RoutineService`.
- **Integrations** (`Integrations/*.cs`): gränssnitt mot omvärlden. Byt implementation i `Program.cs`.
  - `IVoiceAgent` → `ClaudeVoiceAgent` (Claude API med verktyg, `Voice:AnthropicApiKey`) när nyckeln finns, annars `ClaudeCodeVoiceAgent` (en `claude`-process på din subscription som hålls igång av `VoiceKeepAlive` och når verktygen via `VoiceMcpServer`) när Claude Code finns, annars `SampleVoiceAgent` (nyckelord). Verktygen i `VoiceToolbox` går mot samma tjänster som endpointsen; inget som tar bort filer körs utan ditt ok. `SpeechProvider` talar via ElevenLabs och lyssnar via Deepgram när nycklarna finns, annars gör webbläsaren det.
  - `IAgent` → `ClaudeCodeAgent` (`claude -p` på datorn, din inloggning, ingen API-nyckel) när Claude Code finns, annars `EchoAgent`. Läget `chat` kör utan verktyg, `code` i projektets mapp under `Veloq:ProjectsRoot`.
  - `ILinearProvider` → `LinearProvider` (GraphQL, en `LinearClient` per nyckel i `Linear:ApiKeys`, teamen ihopslagna) när det finns nycklar, annars `SampleLinearProvider`.
  - `IInboxProvider` → `GmailInboxProvider` när Google är konfigurerat, annars `SampleInboxProvider`.
  - `ICalendarProvider` → `GoogleCalendarProvider` när Google är konfigurerat, annars `SampleCalendarProvider`.
  - `Integrations/Google/`: `GoogleAuth` (en OAuth-inloggning med PKCE för både Gmail och Kalender, refresh-token i `~/Library/Application Support/VeloqOS/google-token.json`), `GoogleClient` (REST-anrop), `GmailClassifier` (regler för Åtgärd/Svar/Info/Brus tills Claude tar över) och `GmailReply` (svar i samma tråd).
- **Chores och skills** (`Services/Chores/`): `ChoreCatalog` har de inbyggda chores och läser dina skills från `~/.claude/skills`. `JobService` kör dem i bakgrunden genom första `IChoreHandler` som tar dem: `DiskCleanupHandler` och `InboxChoreHandler` kör i API:t, `ClaudeChoreHandler` kör allt annat genom Claude Code med `Claude:ChorePermissionMode`. Jobb som föreslår ändringar (rensa cache, oanvända paket, CLAUDE.md) väntar på ditt val innan något ändras.
- **Rutiner** (`Services/RoutineService.cs`): `RoutineService` räknar ut nästa körning i `Veloq:TimeZone` och vilka rutiner som är förfallna. `RoutineScheduler` (en `BackgroundService`, avstängd i testerna) startar dem som jobb var trettionde sekund. Morgonbriefen (`BriefHandler`) samlar kalender, inkorg, stories och projektstatus och låter Claude skriva ihop den i chatt-läge.
- **Repon** (`Integrations/IRepoInspector.cs`): `RepoInspector` kör `git` och `gh` i projektens mappar; svaren från GitHub cachas en minut.
- **Artefakter** (`Services/ArtifactCatalog.cs`): hyllan läses från `artifacts.json` under `Veloq:DataFolder`. `ArtifactSyncHandler` fyller den genom Claude Codes verktyg `Artifact` (chatt-läge med just det verktyget).
- **Data** (`Data/SampleData.cs`): projekt med repomappar och Linear-team, rutiner med schema och exempelartefakter. Flyttas till en fil eller SQLite när de ska kunna redigeras.

Allt tillstånd ligger i minnet i första versionen (singletons). Det räcker för en personlig tjänst på en dator; byt till SQLite när något måste överleva omstarter.

## Klienterna

- **Webben** (röstdashboarden): rail till vänster, siffror överst och röstportalen i mitten (håll in för att prata, eller skriv). Runt den: kalendern som tidslinje (dra för att flytta), inkorgen som kortlek (svep), disken som bubblor (dra in i portalen för att välja), artefakter som karusell, Linear som kanban och skills som tangenter. När rösten använder ett verktyg drar portalen en stråle till panelen och läser om den. Under: morgonbrief, jobb och CI. Inkorgen och Linear öppnas också som hela vyer.
- **Telefonen** (variant A): fem flikar (Hem, Projekt, Inkorg, Linear, Mer). Hem har kalender, pågående jobb, chores och de viktigaste mejlen.

- **Mac-appen** (`desktop/`, Tauri 2): samma webbbygge i ett eget fönster. Appen väljer port som `start.sh` (återanvänder ett Veloq-API på 7480, annars första lediga), startar API:t som en sidecar-fil byggd med `dotnet publish --self-contained` och berättar adressen för webben via `window.__VELOQ_API_BASE__`. Ursprunget `tauri://localhost` finns i `Veloq:WebOrigins`. Tauri-kommandot `restart_api` (knappen "Starta om API:t" i dashboarden) stoppar det Veloq-API som håller porten – appens eget eller ett kvarlämnat – och startar en ny sidecar på samma port.

Alla läser samma endpoints; ingen affärslogik dupliceras i klienterna utöver presentation.

## Åtkomst från telefonen

API:t lyssnar på `0.0.0.0:7480`. Enklast och säkrast är Tailscale (eller liknande) mellan telefon och dator, plus `Auth:ApiKey`. Exponera aldrig API:t mot internet utan nyckel.

## Vägen framåt

1. ~~Claude på riktigt.~~ Klart via Claude Code (`claude -p`), med strömmande svar över SSE. Kvar: att godkänna kommandon i code-läget från dashboarden.
2. ~~Google OAuth på datorn → `GmailInboxProvider` och `GoogleCalendarProvider`.~~ Klart. Kvar: snoozade mejl tillbaka kl. 08:00 (schemalagt jobb) och att tacka ja till inbjudningar.
3. ~~Chores som riktiga agentkörningar och schemalagda rutiner.~~ Klart.
4. ~~Notiser till telefonen när jobb blir klara.~~ Klart: appen frågar API:t med WorkManager. Kvar: SQLite för jobb och rutiner.
