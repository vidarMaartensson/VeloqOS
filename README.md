# Veloq OS

Ett personligt operativsystem runt Claude: en röststyrd dashboard på datorn för vardagen runt byggandet, och en Android-app som når samma funktioner från telefonen. Byggt i Veloq Labs design system.

```
web/       Dashboard (React + Vite + TypeScript + GSAP) – röstassistenten i mitten, paneler runt
api/       Backend (.NET 10 minimal API) – projekt, chores, jobb, rutiner, inkorg, kalender, artefakter, röst
android/   Telefonappen (Kotlin + Jetpack Compose) – variant A, "Klassisk"
desktop/   Mac-appen (Tauri 2) – dashboarden i eget fönster, startar API:t själv
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
# 1. API:t – http://localhost:7480
cd api && dotnet run --project src/VeloqOS.Api

# 2. Dashboarden – http://localhost:7470 (proxar /api till 7480)
cd web && npm install && npm run dev

# 3. Telefonappen – bygg, installera och starta på enhet/emulator
cd android && ./dev
```

Emulatorn når datorn på `http://10.0.2.2:7480` (förvalt). På en riktig telefon anger du datorns adress i appens inställningar, till exempel via Tailscale.

## Mac-appen

`desktop/` paketerar dashboarden som `Veloq OS.app` med Tauri. Appen startar ett inbyggt API när den öppnas och stänger det när du avslutar. Kör redan ett Veloq-API på :7480 (till exempel via `start.sh`) används det i stället. API-loggen hamnar i `~/Library/Logs/com.vidarmartensson.veloqos/api.log`.

Krav utöver ovan: Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`).

```bash
cd desktop && npm install
npm run dev     # fönster mot Vite på :7470, med hot reload
npm run build   # src-tauri/target/release/bundle/macos/Veloq OS.app och en .dmg
npm test        # Rust-enhetstester (portval, hälsokoll)
npm run smoke   # startar den byggda appen och kollar API, CORS och fönster
```

Appen är bara ad hoc-signerad. Första gången öppnar du den med högerklick → Öppna. Telefonen når API:t så länge appen (eller `start.sh`) är igång.

## Gmail och Google Kalender

Utan Google-nycklar visar API:t exempeldata. Så kopplar du in ditt riktiga konto:

1. Skapa ett projekt på [console.cloud.google.com](https://console.cloud.google.com) och aktivera **Gmail API** och **Google Calendar API**.
2. OAuth consent screen: External, lägg till dig själv som testanvändare. Byt till "In production" (utan verifiering) om du inte vill logga in igen var sjunde dag.
3. Credentials → Create OAuth client ID → **Desktop app**.
4. Spara nycklarna (de läses även av API:t inuti Mac-appen):

```bash
cd api && dotnet user-secrets --project src/VeloqOS.Api set Google:ClientId "…" && dotnet user-secrets --project src/VeloqOS.Api set Google:ClientSecret "…"
```

5. Starta om API:t och tryck **Anslut Google** i kalenderkortet. Inloggningen öppnas i webbläsaren; en inloggning ger både inkorg och kalender.

### Claude och Linear

Chores, skills och morgonbriefen kör Claude Code på datorn (`claude -p`) med samma inloggning som Claude Code-appen, alltså din subscription. Prompta gör du i Claude Code, inte i Veloq OS.

Linear: skapa en personlig nyckel under Settings → Security & access i varje workspace och spara dem. Teamen från alla workspaces visas tillsammans, grupperade per workspace.

```bash
cd api && dotnet user-secrets --project src/VeloqOS.Api set "Linear:ApiKeys:0" "lin_api_…"
```

```bash
cd api && dotnet user-secrets --project src/VeloqOS.Api set "Linear:ApiKeys:1" "lin_api_…"
```

### Projekt, CI och rutiner

- **Git och CI:** branch, ocommittade filer och opushade commits läses direkt ur repona. PR:er och GitHub Actions hämtas med `gh`, med samma inloggning som i terminalen (`gh auth login`). Utan `gh` visas bara git-delen.
- **Linear-team:** projekten kopplas till sina team i projektdatan, till exempel Veloq OS → `VEL`. Byt med `dotnet user-secrets --project src/VeloqOS.Api set "Veloq:LinearTeams:veloq-os" "NYCKEL"`, eller använd en tom sträng för att ta bort kopplingen.
- **Rutiner:** de körs på sina tider när API:t är igång. Har datorn sovit körs de när den vaknar, om det är högst tre timmar sedan. Morgonbriefen skrivs vardagar 07:40, och artefakthyllan synkas från claude.ai 07:30.
- **Notiser:** telefonen frågar API:t ungefär var 15:e minut och visar en notis när ett jobb eller en brief blivit klar. Inget går via någon extern tjänst.

### Chores och skills

Chores och dina egna skills (allt i `~/.claude/skills`) körs på riktigt via Claude Code, under **Skills** i menyn på webben och under **Mer** på telefonen. De körs obevakade med `--permission-mode auto`; ändra med `Claude:ChorePermissionMode`. **Rensa cache** och **Oanvända paket** ändrar ingenting förrän du bockat i vad som ska bort i jobbet.

Svar som skickas från Veloq OS går iväg direkt och kan inte ångras. Arkivera, snooza och etiketter (`Veloq/…`) går att ångra.

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
| Linear | `LinearProvider` med nycklar, annars exempelstories; stories per projekt | Ändra status på en story |
| Inkorg | `SampleInboxProvider` | Gmail API (OAuth) |
| Kalender | `SampleCalendarProvider`, "inte ansluten" tills du ansluter | Google Calendar API (OAuth) |
| Chores, skills och rutiner | Riktiga körningar via Claude Code, rensa cache i API:t, rutiner på schema, notiser på telefonen | SQLite så att jobb och rutiner överlever en omstart |
| Projekt | Git, PR:er och CI per repo via `git` och `gh` | Granskningskö för PR:er |
| Artefakter | Synkas från claude.ai varje morgon eller med knappen | – |

Se `docs/architecture.md` för helheten och `docs/api.md` för kontraktet mellan klienterna och API:t.
