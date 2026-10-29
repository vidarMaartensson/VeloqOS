# API-kontrakt

Bas: `http://<dator>:5080/api`. JSON med camelCase. Alla tider i ISO 8601 med offset.

Om `Auth:ApiKey` är satt måste varje anrop (utom `/api/health`) skicka `X-Veloq-Key: <nyckel>`, annars `401`.

## Hälsa

`GET /api/health` → `{ "status": "ok", "version": "0.1.0" }`

## Översikt

`GET /api/overview` → siffrorna i dashboardens statusrad.

```json
{ "projects": 11, "activeProjects": 3, "runningJobs": 2, "inboxNeedsYou": 4, "routinesOn": 3, "routinesTotal": 4, "artifacts": 24 }
```

## Projekt

`GET /api/projects` → `Project[]`

```json
{ "id": "halodeck", "name": "HaloDeck", "meta": "Docka · Android", "status": "I utveckling", "tier": 3, "body": "…", "group": "Appar" }
```

`tier`: 3 = aktiv (stor orb med satellit), 2 = planerad, 1 = vilande.

## Chores och jobb

`GET /api/chores` → `Chore[]` – `{ "id": "memory-cleanup", "name": "Städa minnet", "description": "…", "icon": "memory", "estimate": "≈ 1 min" }`

`POST /api/chores/{id}/run` → `202 Accepted` + `Job`. `404` om choren inte finns.

`GET /api/jobs` → `Job[]` (senaste först)

```json
{ "id": "…", "title": "Städa minnet", "step": "Kör…", "progress": 0.42, "status": "running", "startedAt": "…", "result": null }
```

`status`: `running` | `done`. `progress` 0–1. När ett jobb är klart sätts `result` till en kort mening.

## Rutiner

`GET /api/routines` → `Routine[]` – `{ "id": "morning-brief", "name": "Morgonbrief", "schedule": "Vardagar · 07:40", "description": "…", "enabled": true }`

`PUT /api/routines/{id}` med `{ "enabled": false }` → uppdaterad `Routine`.

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

`DELETE /api/inbox/{id}/actions` → ångra, `handledWith` blir `null`.

`POST /api/inbox/clear-noise` → arkiverar allt med taggen `Brus`, returnerar antal.

## Kalender

`GET /api/calendar?date=2026-10-29` → `{ "connected": false, "events": [] }` tills kalendern är ansluten.

`POST /api/calendar/connect` → startar anslutning (exempel-providern ansluter direkt; Google returnerar en OAuth-URL i `authUrl`).

`CalendarEvent`: `{ "id": "…", "title": "…", "start": "…", "end": "…", "location": "…", "suggested": false }`

`POST /api/calendar/suggestions/{id}/book` → bokar ett förslag från Veloq OS, returnerar eventet med `suggested: false`.

## Artefakter

`GET /api/artifacts?group=Yagi` → `Artifact[]` – `{ "id": "…", "title": "…", "url": "https://claude.ai/artifact/…", "kind": "plan", "group": "Spel", "updatedAt": "2026-10-26" }`

`kind` styr miniatyren: `doc`, `plan`, `map`, `screen`, `web`, `logo`, `system`, `spike`, `icon`.

## Prompt

`POST /api/prompt` med `{ "text": "…", "context": "HaloDeck" }` → `{ "reply": "…" }`

Senare: streaming via `GET /api/prompt/stream` (Server-Sent Events).
