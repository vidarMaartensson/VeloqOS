# CLAUDE.md – Veloq OS

Instruktioner för Claude (och andra agenter) som jobbar i det här repot.

## Arbetssätt

- **Plan först.** Beskriv planen och fråga innan du ändrar något större. Lös steg för steg.
- **Fråga hellre än gissa** när ett krav är oklart.
- **Tester till allt.** Ny logik får enhetstester; nya flöden får ett e2e-test (Playwright för webben, Maestro för Android, integrationstest för API:t).
- **Kontraktet först.** Ändras ett endpoint: uppdatera `docs/api.md` först, sedan API, webb och Android i samma ändring.
- Kör testerna för den del du rört innan du säger att något är klart.

## Struktur

| Mapp | Stack | Kommandon |
|---|---|---|
| `api/` | .NET 10 minimal API, xUnit | `dotnet run --project src/VeloqOS.Api`, `dotnet test` |
| `web/` | React 19 + Vite + TypeScript, Vitest, Playwright | `npm run dev`, `npm test`, `npm run e2e`, `npm run build` |
| `android/` | Kotlin + Compose, AGP 9.4, JUnit, Maestro | `./dev`, `./gradlew testDebugUnitTest`, `./.maestro/run.sh` |
| `desktop/` | Tauri 2 (Rust) runt `web/` + API:t som sidecar | `npm run dev`, `npm test`, `npm run build`, `npm run smoke` |

## Arkitektur i korthet

- API:t äger all data och all kontakt med omvärlden (Claude, Gmail, Google Kalender). Klienterna pratar bara med API:t.
- Varje integration ligger bakom ett interface i `api/src/VeloqOS.Api/Integrations/` (`IAgent`, `IVoiceAgent`, `IInboxProvider`, `ICalendarProvider`, `ILinearProvider`). Exempel-implementationerna heter `Sample…`/`Echo…`; riktiga implementationer registreras i `Program.cs` när de finns.
- Tid går genom `TimeProvider` så att jobb och kalender kan testas deterministiskt.
- Telefonen autentiserar med headern `X-Veloq-Key` (se `Auth:ApiKey` i `appsettings`). Tom nyckel = ingen kontroll (bara för lokal utveckling).

## Design

Allt UI följer Veloq Labs design system (tokens i `web/src/styles/tokens.css` och `android/app/src/main/java/.../ui/theme/`).

- Bara mörkt läge. En accent (`#3DF2C6`) per vy: primärknapp, aktivt läge, eyebrow, fokusring, små prickar.
- Kanter i stället för skuggor. Kort `radius 28`, allt tryckbart är piller (min 44 px/dp).
- Rörelse med fjädrar och överslag; respektera `prefers-reduced-motion` / systemets animationsinställning.
- Ingen emoji, ingen gradient, inga Inter/Roboto. Space Grotesk + JetBrains Mono.
- Text: svenska i gränssnittet, rubriker som hela meningar med punkt, etiketter i versaler mono med ` · ` mellan delar, tankstreck med mellanslag ( – ), aldrig långt tankstreck.
- Webben är röstdashboarden (portalen i mitten, GSAP-paneler runt), telefonen variant A (klassisk med kalender). Prototyperna finns i Design-canvasen "Veloq OS" på claude.ai.

## Får inte

- Checka in hemligheter (OAuth-klienter, API-nycklar). Använd `dotnet user-secrets` och `local.properties`.
- Lägga affärslogik i klienterna som API:t borde äga.
- Ta bort eller skriva om tester för att få dem gröna utan att förklara varför.
