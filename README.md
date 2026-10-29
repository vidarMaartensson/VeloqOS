# Veloq OS

Ett personligt operativsystem runt Claude: en dashboard på datorn för det dagliga promptandet och byggandet, och en Android-app som når samma funktioner från telefonen. Byggt i Veloq Labs design system.

```
web/       Dashboard (React + Vite + TypeScript) – variant C, "Orbit-dashboard"
api/       Backend (.NET 10 minimal API) – projekt, chores, jobb, rutiner, inkorg, kalender, artefakter, prompt
android/   Telefonappen (Kotlin + Jetpack Compose) – variant A, "Klassisk"
docs/      Arkitektur, API-kontrakt och designbeslut
```

Datorn är hjärnan: API:t kör där (eller på en liten server) och pratar med Claude, Gmail och Google Kalender. Webben och telefonen är två klienter mot samma API.

## Kom igång

Snabbast – kör testerna, startar API och dashboard och installerar appen på telefonen (USB):

```bash
bash scripts/start.sh
```

Manuellt:

Krav: .NET 10 SDK, Node 22+, Android Studio (AGP 9.4, JDK 17+).

```bash
# 1. API:t – http://localhost:5080
cd api && dotnet run --project src/VeloqOS.Api

# 2. Dashboarden – http://localhost:5173 (proxar /api till 5080)
cd web && npm install && npm run dev

# 3. Telefonappen – bygg, installera och starta på enhet/emulator
cd android && ./dev
```

Emulatorn når datorn på `http://10.0.2.2:5080` (förvalt). På en riktig telefon anger du datorns adress i appens inställningar, till exempel via Tailscale.

## Första gången på en ny dator

```bash
chmod +x android/gradlew android/dev android/.maestro/run.sh
cd web && npm install            # skapar package-lock.json – checka in den
```

Lägg Space Grotesk och JetBrains Mono som TTF i `android/app/src/main/res/font/` och byt `Sans`/`Mono` i `ui/theme/Theme.kt` (webben laddar dem från Google Fonts).

## Tester

```bash
cd api && dotnet test                     # xUnit: enhets- och integrationstester
cd web && npm test && npm run e2e         # Vitest + Playwright
cd android && ./gradlew testDebugUnitTest # JUnit
cd android && ./.maestro/run.sh           # Maestro UI-flöden på enhet
```

CI (`.github/workflows/ci.yml`) kör alla tre på varje push och PR, men bara för de delar som ändrats.

Playwright mockar API:t och kör med reducerad rörelse (orbarna svävar annars hela tiden). Maestro kör mot det riktiga API:t; starta om API:t mellan körningar eftersom kalendern och inkorgen ligger i minnet.

## Läge just nu

Första skelettet. Allt går att klicka i, men datan är exempeldata bakom gränssnitt som byts mot riktiga integrationer:

| Del | Nu | Nästa steg |
|---|---|---|
| Prompt | `EchoAgent` svarar med en plan-först-text | Claude via Agent SDK eller Messages API |
| Inkorg | `SampleInboxProvider` | Gmail API (OAuth) |
| Kalender | `SampleCalendarProvider`, "inte ansluten" tills du ansluter | Google Calendar API (OAuth) |
| Chores och jobb | Simulerade jobb med förlopp | Riktiga körningar på datorn |
| Artefakter | Statisk lista med dina länkar | Synk från claude.ai |

Se `docs/architecture.md` för helheten och `docs/api.md` för kontraktet mellan klienterna och API:t.
