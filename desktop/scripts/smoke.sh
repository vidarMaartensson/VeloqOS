#!/usr/bin/env bash
#
# Röktest av den byggda Mac-appen: startar Veloq OS.app, väntar på att API:t svarar
# och att fönstret finns, och stänger sedan appen och kollar att API:t stängs med den.
# Kör efter `npm run build`. Använder port 7490 (VELOQ_API_PORT) så att ett API från start.sh får vara kvar.

set -uo pipefail

DESKTOP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$DESKTOP/src-tauri/target/release/bundle/macos/Veloq OS.app"
fail() { echo "✗ $*" >&2; [[ -n "${PID:-}" ]] && kill "$PID" 2>/dev/null; exit 1; }
healthy() { curl -fsS "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -q '"status":"ok"'; }

[[ -d "$APP" ]] || fail "Hittar inte $APP – kör npm run build först"
PORT="${VELOQ_API_PORT:-7490}"
healthy "$PORT" && fail "Ett Veloq-API kör redan på :$PORT – välj en annan port med VELOQ_API_PORT"

VELOQ_API_PORT="$PORT" "$APP/Contents/MacOS/veloq-os" >/dev/null 2>&1 &
PID=$!

for _ in $(seq 1 30); do healthy "$PORT" && break; sleep 1; done
healthy "$PORT" || fail "API:t svarade inte på :$PORT"
echo "✓ appen startade API:t på :$PORT"

curl -fsS -H "Origin: tauri://localhost" -D - -o /dev/null http://127.0.0.1:$PORT/api/overview \
    | grep -qi '^access-control-allow-origin: tauri://localhost' || fail "CORS släpper inte igenom tauri://localhost"
echo "✓ CORS tillåter appens ursprung"

windows="$(osascript -e 'tell application "System Events" to count windows of (first process whose unix id is '"$PID"')' 2>/dev/null || echo "?")"
if [[ "$windows" == "?" ]]; then
    echo "! kunde inte räkna fönster (Terminal saknar Hjälpmedel-behörighet) – hoppar över"
elif [[ "$windows" -ge 1 ]]; then
    echo "✓ fönstret är öppet"
else
    fail "inget fönster öppnades"
fi

kill -TERM "$PID"
for _ in $(seq 1 10); do healthy "$PORT" || break; sleep 1; done
healthy "$PORT" && fail "API:t lever kvar efter att appen stängts"
echo "✓ API:t stängdes med appen"
