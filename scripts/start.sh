#!/usr/bin/env bash
#
# Veloq OS – kör testerna och startar allt:
#   1. git-repot (första gången)
#   2. tester för api, web och android (loggar i .logs/)
#   3. API:t på :5080 och dashboarden på :5173 (öppnas i webbläsaren)
#   4. appen på en ansluten Android-telefon via USB, med `adb reverse` så att telefonen når API:t
#
#   bash scripts/start.sh               # allt
#   bash scripts/start.sh --skip-tests  # hoppa över testerna
#
# Ctrl-C stoppar API:t och dashboarden. Fungerar med macOS bash 3.2.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"
SUMMARY="$LOGS/summary.txt"
: > "$SUMMARY"

SKIP_TESTS=false
[[ "${1:-}" == "--skip-tests" ]] && SKIP_TESTS=true

if [[ -t 1 ]]; then
    B=$'\033[1m'; D=$'\033[2m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; X=$'\033[0m'
else
    B=""; D=""; R=""; G=""; Y=""; C=""; X=""
fi
step() { printf '\n%s==>%s %s%s%s\n' "$C" "$X" "$B" "$*" "$X"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$X" "$*"; echo "OK    $*" >> "$SUMMARY"; }
bad()  { printf '  %s✗%s %s\n' "$R" "$X" "$*"; echo "FAIL  $*" >> "$SUMMARY"; }
note() { printf '  %s!%s %s\n' "$Y" "$X" "$*"; echo "NOTE  $*" >> "$SUMMARY"; }

PIDS=""
cleanup() {
    printf '\n%sStoppar Veloq OS…%s\n' "$D" "$X"
    for pid in $PIDS; do kill "$pid" 2>/dev/null; done
    [[ -n "${SERIAL:-}" ]] && "$ADB" -s "$SERIAL" reverse --remove tcp:5080 >/dev/null 2>&1
    exit 0
}
trap cleanup INT TERM

# ---------------------------------------------------------------------------
step "Förbereder"
# ---------------------------------------------------------------------------

[[ -d "$ROOT/.git" ]] || bash "$ROOT/scripts/init-repo.sh" | sed 's/^/  /'
chmod +x "$ROOT/android/gradlew" "$ROOT/android/dev" "$ROOT/android/.maestro/run.sh" "$ROOT/scripts/"*.sh 2>/dev/null

# Java for Gradle: prefer JAVA_HOME, else Android Studio's bundled JBR.
if [[ -z "${JAVA_HOME:-}" ]]; then
    for jbr in "/Applications/Android Studio.app/Contents/jbr/Contents/Home" "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
        [[ -d "$jbr" ]] && export JAVA_HOME="$jbr" && break
    done
fi

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$(command -v adb || echo "$SDK/platform-tools/adb")"

missing=false
command -v dotnet >/dev/null || { bad "dotnet saknas – installera .NET 10 SDK: brew install --cask dotnet-sdk"; missing=true; }
command -v npm >/dev/null    || { bad "npm saknas – installera Node 22: brew install node@22"; missing=true; }
[[ -x "$ADB" ]]              || note "adb hittades inte ($ADB) – telefonsteget hoppas över"
[[ -n "${JAVA_HOME:-}" ]] || command -v java >/dev/null || note "Ingen Java hittades – Android-bygget kan misslyckas (installera Android Studio)"
$missing && { printf '\nInstallera det som saknas och kör igen.\n'; exit 1; }

ok "dotnet $(dotnet --version), node $(node --version)${JAVA_HOME:+, Java från $JAVA_HOME}"

# ---------------------------------------------------------------------------
step "Installerar webbens beroenden"
# ---------------------------------------------------------------------------

if (cd "$ROOT/web" && npm install --no-audit --no-fund) > "$LOGS/web-install.log" 2>&1; then
    ok "npm install"
else
    bad "npm install – se .logs/web-install.log"
fi

# ---------------------------------------------------------------------------
if ! $SKIP_TESTS; then
step "Kör testerna"
# ---------------------------------------------------------------------------
    run_test() { # name, log, dir, command…
        local name="$1" log="$2" dir="$3"; shift 3
        printf '  %s…%s %s' "$D" "$X" "$name"
        if (cd "$dir" && "$@") > "$LOGS/$log" 2>&1; then
            printf '\r'; ok "$name"
        else
            printf '\r'; bad "$name – se .logs/$log"
        fi
    }
    run_test "API: dotnet test" api-test.log "$ROOT/api" dotnet test VeloqOS.slnx
    run_test "Webb: typkontroll" web-typecheck.log "$ROOT/web" npx tsc --noEmit
    run_test "Webb: vitest" web-test.log "$ROOT/web" npm test
    run_test "Android: enhetstester" android-test.log "$ROOT/android" ./gradlew testDebugUnitTest --console=plain
fi

# ---------------------------------------------------------------------------
step "Startar API:t"
# ---------------------------------------------------------------------------

if curl -fsS http://localhost:5080/api/health >/dev/null 2>&1; then
    note "Något kör redan på :5080 – använder det"
else
    (cd "$ROOT/api" && exec dotnet run --project src/VeloqOS.Api) > "$LOGS/api.log" 2>&1 &
    PIDS="$PIDS $!"
    for _ in $(seq 1 90); do
        curl -fsS http://localhost:5080/api/health >/dev/null 2>&1 && break
        sleep 1
    done
    if curl -fsS http://localhost:5080/api/health >/dev/null 2>&1; then
        ok "API på http://localhost:5080"
    else
        bad "API:t startade inte – se .logs/api.log"
    fi
fi

# ---------------------------------------------------------------------------
step "Startar dashboarden"
# ---------------------------------------------------------------------------

(cd "$ROOT/web" && exec npx vite --host --port 5173 --strictPort) > "$LOGS/web.log" 2>&1 &
PIDS="$PIDS $!"
for _ in $(seq 1 60); do
    curl -fsS http://localhost:5173 >/dev/null 2>&1 && break
    sleep 1
done
if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
    ok "Dashboard på http://localhost:5173"
    open "http://localhost:5173" 2>/dev/null
else
    bad "Dashboarden startade inte – se .logs/web.log"
fi

# ---------------------------------------------------------------------------
step "Installerar appen på telefonen"
# ---------------------------------------------------------------------------

SERIAL=""
if [[ -x "$ADB" ]]; then
    "$ADB" start-server >/dev/null 2>&1
    "$ADB" devices -l > "$LOGS/adb-devices.log" 2>&1
    # First real device (not an emulator) in state "device".
    SERIAL="$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
    UNAUTHORIZED="$("$ADB" devices | awk 'NR>1 && $2=="unauthorized" {print $1; exit}')"

    if [[ -z "$SERIAL" ]]; then
        if [[ -n "$UNAUTHORIZED" ]]; then
            note "Telefonen syns men är inte godkänd – tryck Tillåt på USB-felsökningsfrågan på telefonen och kör igen"
        else
            note "Ingen telefon hittades. Anslut S26:an med USB, slå på USB-felsökning och stäng av Auto Blocker (Inställningar → Säkerhet och integritet → Auto Blocker)"
        fi
    else
        MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
        if "$ADB" -s "$SERIAL" reverse tcp:5080 tcp:5080 >/dev/null 2>&1; then
            ok "adb reverse :5080 → datorn ($MODEL)"
        else
            bad "adb reverse misslyckades"
        fi
        if (cd "$ROOT/android" && ANDROID_SERIAL="$SERIAL" ./gradlew :app:installDebug --console=plain) > "$LOGS/android-install.log" 2>&1; then
            "$ADB" -s "$SERIAL" shell am start -n com.vidarmartensson.veloqos/.MainActivity >/dev/null 2>&1
            ok "Veloq OS installerad och startad på $MODEL"
        else
            bad "Android-bygget/installationen misslyckades – se .logs/android-install.log"
        fi
    fi
fi

# ---------------------------------------------------------------------------
printf '\n%sSammanfattning%s (sparad i .logs/summary.txt)\n' "$B" "$X"
cat "$SUMMARY" | sed 's/^/  /'
if [[ -n "$PIDS" ]]; then
    printf '\n%sVeloq OS kör. Ctrl-C för att stoppa.%s\n' "$G" "$X"
    wait
fi
