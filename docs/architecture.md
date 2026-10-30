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
  - `IAgent` → `EchoAgent` nu, Claude senare.
  - `IInboxProvider` → `SampleInboxProvider` nu, Gmail senare.
  - `ICalendarProvider` → `SampleCalendarProvider` nu, Google senare.
- **Data** (`Data/SampleData.cs`): projekt, chores, rutiner och artefakter. Flyttas till en fil eller SQLite när de ska kunna redigeras.

Allt tillstånd ligger i minnet i första versionen (singletons). Det räcker för en personlig tjänst på en dator; byt till SQLite när något måste överleva omstarter.

## Klienterna

- **Webben** (variant C): rail till vänster, statusrad, orbit med projekt runt chores, tidslinje, jobb, snabbprompt, kalender och artefakthylla. Inkorgen öppnas som en tvåpanelsvy med actions.
- **Telefonen** (variant A): fem flikar (Hem, Prompt, Projekt, Inkorg, Mer). Hem har prompt, kalender, pågående jobb, chores och de viktigaste mejlen.

- **Mac-appen** (`desktop/`, Tauri 2): samma webbbygge i ett eget fönster. Appen väljer port som `start.sh` (återanvänder ett Veloq-API på 7480, annars första lediga), startar API:t som en sidecar-fil byggd med `dotnet publish --self-contained` och berättar adressen för webben via `window.__VELOQ_API_BASE__`. Ursprunget `tauri://localhost` finns i `Veloq:WebOrigins`.

Alla läser samma endpoints; ingen affärslogik dupliceras i klienterna utöver presentation.

## Åtkomst från telefonen

API:t lyssnar på `0.0.0.0:7480`. Enklast och säkrast är Tailscale (eller liknande) mellan telefon och dator, plus `Auth:ApiKey`. Exponera aldrig API:t mot internet utan nyckel.

## Vägen framåt

1. Claude på riktigt: `IAgent` med Agent SDK, streaming över SSE, kontext från projektens `CLAUDE.md`.
2. Google OAuth på datorn → `GmailInboxProvider` och `GoogleCalendarProvider`.
3. Chores som riktiga skript/agentkörningar, schemalagda rutiner via `BackgroundService`.
4. SQLite för tillstånd, push till telefonen när jobb blir klara.
